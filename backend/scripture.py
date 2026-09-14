"""
Scripture reference detection for church media transcripts.
Detects Bible book + chapter:verse patterns and named references like "John 3:16".
"""
from __future__ import annotations
import re

# Canonical book names + common abbreviations
_BOOKS = [
    ('Genesis', ['gen', 'ge', 'gn']),
    ('Exodus', ['exo', 'ex']),
    ('Leviticus', ['lev', 'le', 'lv']),
    ('Numbers', ['num', 'nu', 'nm', 'nb']),
    ('Deuteronomy', ['deut', 'de', 'dt']),
    ('Joshua', ['josh', 'jos', 'jsh']),
    ('Judges', ['judg', 'jdg', 'jg']),
    ('Ruth', ['rth', 'ru']),
    ('1 Samuel', ['1sam', '1sa', '1s', '1 sam']),
    ('2 Samuel', ['2sam', '2sa', '2s', '2 sam']),
    ('1 Kings', ['1kgs', '1ki', '1 kings', '1 kgs']),
    ('2 Kings', ['2kgs', '2ki', '2 kings', '2 kgs']),
    ('1 Chronicles', ['1chr', '1ch', '1 chr', '1 chron']),
    ('2 Chronicles', ['2chr', '2ch', '2 chr', '2 chron']),
    ('Ezra', ['ezr']),
    ('Nehemiah', ['neh', 'ne']),
    ('Esther', ['est', 'esth']),
    ('Job', ['jb']),
    ('Psalms', ['ps', 'psa', 'psalm']),
    ('Proverbs', ['prov', 'prv', 'pr']),
    ('Ecclesiastes', ['eccl', 'ecc', 'ec', 'qoh']),
    ('Song of Solomon', ['song', 'sos', 'ss', 'sg', 'cant']),
    ('Isaiah', ['isa', 'is']),
    ('Jeremiah', ['jer', 'je', 'jr']),
    ('Lamentations', ['lam', 'la']),
    ('Ezekiel', ['ezek', 'eze', 'ezk']),
    ('Daniel', ['dan', 'da', 'dn']),
    ('Hosea', ['hos', 'ho']),
    ('Joel', ['jl']),
    ('Amos', ['am']),
    ('Obadiah', ['obad', 'ob']),
    ('Jonah', ['jon']),
    ('Micah', ['mic', 'mc']),
    ('Nahum', ['nah', 'na']),
    ('Habakkuk', ['hab']),
    ('Zephaniah', ['zeph', 'zep', 'zp']),
    ('Haggai', ['hag', 'hg']),
    ('Zechariah', ['zech', 'zec', 'zc']),
    ('Malachi', ['mal', 'ml']),
    ('Matthew', ['matt', 'mt']),
    ('Mark', ['mk', 'mrk']),
    ('Luke', ['lk', 'luk']),
    ('John', ['jn', 'jhn']),
    ('Acts', ['ac']),
    ('Romans', ['rom', 'ro', 'rm']),
    ('1 Corinthians', ['1cor', '1co', '1 cor']),
    ('2 Corinthians', ['2cor', '2co', '2 cor']),
    ('Galatians', ['gal', 'ga']),
    ('Ephesians', ['eph']),
    ('Philippians', ['phil', 'php', 'pp']),
    ('Colossians', ['col']),
    ('1 Thessalonians', ['1thess', '1th', '1 thess']),
    ('2 Thessalonians', ['2thess', '2th', '2 thess']),
    ('1 Timothy', ['1tim', '1ti', '1 tim']),
    ('2 Timothy', ['2tim', '2ti', '2 tim']),
    ('Titus', ['tit', 'ti']),
    ('Philemon', ['phlm', 'phm']),
    ('Hebrews', ['heb']),
    ('James', ['jas', 'jm']),
    ('1 Peter', ['1pet', '1pe', '1 pet', '1 peter']),
    ('2 Peter', ['2pet', '2pe', '2 pet', '2 peter']),
    ('1 John', ['1jn', '1jo', '1 jn', '1 john']),
    ('2 John', ['2jn', '2jo', '2 jn', '2 john']),
    ('3 John', ['3jn', '3jo', '3 jn', '3 john']),
    ('Jude', ['jud']),
    ('Revelation', ['rev', 'rv', 're']),
]

# Build lookup: lowercase name/abbrev → canonical name
_BOOK_LOOKUP: dict[str, str] = {}
for canonical, abbrevs in _BOOKS:
    _BOOK_LOOKUP[canonical.lower()] = canonical
    for abbr in abbrevs:
        _BOOK_LOOKUP[abbr.lower()] = canonical

# Pattern: book name (with optional number prefix) followed by chapter:verse
_VERSE_PATTERN = re.compile(
    r'\b(?:(?:1st|2nd|3rd|first|second|third|\d)\s+)?'   # optional number prefix
    r'([A-Za-z][a-z]+(?:\s+of\s+[A-Za-z]+)?)'            # book name
    r'\s+(\d{1,3})'                                        # chapter
    r'(?::(\d{1,3})(?:-(\d{1,3}))?)?',                    # optional :verse or :verse-verse
    re.IGNORECASE,
)


def detect_scripture_refs(text: str) -> list[dict]:
    """
    Detect Bible references in text (transcripts, descriptions).
    Returns list of {book, chapter, verse_start, verse_end, reference}.
    Deduplicates by reference string.
    """
    if not text:
        return []

    found: dict[str, dict] = {}

    for m in _VERSE_PATTERN.finditer(text):
        raw_book = m.group(1).strip()
        chapter = int(m.group(2))
        verse_start = int(m.group(3)) if m.group(3) else None
        verse_end = int(m.group(4)) if m.group(4) else None

        canonical = _BOOK_LOOKUP.get(raw_book.lower())
        if canonical is None:
            continue

        if verse_start:
            ref = f'{canonical} {chapter}:{verse_start}'
            if verse_end:
                ref += f'-{verse_end}'
        else:
            ref = f'{canonical} {chapter}'

        if ref not in found:
            found[ref] = {
                'book': canonical,
                'chapter': chapter,
                'verse_start': verse_start,
                'verse_end': verse_end,
                'reference': ref,
            }

    return list(found.values())
