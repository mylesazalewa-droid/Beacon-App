from __future__ import annotations

import sqlite3
import os
import json
from pathlib import Path

HAS_VEC = True  # embeddings now stored as plain BLOBs — always available

DATA_DIR = os.environ.get('BEACON_DATA_DIR', os.path.join(os.path.dirname(__file__), '..', 'beacon_data'))
DB_PATH = os.path.join(DATA_DIR, 'beacon.db')

CATEGORY_COLORS = [
    '#E74C3C', '#3498DB', '#2ECC71', '#9B59B6',
    '#F39C12', '#1ABC9C', '#E91E63', '#FF5722',
]

DEFAULT_CATEGORIES = [
    ('Worship', 0),
    ('Sermon', 1),
    ('Baptism', 2),
    ('Kids Ministry', 3),
    ('Events', 4),
]


def get_connection() -> sqlite3.Connection:
    os.makedirs(DATA_DIR, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, check_same_thread=False, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA journal_mode=WAL')
    conn.execute('PRAGMA foreign_keys=ON')
    conn.execute('PRAGMA cache_size=-32000')
    return conn


def init_db():
    conn = get_connection()
    cur = conn.cursor()

    cur.executescript('''
        CREATE TABLE IF NOT EXISTS categories (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            name        TEXT    NOT NULL UNIQUE,
            color_index INTEGER DEFAULT 0,
            sort_order  INTEGER DEFAULT 0,
            is_system   INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS clips (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            filename        TEXT    NOT NULL,
            original_path   TEXT    NOT NULL UNIQUE,
            category_id     INTEGER REFERENCES categories(id),
            confidence      REAL    DEFAULT 0.0,
            description     TEXT,
            keywords        TEXT,
            transcript      TEXT,
            thumbnail_path  TEXT,
            duration_secs   REAL,
            file_size_bytes INTEGER,
            media_type      TEXT,
            hidden          INTEGER DEFAULT 0,
            color_data      TEXT,
            proxy_path      TEXT,
            date_ingested   TEXT    DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS watch_folders (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            folder_path TEXT NOT NULL UNIQUE,
            active      INTEGER DEFAULT 1,
            added_at    TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS settings (
            key   TEXT PRIMARY KEY,
            value TEXT
        );
    ''')

    # Plain BLOB table for text embeddings — no sqlite extension required
    cur.execute('''
        CREATE TABLE IF NOT EXISTS clip_embeddings (
            clip_id   INTEGER PRIMARY KEY,
            embedding BLOB NOT NULL
        )
    ''')

    # Tags
    cur.execute('''
        CREATE TABLE IF NOT EXISTS tags (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            name       TEXT NOT NULL UNIQUE,
            color      TEXT DEFAULT '#3498DB',
            created_at TEXT DEFAULT (datetime('now'))
        )
    ''')
    cur.execute('''
        CREATE TABLE IF NOT EXISTS clip_tags (
            clip_id INTEGER REFERENCES clips(id) ON DELETE CASCADE,
            tag_id  INTEGER REFERENCES tags(id) ON DELETE CASCADE,
            PRIMARY KEY (clip_id, tag_id)
        )
    ''')

    # Saved Searches
    cur.execute('''
        CREATE TABLE IF NOT EXISTS saved_searches (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            name         TEXT NOT NULL,
            icon         TEXT DEFAULT '🔍',
            query        TEXT,
            category_id  INTEGER,
            color_family TEXT,
            rating_min   INTEGER DEFAULT 0,
            created_at   TEXT DEFAULT (datetime('now'))
        )
    ''')

    # Projects — named productions (Easter Video, Announcement Reel, etc.)
    cur.execute('''
        CREATE TABLE IF NOT EXISTS projects (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            name       TEXT NOT NULL,
            color      TEXT DEFAULT '#6B8FFF',
            created_at TEXT DEFAULT (datetime('now'))
        )
    ''')
    cur.execute('''
        CREATE TABLE IF NOT EXISTS clip_projects (
            clip_id    INTEGER REFERENCES clips(id) ON DELETE CASCADE,
            project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
            added_at   TEXT DEFAULT (datetime('now')),
            PRIMARY KEY (clip_id, project_id)
        )
    ''')

    # Shot lists — ordered sequences for pre-edit planning
    cur.execute('''
        CREATE TABLE IF NOT EXISTS shot_lists (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            name       TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now'))
        )
    ''')
    cur.execute('''
        CREATE TABLE IF NOT EXISTS shot_list_items (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            shot_list_id INTEGER REFERENCES shot_lists(id) ON DELETE CASCADE,
            clip_id      INTEGER REFERENCES clips(id) ON DELETE CASCADE,
            position     INTEGER DEFAULT 0,
            note         TEXT
        )
    ''')

    # Migrate: add columns to existing databases
    for col_sql in [
        'ALTER TABLE clips ADD COLUMN color_data TEXT',
        'ALTER TABLE clips ADD COLUMN proxy_path TEXT',
        'ALTER TABLE clips ADD COLUMN starred INTEGER DEFAULT 0',
        'ALTER TABLE clips ADD COLUMN rating INTEGER DEFAULT 0',
        'ALTER TABLE clips ADD COLUMN shot_type TEXT',
        'ALTER TABLE clips ADD COLUMN notes TEXT',
        'ALTER TABLE clip_faces ADD COLUMN det_score REAL',
        "ALTER TABLE clips ADD COLUMN status TEXT DEFAULT 'unreviewed'",
        'ALTER TABLE clips ADD COLUMN taken_at TEXT',
        'ALTER TABLE clips ADD COLUMN scripture_refs TEXT',
        'ALTER TABLE clips ADD COLUMN transcript_segments TEXT',
        'ALTER TABLE clips ADD COLUMN used_count INTEGER DEFAULT 0',
        'ALTER TABLE clips ADD COLUMN last_used_at TEXT',
        'ALTER TABLE clips ADD COLUMN enriched_by_llava INTEGER DEFAULT 0',
    ]:
        try:
            cur.execute(col_sql)
            conn.commit()
        except Exception:
            pass  # column already exists

    # CLIP visual embeddings (512-dim float32) — legacy, kept for similarity search fallback
    cur.execute('''
        CREATE TABLE IF NOT EXISTS clip_visual_embeddings (
            clip_id   INTEGER PRIMARY KEY,
            embedding BLOB NOT NULL
        )
    ''')

    # SigLIP visual embeddings (1152-dim float32) — gold standard for visual search
    cur.execute('''
        CREATE TABLE IF NOT EXISTS clip_siglip_embeddings (
            clip_id   INTEGER PRIMARY KEY,
            embedding BLOB NOT NULL
        )
    ''')

    # Smart Collections
    cur.execute('''
        CREATE TABLE IF NOT EXISTS smart_collections (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            name         TEXT NOT NULL,
            icon         TEXT DEFAULT '📁',
            query        TEXT,
            category_id  INTEGER,
            color_family TEXT,
            media_type   TEXT,
            sort         INTEGER DEFAULT 0,
            created_at   TEXT DEFAULT (datetime('now'))
        )
    ''')

    # Manual collection membership (clip-based, vs query-based smart collections)
    cur.execute('''
        CREATE TABLE IF NOT EXISTS collection_clips (
            collection_id INTEGER REFERENCES smart_collections(id) ON DELETE CASCADE,
            clip_id       INTEGER REFERENCES clips(id) ON DELETE CASCADE,
            added_at      TEXT DEFAULT (datetime('now')),
            PRIMARY KEY (collection_id, clip_id)
        )
    ''')

    # Named persons (face clusters)
    cur.execute('''
        CREATE TABLE IF NOT EXISTS persons (
            id                      INTEGER PRIMARY KEY AUTOINCREMENT,
            name                    TEXT,
            face_count              INTEGER DEFAULT 0,
            representative_embedding BLOB,
            thumbnail_path          TEXT,
            created_at              TEXT DEFAULT (datetime('now'))
        )
    ''')

    # Face detections per clip
    cur.execute('''
        CREATE TABLE IF NOT EXISTS clip_faces (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            clip_id    INTEGER REFERENCES clips(id) ON DELETE CASCADE,
            person_id  INTEGER REFERENCES persons(id),
            frame_time REAL,
            bbox       TEXT,
            embedding  BLOB,
            crop_path  TEXT
        )
    ''')

    conn.commit()
    _seed_defaults(conn)
    conn.close()


def _seed_defaults(conn: sqlite3.Connection):
    cur = conn.cursor()

    # Seed default categories
    for idx, (name, color_idx) in enumerate(DEFAULT_CATEGORIES):
        cur.execute(
            'INSERT OR IGNORE INTO categories (name, color_index, sort_order, is_system) VALUES (?, ?, ?, 0)',
            (name, color_idx, idx)
        )

    # Unclassified is always last and system-locked
    existing = cur.execute('SELECT id FROM categories WHERE name = ?', ('Unclassified',)).fetchone()
    if not existing:
        max_order = cur.execute('SELECT MAX(sort_order) FROM categories').fetchone()[0] or 0
        cur.execute(
            'INSERT INTO categories (name, color_index, sort_order, is_system) VALUES (?, ?, ?, 1)',
            ('Unclassified', 7, max_order + 1)
        )

    # Default settings
    defaults = {
        'vision_model': 'llava:13b',
        'whisper_model': 'large-v3',
        'frame_interval_secs': '10',
        'auto_watch': '1',
        'face_recognition': '1',
        'max_frames_per_clip': '3',
        'use_clip_classify': '1',
        'generate_proxies': '0',
    }
    for key, val in defaults.items():
        cur.execute('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)', (key, val))

    conn.commit()


def get_setting(key: str, default=None) -> str | None:
    conn = get_connection()
    row = conn.execute('SELECT value FROM settings WHERE key = ?', (key,)).fetchone()
    conn.close()
    return row['value'] if row else default


def set_setting(key: str, value: str):
    conn = get_connection()
    conn.execute('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', (key, value))
    conn.commit()
    conn.close()


def get_thumbnails_dir() -> str:
    d = os.path.join(DATA_DIR, 'thumbnails')
    os.makedirs(d, exist_ok=True)
    return d


def get_db_stats() -> dict:
    conn = get_connection()
    clips_count = conn.execute('SELECT COUNT(*) FROM clips WHERE hidden = 0').fetchone()[0]
    storage = conn.execute('SELECT SUM(file_size_bytes) FROM clips WHERE hidden = 0').fetchone()[0] or 0
    db_size = os.path.getsize(DB_PATH) if os.path.exists(DB_PATH) else 0
    persons_count = conn.execute('SELECT COUNT(*) FROM persons').fetchone()[0]
    faces_count = conn.execute('SELECT COUNT(*) FROM clip_faces').fetchone()[0]
    conn.close()
    return {
        'total_clips': clips_count,
        'total_storage_bytes': storage,
        'db_size_bytes': db_size,
        'persons_count': persons_count,
        'faces_count': faces_count,
    }
