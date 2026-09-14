from __future__ import annotations

import os
import json
import subprocess
import asyncio
import hashlib
import shutil
from datetime import datetime
from pathlib import Path
from PIL import Image

# Register HEIC/HEIF support via pillow-heif if available
try:
    import pillow_heif
    pillow_heif.register_heif_opener()
except ImportError:
    pass

from database import get_connection, get_setting, get_thumbnails_dir
from vision import classify_frame, majority_vote_classify
from transcribe import transcribe_audio, transcribe_with_timestamps
from embeddings import store_embedding
from scripture import detect_scripture_refs

# CLIP classifier is lazy-imported to avoid startup crashes
_clip_cls_mod = None
def _get_clip_cls():
    global _clip_cls_mod
    if _clip_cls_mod is None:
        try:
            import clip_classify as _cc
            _clip_cls_mod = _cc
        except Exception:
            pass
    return _clip_cls_mod

# faces is lazy-imported inside ingest_folder so a missing opencv/cv2
# can never crash the backend at startup.
_faces_mod = None
def _get_faces():
    global _faces_mod
    if _faces_mod is None:
        try:
            import faces as _f
            _faces_mod = _f
        except Exception:
            pass
    return _faces_mod

MEDIA_EXTENSIONS = {
    '.mp4', '.mov', '.avi', '.mkv', '.m4v', '.wmv', '.flv',  # video
    '.jpg', '.jpeg', '.png', '.heic', '.heif', '.tiff', '.webp',  # photo
}
VIDEO_EXTENSIONS = {'.mp4', '.mov', '.avi', '.mkv', '.m4v', '.wmv', '.flv'}
PHOTO_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.heic', '.heif', '.tiff', '.webp'}

FFMPEG = os.environ.get('FFMPEG_PATH', 'ffmpeg')
FFPROBE = os.environ.get('FFPROBE_PATH', 'ffprobe')


def extract_taken_at(file_path: str, media_type: str) -> str | None:
    """Return ISO datetime string of when the photo/video was captured, or None."""
    ext = Path(file_path).suffix.lower()
    if media_type == 'photo':
        try:
            from PIL import Image as _PIL
            img = _PIL.open(file_path)
            exif = img._getexif() if hasattr(img, '_getexif') else None
            if exif:
                # 36867 = DateTimeOriginal, 36868 = DateTimeDigitized, 306 = DateTime
                for tag in (36867, 36868, 306):
                    val = exif.get(tag)
                    if val:
                        # EXIF datetime format: "YYYY:MM:DD HH:MM:SS"
                        return val.replace(':', '-', 2)  # → "YYYY-MM-DD HH:MM:SS"
        except Exception:
            pass
        # For HEIC/HEIF try ffprobe
        if ext in ('.heic', '.heif'):
            return _ffprobe_creation_time(file_path)
    elif media_type == 'video':
        return _ffprobe_creation_time(file_path)
    return None


def _ffprobe_creation_time(file_path: str) -> str | None:
    """Extract creation_time from video/image metadata via ffprobe."""
    try:
        result = subprocess.run(
            [FFPROBE, '-v', 'error', '-show_entries', 'format_tags=creation_time',
             '-of', 'default=noprint_wrappers=1:nokey=1', file_path],
            capture_output=True, text=True, timeout=10
        )
        val = result.stdout.strip()
        if val:
            # ffprobe returns ISO 8601 like "2024-12-01T10:30:00.000000Z"
            return val.replace('T', ' ').replace('Z', '').split('.')[0]
    except Exception:
        pass
    return None


def find_media_files(folder_path: str) -> list[str]:
    files = []
    for root, _, filenames in os.walk(folder_path):
        for fn in filenames:
            if Path(fn).suffix.lower() in MEDIA_EXTENSIONS:
                files.append(os.path.join(root, fn))
    files.sort()
    return files


def extract_frames(video_path: str, interval_secs: int = 10) -> list[str]:
    """Legacy: extract 1 frame every interval_secs seconds."""
    return extract_smart_frames(video_path, max_frames=3)


def extract_smart_frames(video_path: str, max_frames: int = 3) -> list[str]:
    """
    Smart frame sampling — extract at most max_frames from key positions.
    Short clips (<30s): 1 frame at 50%.
    Medium clips (30s-5min): 2 frames at 25% and 75%.
    Long clips (>5min): max_frames frames spread evenly.

    This is 10-20x faster than the old 1-frame-per-10s approach.
    """
    duration = get_video_duration(video_path)
    if duration <= 0:
        duration = 60.0  # fallback

    if duration < 30:
        timestamps = [duration * 0.5]
    elif duration < 300:
        timestamps = [duration * 0.25, duration * 0.75]
    else:
        n = min(max_frames, 5)
        step = duration / (n + 1)
        timestamps = [step * (i + 1) for i in range(n)]

    out_dir = os.path.join(get_thumbnails_dir(), 'frames', _hash(video_path))
    os.makedirs(out_dir, exist_ok=True)

    extracted = []
    for i, ts in enumerate(timestamps):
        out_path = os.path.join(out_dir, f'smart_{i:04d}.jpg')
        cmd = [
            FFMPEG, '-y',
            '-ss', str(ts),
            '-i', video_path,
            '-vframes', '1',
            '-q:v', '3',
            out_path,
        ]
        try:
            subprocess.run(cmd, capture_output=True, check=True, timeout=60)
            if os.path.exists(out_path):
                extracted.append((ts, out_path))
        except Exception:
            pass

    return extracted  # list of (timestamp_secs, frame_path)


def get_video_duration(video_path: str) -> float:
    """Return video duration in seconds via ffprobe."""
    try:
        result = subprocess.run(
            [FFPROBE, '-v', 'error', '-show_entries', 'format=duration',
             '-of', 'default=noprint_wrappers=1:nokey=1', video_path],
            capture_output=True, text=True, timeout=30
        )
        return float(result.stdout.strip())
    except Exception:
        return 0.0


def _ffmpeg_to_jpeg(source_path: str, out_path: str, size: tuple | None = None) -> bool:
    """Use ffmpeg to decode any image (incl. HEIC/HEIF) to JPEG. Returns True on success."""
    vf = f'scale={size[0]}:{size[1]}:force_original_aspect_ratio=decrease,pad={size[0]}:{size[1]}:(ow-iw)/2:(oh-ih)/2:black' if size else 'scale=iw:ih'
    cmd = [FFMPEG, '-y', '-i', source_path, '-vf', vf, '-q:v', '3', out_path]
    try:
        result = subprocess.run(cmd, capture_output=True, timeout=30)
        return os.path.exists(out_path)
    except Exception:
        return False


def make_thumbnail(source_path: str, clip_id: int, media_type: str, size: tuple = (380, 213)) -> str:
    """Create a 16:9 thumbnail. Returns path to thumbnail JPEG."""
    thumb_dir = get_thumbnails_dir()
    thumb_path = os.path.join(thumb_dir, f'thumb_{clip_id}.jpg')

    ext = Path(source_path).suffix.lower()

    try:
        if media_type == 'video':
            # Try seeking to 10% into the video for a representative frame,
            # falling back to 1s and then 0s for very short clips.
            duration_hint = get_video_duration(source_path)
            seek_secs = max(0, min(duration_hint * 0.1, 5.0)) if duration_hint else 1.0
            seek_str = f'{seek_secs:.2f}'
            cmd = [
                FFMPEG, '-y', '-ss', seek_str, '-i', source_path,
                '-vframes', '1',
                '-vf', f'scale={size[0]}:{size[1]}:force_original_aspect_ratio=decrease,pad={size[0]}:{size[1]}:(ow-iw)/2:(oh-ih)/2:black',
                thumb_path,
            ]
            result = subprocess.run(cmd, capture_output=True, timeout=30)
            # If failed (very short video), grab the very first frame
            if result.returncode != 0 or not os.path.exists(thumb_path):
                fallback_cmd = [
                    FFMPEG, '-y', '-i', source_path,
                    '-vframes', '1',
                    '-vf', f'scale={size[0]}:{size[1]}:force_original_aspect_ratio=decrease,pad={size[0]}:{size[1]}:(ow-iw)/2:(oh-ih)/2:black',
                    thumb_path,
                ]
                subprocess.run(fallback_cmd, capture_output=True, timeout=30)
        else:
            # Photos (JPEG, PNG, TIFF, WebP, HEIC/HEIF via pillow-heif, etc.)
            from PIL import ImageOps
            try:
                img = Image.open(source_path)
            except Exception:
                # PIL failed (e.g. pillow-heif not installed for HEIC) — try sips on macOS
                if ext in ('.heic', '.heif') and shutil.which('sips'):
                    sips_tmp = thumb_path + '_sips.jpg'
                    subprocess.run(
                        ['sips', '-s', 'format', 'jpeg', source_path, '--out', sips_tmp],
                        capture_output=True, timeout=30,
                    )
                    if os.path.exists(sips_tmp):
                        img = Image.open(sips_tmp)
                    else:
                        raise
                else:
                    raise
            img = ImageOps.exif_transpose(img)   # auto-rotate per EXIF orientation
            img = img.convert('RGB')
            img.thumbnail(size, Image.LANCZOS)
            padded = Image.new('RGB', size, (0, 0, 0))
            offset = ((size[0] - img.width) // 2, (size[1] - img.height) // 2)
            padded.paste(img, offset)
            padded.save(thumb_path, 'JPEG', quality=85)
    except Exception:
        # Universal fallback via ffmpeg
        if not os.path.exists(thumb_path):
            _ffmpeg_to_jpeg(source_path, thumb_path, size)

    return thumb_path if os.path.exists(thumb_path) else ''


def prepare_photo_for_llava(photo_path: str) -> str:
    """Resize photo to 512px wide for faster LLaVA/CLIP processing. Converts HEIC to JPEG."""
    out_path = os.path.join(get_thumbnails_dir(), 'frames', f'{_hash(photo_path)}_resized.jpg')
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    ext = Path(photo_path).suffix.lower()
    try:
        if ext in ('.heic', '.heif'):
            # Convert via ffmpeg, then optionally downscale
            tmp = out_path + '_full.jpg'
            if _ffmpeg_to_jpeg(photo_path, tmp):
                img = Image.open(tmp).convert('RGB')
            else:
                return photo_path
        else:
            img = Image.open(photo_path).convert('RGB')
        w, h = img.size
        if w > 800:
            new_h = int(h * 800 / w)
            img = img.resize((800, new_h), Image.LANCZOS)
        img.save(out_path, 'JPEG', quality=88)
        return out_path
    except Exception:
        return photo_path


def _hash(path: str) -> str:
    return hashlib.md5(path.encode()).hexdigest()[:12]


def generate_proxy(source_path: str, clip_id: int) -> str:
    """
    Generate an H.264 1080p proxy video via FFmpeg.
    Returns proxy path on success, empty string on failure.
    Proxy is stored alongside thumbnails.
    """
    proxy_dir = os.path.join(get_thumbnails_dir(), 'proxies')
    os.makedirs(proxy_dir, exist_ok=True)
    proxy_path = os.path.join(proxy_dir, f'proxy_{clip_id}.mp4')

    if os.path.exists(proxy_path):
        return proxy_path  # already generated

    cmd = [
        FFMPEG, '-y', '-i', source_path,
        '-vf', 'scale=-2:1080',   # 1080p, preserve aspect
        '-c:v', 'libx264',
        '-crf', '23',             # quality balance
        '-preset', 'fast',
        '-c:a', 'aac', '-b:a', '128k',
        '-movflags', '+faststart',
        proxy_path,
    ]
    try:
        subprocess.run(cmd, capture_output=True, timeout=300, check=True)
        return proxy_path if os.path.exists(proxy_path) else ''
    except Exception:
        return ''


def _build_event_filename(original_path: str, event_name: str, camera_angle: str, index: int) -> str:
    """Build [YYYY-MM-DD]_[Event]_[Camera]_[NNN].[ext] filename."""
    date_str = datetime.now().strftime('%Y-%m-%d')
    event_slug = event_name.replace(' ', '-').replace('/', '-') if event_name else 'Event'
    cam_slug = camera_angle.replace(' ', '') if camera_angle else 'Main'
    ext = Path(original_path).suffix.lower()
    return f'{date_str}_{event_slug}_{cam_slug}_{index:03d}{ext}'


async def ingest_folder(
    folder_path: str,
    reingest: bool = False,
    event_name: str | None = None,
    camera_angle: str | None = None,
    rename_files: bool = False,
    specific_files: list | None = None,
):
    """
    Generator that yields progress dicts.
    Each dict: {type, index, total, filename, stage, category, confidence, error}
    If specific_files is provided, only those files are processed (folder_path may be empty).
    """
    conn = get_connection()
    if specific_files is not None:
        # Filter to valid media files only
        files = [f for f in specific_files if os.path.isfile(f) and Path(f).suffix.lower() in MEDIA_EXTENSIONS]
    else:
        files = find_media_files(folder_path)
    total = len(files)

    if total == 0:
        yield {'type': 'complete', 'total': 0, 'summary': {}}
        conn.close()
        return

    vision_model = get_setting('vision_model', 'llava:13b')
    whisper_model = get_setting('whisper_model', 'large-v3')
    max_frames = int(get_setting('max_frames_per_clip', '3'))
    do_face_recognition = get_setting('face_recognition', '1') == '1'
    use_clip = get_setting('use_clip_classify', '1') == '1'

    # Get category map
    cats = conn.execute('SELECT * FROM categories').fetchall()
    cat_by_name = {r['name']: r['id'] for r in cats}
    unclassified_id = cat_by_name.get('Unclassified', 1)

    summary = {}
    total_faces_found = 0

    for idx, file_path in enumerate(files, 1):
        filename = os.path.basename(file_path)
        ext = Path(file_path).suffix.lower()
        media_type = 'video' if ext in VIDEO_EXTENSIONS else 'photo'

        # Skip already-ingested files unless reingest
        if not reingest:
            existing = conn.execute(
                'SELECT id FROM clips WHERE original_path = ?', (file_path,)
            ).fetchone()
            if existing:
                yield {'type': 'skip', 'index': idx, 'total': total, 'filename': filename}
                continue

        yield {'type': 'progress', 'index': idx, 'total': total, 'filename': filename, 'stage': 'Extracting frames'}

        try:
            # ── Smart frame extraction & classification ────────────────────────
            frame_results = []
            smart_frames = []  # list of (timestamp_secs, frame_path)

            if media_type == 'video':
                smart_frames = extract_smart_frames(file_path, max_frames=max_frames)
                if not smart_frames:
                    fallback_path = make_thumbnail(file_path, -1, 'video')
                    if fallback_path:
                        smart_frames = [(5.0, fallback_path)]
                duration = get_video_duration(file_path)

                # Try CLIP first (fast ~100ms), fall back to LLaVA
                clip_cls = _get_clip_cls() if use_clip else None
                if clip_cls is not None:
                    yield {'type': 'progress', 'index': idx, 'total': total, 'filename': filename, 'stage': f'Classifying ({len(smart_frames)} frames — CLIP fast)'}
                    frame_paths = [fp for _ts, fp in smart_frames]
                    clip_result = clip_cls.classify_frames(frame_paths)
                    await asyncio.sleep(0)
                    if clip_result:
                        category_name = clip_result.get('category', 'Unclassified')
                        confidence = clip_result.get('confidence', 0.5)
                        description = clip_result.get('description', '')
                        keywords = clip_result.get('keywords', [])
                    else:
                        # CLIP failed mid-run, fall through to LLaVA
                        clip_cls = None

                if clip_cls is None:
                    yield {'type': 'progress', 'index': idx, 'total': total, 'filename': filename, 'stage': f'Classifying ({len(smart_frames)} frames — AI vision)'}
                    for _ts, frame_path in smart_frames:
                        result = classify_frame(frame_path, model=vision_model)
                        frame_results.append(result)
                        await asyncio.sleep(0)
                    category_name, confidence, description, keywords = majority_vote_classify(frame_results)

            else:
                # Photo
                resized = prepare_photo_for_llava(file_path)
                smart_frames = [(0.0, resized)]

                clip_cls = _get_clip_cls() if use_clip else None
                if clip_cls is not None:
                    yield {'type': 'progress', 'index': idx, 'total': total, 'filename': filename, 'stage': 'Classifying photo — CLIP fast'}
                    clip_result = clip_cls.classify_image(resized)
                    await asyncio.sleep(0)
                    if clip_result:
                        category_name = clip_result.get('category', 'Unclassified')
                        confidence = clip_result.get('confidence', 0.5)
                        description = clip_result.get('description', '')
                        keywords = clip_result.get('keywords', [])
                    else:
                        clip_cls = None

                if clip_cls is None:
                    yield {'type': 'progress', 'index': idx, 'total': total, 'filename': filename, 'stage': 'Classifying photo'}
                    result = classify_frame(resized, model=vision_model)
                    category_name = result.get('category', 'Unclassified')
                    confidence = 1.0
                    description = result.get('description', '')
                    keywords = result.get('keywords', [])

                duration = None

            category_id = cat_by_name.get(category_name, unclassified_id)
            file_size = os.path.getsize(file_path)

            # ── Transcription ─────────────────────────────────────────────────
            transcript = ''
            transcript_segments = []
            if media_type == 'video':
                yield {'type': 'progress', 'index': idx, 'total': total, 'filename': filename, 'stage': 'Transcribing audio'}
                transcript_segments = transcribe_with_timestamps(file_path, model_size=whisper_model)
                transcript = ' '.join(s['text'] for s in transcript_segments if s.get('text'))
                await asyncio.sleep(0)

            # ── Extract capture date ──────────────────────────────────────────
            taken_at = extract_taken_at(file_path, media_type)

            # ── Save to DB ────────────────────────────────────────────────────
            yield {'type': 'progress', 'index': idx, 'total': total, 'filename': filename, 'stage': 'Saving'}

            # Detect scripture references in the transcript
            scripture_refs = detect_scripture_refs(transcript) if transcript else []

            if reingest:
                conn.execute(
                    '''UPDATE clips SET category_id=?, confidence=?, description=?,
                       keywords=?, transcript=?, transcript_segments=?, scripture_refs=?,
                       date_ingested=datetime('now'), taken_at=?
                       WHERE original_path=?''',
                    (category_id, confidence, description, json.dumps(keywords), transcript,
                     json.dumps(transcript_segments), json.dumps(scripture_refs), taken_at, file_path)
                )
                clip_id = conn.execute('SELECT id FROM clips WHERE original_path=?', (file_path,)).fetchone()['id']
            else:
                cur = conn.execute(
                    '''INSERT OR REPLACE INTO clips
                       (filename, original_path, category_id, confidence, description,
                        keywords, transcript, transcript_segments, scripture_refs,
                        duration_secs, file_size_bytes, media_type, taken_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
                    (filename, file_path, category_id, confidence, description,
                     json.dumps(keywords), transcript, json.dumps(transcript_segments),
                     json.dumps(scripture_refs), duration, file_size, media_type, taken_at)
                )
                clip_id = cur.lastrowid

            # ── Auto-rename ───────────────────────────────────────────────────
            if rename_files and event_name:
                new_filename = _build_event_filename(file_path, event_name, camera_angle, idx)
                new_path = os.path.join(os.path.dirname(file_path), new_filename)
                try:
                    if not os.path.exists(new_path):
                        os.rename(file_path, new_path)
                        file_path = new_path
                        filename = new_filename
                        conn.execute(
                            'UPDATE clips SET filename = ?, original_path = ? WHERE id = ?',
                            (new_filename, new_path, clip_id)
                        )
                except Exception as e:
                    pass  # non-fatal, keep original name

            # ── Thumbnail ─────────────────────────────────────────────────────
            thumb_path = make_thumbnail(file_path, clip_id, media_type)
            if thumb_path:
                conn.execute('UPDATE clips SET thumbnail_path = ? WHERE id = ?', (thumb_path, clip_id))

            # ── Proxy generation ──────────────────────────────────────────────
            do_proxy = get_setting('generate_proxies', '0') == '1'
            if do_proxy and media_type == 'video':
                yield {'type': 'progress', 'index': idx, 'total': total, 'filename': filename, 'stage': 'Generating proxy'}
                try:
                    proxy_path = generate_proxy(file_path, clip_id)
                    if proxy_path:
                        conn.execute('UPDATE clips SET proxy_path = ? WHERE id = ?', (proxy_path, clip_id))
                except Exception:
                    pass  # non-fatal
                await asyncio.sleep(0)

            # ── Color extraction ──────────────────────────────────────────────
            try:
                from colors import extract_colors
                color_src = thumb_path if thumb_path and os.path.exists(thumb_path) else file_path
                color_data = extract_colors(color_src)
                if color_data:
                    conn.execute('UPDATE clips SET color_data = ? WHERE id = ?',
                                 (json.dumps(color_data), clip_id))
            except Exception:
                pass  # non-fatal

            # ── Text embeddings ───────────────────────────────────────────────
            embed_text_str = f"{description} {transcript}".strip()
            store_embedding(conn, clip_id, embed_text_str)

            # ── SigLIP visual embeddings (gold standard for search) ──────────
            yield {'type': 'progress', 'index': idx, 'total': total, 'filename': filename, 'stage': 'Visual embedding (SigLIP)'}
            thumb_for_embed = thumb_path or (smart_frames[0][1] if smart_frames else None)
            if thumb_for_embed and os.path.exists(thumb_for_embed):
                try:
                    import siglip
                    vis_vec = siglip.embed_image(thumb_for_embed)
                    if vis_vec is not None:
                        conn.execute(
                            'INSERT OR REPLACE INTO clip_siglip_embeddings (clip_id, embedding) VALUES (?, ?)',
                            (clip_id, vis_vec.tobytes())
                        )
                except Exception:
                    pass  # non-fatal

            # ── Shot type classification ───────────────────────────────���──────
            try:
                if use_clip and thumb_path and os.path.exists(thumb_path):
                    cls_mod = _get_clip_cls()
                    if cls_mod is not None:
                        shot_type = cls_mod.classify_shot_type(thumb_path)
                        if shot_type:
                            conn.execute('UPDATE clips SET shot_type = ? WHERE id = ?', (shot_type, clip_id))
            except Exception:
                pass  # non-fatal

            # ── Face detection ────────────────────────────────────────────────
            faces_mod = _get_faces() if do_face_recognition else None
            if faces_mod is not None and smart_frames:
                yield {'type': 'progress', 'index': idx, 'total': total, 'filename': filename, 'stage': 'Detecting faces'}
                all_faces = []
                crop_dir = os.path.join(get_thumbnails_dir(), 'face_crops')
                for ts, frame_path in smart_frames:
                    try:
                        found = faces_mod.detect_faces(frame_path, frame_time=ts, crop_dir=crop_dir)
                        all_faces.extend(found)
                    except Exception:
                        pass
                if all_faces:
                    faces_mod.store_clip_faces(conn, clip_id, all_faces)
                    total_faces_found += len(all_faces)

            conn.commit()

            # Refresh cat_by_name in case categories changed mid-ingest
            cats = conn.execute('SELECT * FROM categories').fetchall()
            cat_by_name = {r['name']: r['id'] for r in cats}

            summary[category_name] = summary.get(category_name, 0) + 1

            yield {
                'type': 'classified',
                'index': idx,
                'total': total,
                'filename': filename,
                'category': category_name,
                'confidence': round(confidence, 2),
                'stage': 'Done',
            }

        except Exception as e:
            yield {
                'type': 'error',
                'index': idx,
                'total': total,
                'filename': filename,
                'error': str(e),
            }

    # ── Face clustering ───────────────────────────────────────────────────────
    if do_face_recognition and total_faces_found > 0:
        try:
            _fm = _get_faces()
            if _fm is not None:
                _fm.cluster_all_faces(conn)
        except Exception:
            pass

    conn.close()
    yield {'type': 'complete', 'total': total, 'summary': summary}


async def ingest_single_file(file_path: str):
    """Ingest one file (used by watch folder)."""
    async for _ in ingest_folder(os.path.dirname(file_path)):
        pass
