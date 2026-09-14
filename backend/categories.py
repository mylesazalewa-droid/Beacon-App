from __future__ import annotations

import sqlite3
from database import get_connection, CATEGORY_COLORS
from models import CategoryOut


def list_categories(include_counts: bool = True) -> list[CategoryOut]:
    conn = get_connection()
    rows = conn.execute(
        'SELECT * FROM categories ORDER BY sort_order, id'
    ).fetchall()

    counts = {}
    if include_counts:
        for row in conn.execute(
            'SELECT category_id, COUNT(*) as cnt FROM clips WHERE hidden = 0 GROUP BY category_id'
        ).fetchall():
            counts[row['category_id']] = row['cnt']

    conn.close()
    return [CategoryOut.from_row(r, counts.get(r['id'], 0)) for r in rows]


def get_category_map(conn: sqlite3.Connection) -> dict:
    rows = conn.execute('SELECT * FROM categories').fetchall()
    return {r['id']: dict(r) for r in rows}


def create_category(name: str) -> CategoryOut:
    conn = get_connection()
    # Assign next color and sort order
    color_idx = conn.execute('SELECT COUNT(*) FROM categories').fetchone()[0] % len(CATEGORY_COLORS)
    max_order = conn.execute(
        'SELECT MAX(sort_order) FROM categories WHERE is_system = 0'
    ).fetchone()[0] or 0
    # Insert before Unclassified (always last)
    new_order = max_order + 1
    # Push Unclassified down
    conn.execute(
        'UPDATE categories SET sort_order = sort_order + 1 WHERE is_system = 1'
    )
    conn.execute(
        'INSERT INTO categories (name, color_index, sort_order, is_system) VALUES (?, ?, ?, 0)',
        (name.strip(), color_idx, new_order)
    )
    conn.commit()
    row_id = conn.execute('SELECT last_insert_rowid()').fetchone()[0]
    row = conn.execute('SELECT * FROM categories WHERE id = ?', (row_id,)).fetchone()
    conn.close()
    return CategoryOut.from_row(row)


def update_category(cat_id: int, name: str = None, color_index: int = None) -> CategoryOut:
    conn = get_connection()
    cat = conn.execute('SELECT * FROM categories WHERE id = ?', (cat_id,)).fetchone()
    if not cat:
        conn.close()
        raise ValueError(f'Category {cat_id} not found')
    if cat['is_system']:
        conn.close()
        raise ValueError('Cannot modify system categories')

    if name is not None:
        conn.execute('UPDATE categories SET name = ? WHERE id = ?', (name.strip(), cat_id))
    if color_index is not None:
        conn.execute('UPDATE categories SET color_index = ? WHERE id = ?', (color_index, cat_id))
    conn.commit()
    row = conn.execute('SELECT * FROM categories WHERE id = ?', (cat_id,)).fetchone()
    conn.close()
    return CategoryOut.from_row(row)


def delete_category(cat_id: int) -> dict:
    conn = get_connection()
    cat = conn.execute('SELECT * FROM categories WHERE id = ?', (cat_id,)).fetchone()
    if not cat:
        conn.close()
        raise ValueError(f'Category {cat_id} not found')
    if cat['is_system']:
        conn.close()
        raise ValueError('Cannot delete system categories')

    # Move all clips in this category to Unclassified
    unclassified = conn.execute(
        'SELECT id FROM categories WHERE name = ?', ('Unclassified',)
    ).fetchone()
    moved = 0
    if unclassified:
        result = conn.execute(
            'UPDATE clips SET category_id = ? WHERE category_id = ?',
            (unclassified['id'], cat_id)
        )
        moved = result.rowcount

    conn.execute('DELETE FROM categories WHERE id = ?', (cat_id,))
    conn.commit()
    conn.close()
    return {'deleted': True, 'clips_moved': moved}


def reorder_categories(ordered_ids: list[int]):
    conn = get_connection()
    for idx, cat_id in enumerate(ordered_ids):
        conn.execute(
            'UPDATE categories SET sort_order = ? WHERE id = ? AND is_system = 0',
            (idx, cat_id)
        )
    # Keep system categories at the end
    max_order = len(ordered_ids)
    conn.execute(
        'UPDATE categories SET sort_order = ? WHERE is_system = 1',
        (max_order + 100,)
    )
    conn.commit()
    conn.close()
