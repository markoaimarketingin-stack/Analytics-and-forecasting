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


def list_chat_messages(client_id: str, thread_id: str, limit: int = 200) -> list[dict[str, Any]]:
    if not get_chat_thread(client_id, thread_id):
        return []

    supabase = get_supabase_client()
    try:
        result = (
            supabase.table("chat_messages")
            .select("id,thread_id,role,content,metadata,created_at")
            .eq("thread_id", thread_id)
            .order("created_at", desc=False)
            .limit(limit)
            .execute()
        )
        return [
            _normalize_message_metadata(item)
            for item in (result.data or [])
        ]
    except Exception as exc:
        if _is_missing_column_error(exc, "metadata"):
            logger.warning(
                "Falling back to chat history query without metadata column",
                thread_id=thread_id,
            )
            try:
                result = (
                    supabase.table("chat_messages")
                    .select("id,thread_id,role,content,created_at")
                    .eq("thread_id", thread_id)
                    .order("created_at", desc=False)
                    .limit(limit)
                    .execute()
                )
                return [
                    _normalize_message_metadata(item)
                    for item in (result.data or [])
                ]
            except Exception as nested_exc:
                if not _is_missing_column_error(nested_exc, "thread_id"):
                    raise
                exc = nested_exc
        elif not _is_missing_column_error(exc, "thread_id"):
            raise

        logger.warning(
            "Falling back to legacy session_id chat history query",
            thread_id=thread_id,
        )
        try:
            legacy_result = (
                supabase.table("chat_messages")
                .select("id,session_id,role,content,metadata,created_at")
                .eq("session_id", thread_id)
                .order("created_at", desc=False)
                .limit(limit)
                .execute()
            )
        except Exception as legacy_exc:
            if not _is_missing_column_error(legacy_exc, "metadata"):
                raise
            logger.warning(
                "Falling back to legacy session_id chat history query without metadata column",
                thread_id=thread_id,
            )
            legacy_result = (
                supabase.table("chat_messages")
                .select("id,session_id,role,content,created_at")
                .eq("session_id", thread_id)
                .order("created_at", desc=False)
                .limit(limit)
                .execute()
            )
        return [
            _normalize_message_metadata(_normalize_message_thread_id(item, thread_id))
            for item in (legacy_result.data or [])
        ]


def list_recent_messages(client_id: str, thread_id: str, limit: int = 10) -> list[dict[str, Any]]:
    if not get_chat_thread(client_id, thread_id):
        return []

    supabase = get_supabase_client()
    try:
        result = (
            supabase.table("chat_messages")
            .select("role,content,created_at")
            .eq("thread_id", thread_id)
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        items = result.data or []
    except Exception as exc:
        if not _is_missing_column_error(exc, "thread_id"):
            raise

        logger.warning(
            "Falling back to legacy session_id recent history query",
            thread_id=thread_id,
        )
        legacy_result = (
            supabase.table("chat_messages")
            .select("role,content,created_at")
            .eq("session_id", thread_id)
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        items = legacy_result.data or []
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
        elif _is_missing_column_error(exc, "thread_id"):
            retry_payload = {
                "session_id": thread_id,
                "role": role,
                "content": content,
                "metadata": metadata or {},
                "created_at": now,
            }
            logger.warning(
                "Retrying chat_messages insert with session_id legacy schema",
                thread_id=thread_id,
            )
            try:
                inserted = (
                    supabase.table("chat_messages")
                    .insert(retry_payload)
                    .execute()
                )
            except Exception as nested_exc:
                if not _is_session_fk_error(nested_exc):
                    raise
                logger.warning(
                    "Skipping chat_messages legacy session_id persistence due to missing chat_sessions row",
                    thread_id=thread_id,
                )
                inserted = None
        elif _is_session_fk_error(exc):
            logger.warning(
                "Skipping chat_messages legacy session_id persistence due to missing chat_sessions row",
                thread_id=thread_id,
            )
            inserted = None
        elif _is_missing_column_error(exc, "metadata"):
            retry_payload = {
                "thread_id": thread_id,
                "role": role,
                "content": content,
                "created_at": now,
            }
            logger.warning(
                "Retrying chat_messages insert without metadata column",
                thread_id=thread_id,
            )
            try:
                inserted = (
                    supabase.table("chat_messages")
                    .insert(retry_payload)
                    .execute()
                )
            except Exception as nested_exc:
                if not _is_missing_column_error(nested_exc, "thread_id"):
                    raise
                legacy_retry_payload = {
                    "session_id": thread_id,
                    "role": role,
                    "content": content,
                    "created_at": now,
                }
                logger.warning(
                    "Retrying chat_messages insert with session_id and without metadata column",
                    thread_id=thread_id,
                )
                try:
                    inserted = (
                        supabase.table("chat_messages")
                        .insert(legacy_retry_payload)
                        .execute()
                    )
                except Exception as legacy_nested_exc:
                    if not _is_session_fk_error(legacy_nested_exc):
                        raise
                    logger.warning(
                        "Skipping chat_messages legacy session_id persistence without metadata due to missing chat_sessions row",
                        thread_id=thread_id,
                    )
                    inserted = None
        elif "column \"session_id\"" in error_text and "not-null" in error_text:
            retry_payload = {
                **insert_payload,
                "session_id": thread_id,
            }
            logger.warning(
                "Retrying chat_messages insert with session_id compatibility",
                thread_id=thread_id,
            )
            try:
                inserted = (
                    supabase.table("chat_messages")
                    .insert(retry_payload)
                    .execute()
                )
            except Exception as nested_exc:
                if not _is_session_fk_error(nested_exc):
                    raise
                logger.warning(
                    "Skipping chat_messages session_id compatibility persistence due to missing chat_sessions row",
                    thread_id=thread_id,
                )
                inserted = None
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

