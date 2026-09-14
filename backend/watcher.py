from __future__ import annotations

import asyncio
import os
import threading
from pathlib import Path
from typing import Callable

from ingest import MEDIA_EXTENSIONS

_observer = None
_callbacks: list[Callable] = []


class _MediaHandler:
    def __init__(self, loop: asyncio.AbstractEventLoop):
        self._loop = loop

    def dispatch(self, event):
        if event.is_directory:
            return
        ext = Path(event.src_path).suffix.lower()
        if ext in MEDIA_EXTENSIONS:
            if event.event_type in ('created', 'moved'):
                path = event.dest_path if event.event_type == 'moved' else event.src_path
                for cb in _callbacks:
                    asyncio.run_coroutine_threadsafe(cb(path), self._loop)


def start_watching(folder_paths: list[str], on_new_file: Callable, loop: asyncio.AbstractEventLoop):
    global _observer
    try:
        from watchdog.observers import Observer
        from watchdog.events import FileSystemEventHandler

        class Handler(FileSystemEventHandler, _MediaHandler):
            def __init__(self, loop):
                FileSystemEventHandler.__init__(self)
                _MediaHandler.__init__(self, loop)

        if _observer and _observer.is_alive():
            _observer.stop()
            _observer.join()

        _callbacks.clear()
        _callbacks.append(on_new_file)

        _observer = Observer()
        handler = Handler(loop)
        for folder in folder_paths:
            if os.path.isdir(folder):
                _observer.schedule(handler, folder, recursive=True)

        _observer.start()
    except Exception as e:
        print(f'[watcher] Failed to start: {e}')


def stop_watching():
    global _observer
    if _observer and _observer.is_alive():
        _observer.stop()
        _observer.join()
        _observer = None


def get_active_watch_folders() -> list[str]:
    from database import get_connection
    conn = get_connection()
    rows = conn.execute(
        'SELECT folder_path FROM watch_folders WHERE active = 1'
    ).fetchall()
    conn.close()
    return [r['folder_path'] for r in rows]


def add_watch_folder(folder_path: str) -> dict:
    from database import get_connection
    conn = get_connection()
    conn.execute(
        'INSERT OR IGNORE INTO watch_folders (folder_path) VALUES (?)',
        (folder_path,)
    )
    conn.commit()
    conn.close()
    return {'folder_path': folder_path, 'active': True}


def remove_watch_folder(folder_path: str):
    from database import get_connection
    conn = get_connection()
    conn.execute('DELETE FROM watch_folders WHERE folder_path = ?', (folder_path,))
    conn.commit()
    conn.close()
