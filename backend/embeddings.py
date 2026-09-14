from __future__ import annotations

import struct
import numpy as np

_model = None
MODEL_NAME = 'BAAI/bge-small-en-v1.5'
EMBEDDING_DIM = 384


def _get_model():
    global _model
    if _model is None:
        from sentence_transformers import SentenceTransformer
        _model = SentenceTransformer(MODEL_NAME)
    return _model


def embed_text(text: str, is_query: bool = False) -> np.ndarray:
    """Embed a text string. Returns normalized 384-dim float32 numpy array.
    bge-small uses a query prefix for retrieval queries."""
    if not text or not text.strip():
        return np.zeros(EMBEDDING_DIM, dtype=np.float32)
    model = _get_model()
    # bge models perform better with a retrieval prefix on the query side
    input_text = f'Represent this sentence for searching relevant passages: {text}' if is_query else text
    vec = model.encode(input_text, normalize_embeddings=True)
    return vec.astype(np.float32)


def serialize_vector(vec) -> bytes:
    arr = np.asarray(vec, dtype=np.float32)
    return arr.tobytes()


def deserialize_vector(data: bytes) -> np.ndarray:
    return np.frombuffer(data, dtype=np.float32)


def store_embedding(conn, clip_id: int, text: str):
    """Store (or replace) the embedding for a clip. Uses plain SQLite BLOB — no extension needed."""
    try:
        vec = embed_text(text)
        conn.execute(
            'INSERT OR REPLACE INTO clip_embeddings (clip_id, embedding) VALUES (?, ?)',
            (clip_id, serialize_vector(vec))
        )
    except Exception as e:
        import logging
        logging.warning(f'[embeddings] Failed to store embedding for clip {clip_id}: {e}')


def vector_search(conn, query_text: str, top_k: int = 200) -> dict[int, float]:
    """
    Pure-Python cosine similarity search. No sqlite-vec extension required.
    Returns {clip_id: similarity_score} for scores above threshold.
    Since embeddings are L2-normalized, dot product == cosine similarity.
    """
    if not query_text or not query_text.strip():
        return {}

    query_vec = embed_text(query_text, is_query=True)

    rows = conn.execute('SELECT clip_id, embedding FROM clip_embeddings').fetchall()
    if not rows:
        return {}

    # Stack all embeddings into a matrix for fast batch dot product
    clip_ids = []
    vecs = []
    for row in rows:
        try:
            vec = deserialize_vector(row['embedding'])
            if len(vec) == EMBEDDING_DIM:
                clip_ids.append(row['clip_id'])
                vecs.append(vec)
        except Exception:
            continue

    if not vecs:
        return {}

    matrix = np.stack(vecs)               # shape: (N, 384)
    scores = matrix @ query_vec            # shape: (N,) — dot product = cosine similarity

    # Use a statistical threshold (mean + 0.8×std) that adapts to each query,
    # the same approach SigLIP uses.  A fixed 0.25 cutoff was too aggressive for
    # queries like "smile" where all scores cluster below 0.25 even though some
    # clips are meaningfully more relevant than others.
    mean_s = float(scores.mean())
    std_s  = float(scores.std())

    # If the distribution has no meaningful spread the query has no signal
    if std_s < 0.005:
        return {}

    threshold = mean_s + 0.8 * std_s
    results = {}
    for clip_id, score in zip(clip_ids, scores.tolist()):
        if score >= threshold:
            results[clip_id] = float(score)

    if not results:
        return {}

    # Normalize scores to 0–1 within the qualifying set (same as SigLIP)
    vals = list(results.values())
    min_s, max_s = min(vals), max(vals)
    if max_s > min_s:
        results = {cid: (s - min_s) / (max_s - min_s) for cid, s in results.items()}
    else:
        results = {cid: 1.0 for cid in results}

    # Return top_k
    sorted_results = sorted(results.items(), key=lambda x: x[1], reverse=True)
    return dict(sorted_results[:top_k])
