"""Data access for the chat_messages table."""

from __future__ import annotations

import json
import sqlite3

from ..config import DEFAULT_USER_ID
from ..connection import session
from ..helpers import new_id, utc_now_iso
from ..models import ChatMessage

VALID_ROLES = ("user", "assistant")


def add_message(
    role: str,
    content: str,
    actions: dict | None = None,
    user_id: str = DEFAULT_USER_ID,
    conn: sqlite3.Connection | None = None,
) -> ChatMessage:
    """Append a chat message and return it.

    `role` must be "user" or "assistant"; anything else raises ValueError.
    `actions` is a JSON-serializable dict of executed trades and watchlist
    changes, stored as JSON text. Use None for user messages.
    """
    if role not in VALID_ROLES:
        raise ValueError(f"role must be one of {VALID_ROLES}, got {role!r}")

    message = ChatMessage(
        id=new_id(),
        user_id=user_id,
        role=role,
        content=content,
        actions=actions,
        created_at=utc_now_iso(),
    )
    with session(conn) as db:
        db.execute(
            """
            INSERT INTO chat_messages (id, user_id, role, content, actions, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                message.id,
                message.user_id,
                message.role,
                message.content,
                json.dumps(actions) if actions is not None else None,
                message.created_at,
            ),
        )
    return message


def list_messages(
    limit: int | None = None,
    user_id: str = DEFAULT_USER_ID,
    conn: sqlite3.Connection | None = None,
) -> list[ChatMessage]:
    """Conversation history in chronological order.

    With `limit`, returns the most recent `limit` messages, still oldest-first,
    which is the order an LLM prompt needs.
    """
    base = "SELECT * FROM chat_messages WHERE user_id = ?"
    params: list[object] = [user_id]

    if limit is None:
        sql = f"{base} ORDER BY created_at, rowid"
    else:
        sql = f"{base} ORDER BY created_at DESC, rowid DESC LIMIT ?"
        params.append(limit)

    with session(conn) as db:
        rows = db.execute(sql, params).fetchall()
    if limit is not None:
        rows = rows[::-1]
    return [ChatMessage.from_row(row) for row in rows]


def clear_messages(
    user_id: str = DEFAULT_USER_ID,
    conn: sqlite3.Connection | None = None,
) -> int:
    """Delete all chat history for the user. Returns the number of rows deleted."""
    with session(conn) as db:
        cursor = db.execute("DELETE FROM chat_messages WHERE user_id = ?", (user_id,))
        return cursor.rowcount
