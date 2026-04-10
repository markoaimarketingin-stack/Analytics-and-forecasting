from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from analytics_agent.clients.supabase_client import get_supabase_client
from analytics_agent.logging_config import get_logger


logger = get_logger(__name__)


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _derive_title(message: str, fallback: str = "New Chat") -> str:
    cleaned = " ".join((message or "").strip().split())
    if not cleaned:
        return fallback
    return cleaned[:70] + ("..." if len(cleaned) > 70 else "")


def ensure_chat_thread(client_id: str, thread_id: str | None, first_message: str | None = None) -> dict[str, Any]:
    supabase = get_supabase_client()

    if thread_id:
        existing = (
            supabase.table("chat_threads")
            .select("*")
            .eq("id", thread_id)
            .eq("client_id", client_id)
            .limit(1)
            .execute()
        )
        if existing.data:
            return existing.data[0]

    now = _utc_now_iso()
    new_thread_id = thread_id or str(uuid4())
    payload = {
        "id": new_thread_id,
        "client_id": client_id,
        "title": _derive_title(first_message or ""),
        "created_at": now,
        "updated_at": now,
        "last_message_at": now,
        "last_message_preview": "",
    }

    created = (
        supabase.table("chat_threads")
        .insert(payload)
        .execute()
    )
    return (created.data or [payload])[0]


def get_chat_thread(client_id: str, thread_id: str) -> dict[str, Any] | None:
    supabase = get_supabase_client()
    result = (
        supabase.table("chat_threads")
        .select("*")
        .eq("id", thread_id)
        .eq("client_id", client_id)
        .limit(1)
        .execute()
    )
    return result.data[0] if result.data else None


def list_chat_threads(client_id: str, limit: int = 50) -> list[dict[str, Any]]:
    supabase = get_supabase_client()
    result = (
        supabase.table("chat_threads")
        .select("id,title,created_at,updated_at,last_message_at,last_message_preview")
        .eq("client_id", client_id)
        .order("last_message_at", desc=True)
        .limit(limit)
        .execute()
    )
    return result.data or []


def list_chat_messages(client_id: str, thread_id: str, limit: int = 200) -> list[dict[str, Any]]:
    if not get_chat_thread(client_id, thread_id):
        return []

    supabase = get_supabase_client()
    result = (
        supabase.table("chat_messages")
        .select("id,thread_id,role,content,metadata,created_at")
        .eq("thread_id", thread_id)
        .order("created_at", desc=False)
        .limit(limit)
        .execute()
    )
    return result.data or []


def list_recent_messages(client_id: str, thread_id: str, limit: int = 10) -> list[dict[str, Any]]:
    if not get_chat_thread(client_id, thread_id):
        return []

    supabase = get_supabase_client()
    result = (
        supabase.table("chat_messages")
        .select("role,content,created_at")
        .eq("thread_id", thread_id)
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    items = result.data or []
    items.reverse()
    return items


def append_chat_message(
    client_id: str,
    thread_id: str,
    role: str,
    content: str,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    if role not in {"user", "assistant"}:
        raise ValueError("role must be 'user' or 'assistant'")

    thread = get_chat_thread(client_id, thread_id)
    if not thread:
        raise ValueError("Thread not found for client")

    supabase = get_supabase_client()
    now = _utc_now_iso()

    insert_payload = {
        "thread_id": thread_id,
        "role": role,
        "content": content,
        "metadata": metadata or {},
        "created_at": now,
    }
    try:
        inserted = (
            supabase.table("chat_messages")
            .insert(insert_payload)
            .execute()
        )
    except Exception as exc:
        error_text = str(exc).lower()

        # Backward-compatible retry for legacy schemas where id is NOT NULL with no default.
        if "column \"id\"" in error_text and "not-null" in error_text:
            retry_payload = {
                **insert_payload,
                "id": str(uuid4()),
            }
            logger.warning(
                "Retrying chat_messages insert with explicit id",
                thread_id=thread_id,
            )
            inserted = (
                supabase.table("chat_messages")
                .insert(retry_payload)
                .execute()
            )
        else:
            raise

    update_payload: dict[str, Any] = {
        "updated_at": now,
        "last_message_at": now,
        "last_message_preview": (content or "")[:140],
    }

    if role == "user" and (thread.get("title") or "").strip().lower() in {"", "new chat"}:
        update_payload["title"] = _derive_title(content)

    (
        supabase.table("chat_threads")
        .update(update_payload)
        .eq("id", thread_id)
        .eq("client_id", client_id)
        .execute()
    )

    return (inserted.data or [insert_payload])[0]

