from __future__ import annotations

from pydantic import BaseModel, Field
from typing import Optional, List
import json


class CategoryOut(BaseModel):
    id: int
    name: str
    color_index: int
    sort_order: int
    is_system: bool
    clip_count: int = 0
    color: str = ''

    @classmethod
    def from_row(cls, row, clip_count: int = 0):
        from database import CATEGORY_COLORS
        color = CATEGORY_COLORS[row['color_index'] % len(CATEGORY_COLORS)]
        return cls(
            id=row['id'],
            name=row['name'],
            color_index=row['color_index'],
            sort_order=row['sort_order'],
            is_system=bool(row['is_system']),
            clip_count=clip_count,
            color=color,
        )


class ClipOut(BaseModel):
    id: int
    filename: str
    original_path: str
    category_id: Optional[int]
    category_name: Optional[str]
    category_color: Optional[str]
    confidence: float
    description: Optional[str]
    keywords: List[str] = []
    transcript: Optional[str]
    thumbnail_path: Optional[str]
    duration_secs: Optional[float]
    file_size_bytes: Optional[int]
    media_type: Optional[str]
    hidden: bool
    date_ingested: str
    taken_at: Optional[str] = None
    color_data: Optional[dict] = None   # {dominant, family, palette}
    match_type: Optional[str] = None    # 'visual' | 'speech' | 'both'
    score: Optional[float] = None
    starred: bool = False
    rating: int = 0                      # 0 = unrated, 1–5 stars
    shot_type: Optional[str] = None      # wide, close-up, crowd, worship, etc.
    tags: List[str] = []                 # user-applied tags
    notes: Optional[str] = None
    status: str = 'unreviewed'           # unreviewed | approved | in_use | archived
    projects: List[dict] = []            # [{id, name, color}] projects this clip is used in

    @classmethod
    def from_row(cls, row, categories: dict = None):
        from database import CATEGORY_COLORS
        kw = []
        if row['keywords']:
            try:
                kw = json.loads(row['keywords'])
            except Exception:
                kw = []
        cat_name = None
        cat_color = None
        if categories and row['category_id']:
            cat = categories.get(row['category_id'])
            if cat:
                cat_name = cat['name']
                cat_color = CATEGORY_COLORS[cat['color_index'] % len(CATEGORY_COLORS)]
        return cls(
            id=row['id'],
            filename=row['filename'],
            original_path=row['original_path'],
            category_id=row['category_id'],
            category_name=cat_name,
            category_color=cat_color,
            confidence=row['confidence'] or 0.0,
            description=row['description'],
            keywords=kw,
            transcript=row['transcript'],
            thumbnail_path=row['thumbnail_path'],
            duration_secs=row['duration_secs'],
            file_size_bytes=row['file_size_bytes'],
            media_type=row['media_type'],
            hidden=bool(row['hidden']),
            date_ingested=row['date_ingested'] or '',
        )


class IngestRequest(BaseModel):
    folder_path: str
    reingest: bool = False
    event_name: Optional[str] = None
    camera_angle: Optional[str] = None
    rename_files: bool = False


class SearchRequest(BaseModel):
    query: str
    category_id: Optional[int] = None
    limit: int = 100
    offset: int = 0


class CategoryCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=64)


class CategoryUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=64)
    color_index: Optional[int] = None
    sort_order: Optional[int] = None


class CategoryReorder(BaseModel):
    ordered_ids: List[int]


class WatchFolderAdd(BaseModel):
    folder_path: str


class SettingUpdate(BaseModel):
    key: str
    value: str


class ReclassifyRequest(BaseModel):
    clip_id: int


class HideClipRequest(BaseModel):
    clip_id: int
    hidden: bool
