import sqlite3
from datetime import datetime, timezone

import paths

DB_PATH = paths.user_data_dir() / "companion.db"

_DDL = """
CREATE TABLE IF NOT EXISTS sessions (
    id   TEXT PRIMARY KEY,
    started_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS turns (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    role       TEXT NOT NULL,
    content    TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(id)
);
CREATE TABLE IF NOT EXISTS events (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    value      REAL,
    created_at TEXT NOT NULL
);
"""


def _connect():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.executescript(_DDL)
    return conn


def create_session(session_id: str) -> None:
    with _connect() as conn:
        conn.execute(
            "INSERT OR IGNORE INTO sessions VALUES (?, ?)",
            (session_id, datetime.now(timezone.utc).isoformat()),
        )


def save_turn(session_id: str, role: str, content: str) -> None:
    with _connect() as conn:
        conn.execute(
            "INSERT INTO turns (session_id, role, content, created_at) VALUES (?, ?, ?, ?)",
            (session_id, role, content, datetime.now(timezone.utc).isoformat()),
        )


def get_turns(session_id: str) -> list[dict]:
    with _connect() as conn:
        rows = conn.execute(
            "SELECT role, content, created_at FROM turns WHERE session_id=? ORDER BY id",
            (session_id,),
        ).fetchall()
    return [dict(r) for r in rows]


def record_event(name: str, value: float | None = None) -> None:
    """Append a product-analytics event. Deliberately content-free: a name, an
    optional number, a timestamp — never any transcript text (§12 privacy)."""
    with _connect() as conn:
        conn.execute(
            "INSERT INTO events (name, value, created_at) VALUES (?, ?, ?)",
            (name, value, datetime.now(timezone.utc).isoformat()),
        )


def get_events() -> list[dict]:
    with _connect() as conn:
        rows = conn.execute(
            "SELECT name, value, created_at FROM events ORDER BY id",
        ).fetchall()
    return [dict(r) for r in rows]


def list_sessions() -> list[dict]:
    with _connect() as conn:
        rows = conn.execute(
            "SELECT s.id, s.started_at, COUNT(t.id) AS turns "
            "FROM sessions s LEFT JOIN turns t ON t.session_id=s.id "
            "GROUP BY s.id ORDER BY s.started_at DESC",
        ).fetchall()
    return [dict(r) for r in rows]
