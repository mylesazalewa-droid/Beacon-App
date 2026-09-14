from __future__ import annotations

import os
from pathlib import Path

_whisper_model = None
_loaded_model_size = None


def _get_model(model_size: str = 'large-v3'):
    global _whisper_model, _loaded_model_size
    if _whisper_model is None or _loaded_model_size != model_size:
        from faster_whisper import WhisperModel
        # 'auto' uses Metal/Apple Neural Engine on M-series Macs
        _whisper_model = WhisperModel(model_size, device='auto', compute_type='auto')
        _loaded_model_size = model_size
    return _whisper_model


def transcribe_audio(video_path: str, model_size: str = 'large-v3') -> str:
    """Transcribe audio from a video file. Returns full transcript text."""
    try:
        model = _get_model(model_size)
        segments, info = model.transcribe(
            video_path,
            beam_size=5,
            language=None,          # auto-detect
            condition_on_previous_text=True,
            vad_filter=True,        # skip silence
            vad_parameters={'min_silence_duration_ms': 500},
        )
        parts = []
        for seg in segments:
            text = seg.text.strip()
            if text:
                parts.append(text)
        return ' '.join(parts)
    except Exception as e:
        return ''


def transcribe_with_timestamps(video_path: str, model_size: str = 'large-v3') -> list[dict]:
    """Transcribe with timestamps. Returns list of {start, end, text}."""
    try:
        model = _get_model(model_size)
        segments, _ = model.transcribe(
            video_path,
            beam_size=5,
            vad_filter=True,
        )
        return [
            {'start': seg.start, 'end': seg.end, 'text': seg.text.strip()}
            for seg in segments
            if seg.text.strip()
        ]
    except Exception:
        return []
