from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from analytics_agent.clients.supabase_client import get_supabase_client
from analytics_agent.logging_config import get_logger


logger = get_logger(__name__)

_ALLOWED_STATUS = {"pending", "accepted", "in_progress", "implemented", "rejected"}
_FALLBACK_STORE: dict[str, dict[str, Any]] = {}


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _normalize_status(value: Any) -> str:
    raw = str(value or "").strip().lower()
    return raw if raw in _ALLOWED_STATUS else "pending"


def _normalize_record(payload: dict[str, Any]) -> dict[str, Any]:
    now = _utc_now_iso()
    record = {
        "suggestion_id": str(payload.get("suggestion_id") or "").strip(),
        "client_id": str(payload.get("client_id") or "").strip() or "anonymous-client",
        "thread_id": str(payload.get("thread_id") or "").strip() or "global",
        "title": payload.get("title"),
        "description": payload.get("description"),
        "prompt": payload.get("prompt"),
        "source": payload.get("source"),
        "status": _normalize_status(payload.get("status")),
        "accepted_at": payload.get("accepted_at"),
        "submitted_at": payload.get("submitted_at"),
        "owner": payload.get("owner"),
        "due_date": payload.get("due_date"),
        "expected_impact": payload.get("expected_impact"),
        "actual_impact": payload.get("actual_impact"),
        "outcome_notes": payload.get("outcome_notes"),
        "last_updated_at": payload.get("last_updated_at") or now,
    }
    if not record["suggestion_id"]:
        raise ValueError("suggestion_id is required")
    return record


def _fallback_key(client_id: str, thread_id: str | None, suggestion_id: str) -> str:
    return f"{client_id}::{thread_id or 'global'}::{suggestion_id}"


def upsert_recommendation_outcome(payload: dict[str, Any]) -> dict[str, Any]:
    record = _normalize_record(payload)

    # Always keep an in-memory copy as a resilience fallback.
    key = _fallback_key(record["client_id"], record.get("thread_id"), record["suggestion_id"])
    _FALLBACK_STORE[key] = record

    try:
        supabase = get_supabase_client()
        (
            supabase.table("recommendation_outcomes")
            .upsert(record, on_conflict="client_id,thread_id,suggestion_id")
            .execute()
        )
    except Exception as exc:
        logger.warning("Recommendation outcome upsert fallback to memory", error=str(exc))

    return record


def list_recommendation_outcomes(client_id: str | None = None, thread_id: str | None = None) -> list[dict[str, Any]]:
    normalized_client = (client_id or "").strip() or "anonymous-client"

    try:
        supabase = get_supabase_client()
        query = (
            supabase.table("recommendation_outcomes")
            .select("*")
            .eq("client_id", normalized_client)
            .order("last_updated_at", desc=True)
            .limit(200)
        )
        if thread_id:
            query = query.eq("thread_id", thread_id)
        response = query.execute()
        rows = response.data or []
        if rows:
            return rows
    except Exception as exc:
        logger.warning("Recommendation outcomes list fallback to memory", error=str(exc))

    items = []
    for row in _FALLBACK_STORE.values():
        if row.get("client_id") != normalized_client:
            continue
        if thread_id and row.get("thread_id") != thread_id:
            continue
        items.append(row)

    items.sort(key=lambda item: str(item.get("last_updated_at") or ""), reverse=True)
    return items[:200]


