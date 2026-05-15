from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from analytics_agent.clients.supabase_client import get_supabase_client
from analytics_agent.logging_config import get_logger


logger = get_logger(__name__)

_CHAT_SCHEMA: dict[str, bool] | None = None
_CHAT_SESSIONS_SCHEMA: dict[str, bool] | None = None


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _derive_title(message: str, fallback: str = "New Chat") -> str:
    cleaned = " ".join((message or "").strip().split())
    if not cleaned:
        return fallback
    return cleaned[:70] + ("..." if len(cleaned) > 70 else "")


def _is_missing_column_error(exc: Exception, column_name: str) -> bool:
    error_text = str(exc).lower()
    return (
        (
            f"column chat_messages.{column_name}".lower() in error_text
            and "does not exist" in error_text
        )
        or (
            f"'{column_name}' column of 'chat_messages'".lower() in error_text
            and "schema cache" in error_text
        )
    )


def _normalize_message_thread_id(message: dict[str, Any], thread_id: str) -> dict[str, Any]:
    normalized = dict(message)
    normalized["thread_id"] = str(
        normalized.get("thread_id")
        or normalized.get("session_id")
        or thread_id
    )
    normalized.pop("session_id", None)
    return normalized


def _normalize_message_metadata(message: dict[str, Any]) -> dict[str, Any]:
    normalized = dict(message)
    normalized["metadata"] = normalized.get("metadata") or {}
    return normalized


def _is_session_fk_error(exc: Exception) -> bool:
    error_text = str(exc).lower()
    return (
        "chat_messages_session_id_fkey" in error_text
        or (
            "session_id" in error_text
            and "chat_sessions" in error_text
            and "not present" in error_text
        )
    )


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


def _detect_chat_messages_schema() -> dict[str, bool]:
    global _CHAT_SCHEMA
    if _CHAT_SCHEMA is not None:
        return _CHAT_SCHEMA

    supabase = get_supabase_client()
    schema = {
        "thread_id": True,
        "session_id": True,
        "metadata": True,
    }

    for column in ("thread_id", "session_id", "metadata"):
        try:
            (
                supabase.table("chat_messages")
                .select(column)
                .limit(1)
                .execute()
            )
        except Exception as exc:
            if _is_missing_column_error(exc, column):
                schema[column] = False
            else:
                logger.warning(
                    "Chat schema detection failed",
                    column=column,
                    error=str(exc),
                )

    _CHAT_SCHEMA = schema
    return schema


def _detect_chat_sessions_schema() -> dict[str, bool]:
    global _CHAT_SESSIONS_SCHEMA
    if _CHAT_SESSIONS_SCHEMA is not None:
        return _CHAT_SESSIONS_SCHEMA

    supabase = get_supabase_client()
    schema = {
        "client_id": True,
        "title": True,
        "owner": True,
        "created_at": True,
        "updated_at": True,
    }

    for column in schema:
        try:
            (
                supabase.table("chat_sessions")
                .select(column)
                .limit(1)
                .execute()
            )
        except Exception as exc:
            error_text = str(exc).lower()
            if "chat_sessions" in error_text and ("schema cache" in error_text or "does not exist" in error_text):
                schema[column] = False
            else:
                logger.warning(
                    "Chat sessions schema detection failed",
                    column=column,
                    error=str(exc),
                )

    _CHAT_SESSIONS_SCHEMA = schema
    return schema


def _ensure_chat_session_row(client_id: str, session_id: str) -> bool:
    supabase = get_supabase_client()
    now = _utc_now_iso()
    schema = _detect_chat_sessions_schema()

    payload: dict[str, Any] = {"id": session_id}
    if schema.get("client_id", False):
        payload["client_id"] = client_id
    if schema.get("title", False):
        payload.setdefault("title", "New Chat")
    if schema.get("owner", False):
        payload.setdefault("owner", None)
    if schema.get("created_at", False):
        payload.setdefault("created_at", now)
    if schema.get("updated_at", False):
        payload.setdefault("updated_at", now)

    try:
        supabase.table("chat_sessions").upsert(payload).execute()
        return True
    except Exception as exc:
        logger.warning(
            "Unable to ensure chat_sessions row",
            session_id=session_id,
            error=str(exc),
        )
        return False


def list_chat_messages(client_id: str, thread_id: str, limit: int = 200) -> list[dict[str, Any]]:
    if not get_chat_thread(client_id, thread_id):
        return []

    supabase = get_supabase_client()
    schema = _detect_chat_messages_schema()
    select_fields = ["id", "role", "content", "created_at"]
    if schema.get("metadata", True):
        select_fields.append("metadata")

    if schema.get("thread_id", True):
        select_fields.insert(1, "thread_id")
        result = (
            supabase.table("chat_messages")
            .select(",".join(select_fields))
            .eq("thread_id", thread_id)
            .order("created_at", desc=False)
            .limit(limit)
            .execute()
        )
        items = result.data or []
        if items:
            return [_normalize_message_metadata(item) for item in items]

    if schema.get("session_id", False):
        session_fields = ["id", "session_id", "role", "content", "created_at"]
        if schema.get("metadata", True):
            session_fields.append("metadata")
        result = (
            supabase.table("chat_messages")
            .select(",".join(session_fields))
            .eq("session_id", thread_id)
            .order("created_at", desc=False)
            .limit(limit)
            .execute()
        )
        return [
            _normalize_message_metadata(_normalize_message_thread_id(item, thread_id))
            for item in (result.data or [])
        ]

    return []


def list_recent_messages(client_id: str, thread_id: str, limit: int = 10) -> list[dict[str, Any]]:
    if not get_chat_thread(client_id, thread_id):
        return []

    supabase = get_supabase_client()
    schema = _detect_chat_messages_schema()

    items: list[dict[str, Any]] = []
    if schema.get("thread_id", True):
        result = (
            supabase.table("chat_messages")
            .select("role,content,created_at")
            .eq("thread_id", thread_id)
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        items = result.data or []

    if not items and schema.get("session_id", False):
        result = (
            supabase.table("chat_messages")
            .select("role,content,created_at")
            .eq("session_id", thread_id)
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
    schema = _detect_chat_messages_schema()

    insert_payload: dict[str, Any] = {
        "role": role,
        "content": content,
        "created_at": now,
    }
    if schema.get("metadata", True):
        insert_payload["metadata"] = metadata or {}

    if schema.get("thread_id", True):
        insert_payload["thread_id"] = thread_id
    if schema.get("session_id", False):
        insert_payload["session_id"] = thread_id

    if not schema.get("thread_id", True) and not schema.get("session_id", False):
        logger.warning(
            "Skipping chat_messages insert due to missing thread/session columns",
            thread_id=thread_id,
        )
        insert_payload = {
            "thread_id": thread_id,
            "role": role,
            "content": content,
            "created_at": now,
        }
        return insert_payload

    try:
        inserted = (
            supabase.table("chat_messages")
            .insert(insert_payload)
            .execute()
        )
    except Exception as exc:
        error_text = str(exc).lower()

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
        elif _is_session_fk_error(exc) and schema.get("session_id", False):
            logger.warning(
                "Retrying chat_messages insert after ensuring chat_sessions row",
                thread_id=thread_id,
            )
            if _ensure_chat_session_row(client_id, thread_id):
                inserted = (
                    supabase.table("chat_messages")
                    .insert(insert_payload)
                    .execute()
                )
            else:
                inserted = None
        elif _is_missing_column_error(exc, "metadata") and schema.get("metadata", True):
            fallback_payload = {
                key: value
                for key, value in insert_payload.items()
                if key != "metadata"
            }
            logger.warning(
                "Retrying chat_messages insert without metadata column",
                thread_id=thread_id,
            )
            inserted = (
                supabase.table("chat_messages")
                .insert(fallback_payload)
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

    return ((inserted.data or [insert_payload]) if inserted is not None else [insert_payload])[0]

