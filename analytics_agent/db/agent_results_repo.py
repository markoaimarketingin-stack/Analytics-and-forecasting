from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from analytics_agent.clients.supabase_client import get_supabase_client


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def upsert_client_agent_results(
    client_id: str,
    agent_results: dict[str, Any],
    *,
    thread_id: str | None = None,
    intent: str | None = None,
) -> None:
    if not client_id or not isinstance(agent_results, dict):
        return

    supabase = get_supabase_client()
    now = _utc_now_iso()

    for agent_key, result_payload in agent_results.items():
        if result_payload is None:
            continue

        payload = {
            "client_id": client_id,
            "agent_key": agent_key,
            "result_payload": result_payload,
            "thread_id": thread_id,
            "intent": intent,
            "created_at": now,
            "updated_at": now,
        }

        (
            supabase.table("client_agent_latest_results")
            .upsert(payload, on_conflict="client_id,agent_key")
            .execute()
        )


def upsert_client_latest_snapshot(
    client_id: str,
    *,
    recommendations: list[str] | None = None,
    executive_summary: str | None = None,
    thread_id: str | None = None,
    intent: str | None = None,
) -> None:
    if not client_id:
        return

    supabase = get_supabase_client()
    now = _utc_now_iso()

    payload = {
        "client_id": client_id,
        "recommendations": recommendations or [],
        "executive_summary": executive_summary,
        "thread_id": thread_id,
        "intent": intent,
        "updated_at": now,
    }

    (
        supabase.table("client_latest_analysis_snapshots")
        .upsert(payload, on_conflict="client_id")
        .execute()
    )


def get_client_agent_results(client_id: str, agent_id: str | None = None) -> dict[str, Any]:
    if not client_id:
        return {}

    supabase = get_supabase_client()
    query = (
        supabase.table("client_agent_latest_results")
        .select("agent_key,result_payload")
        .eq("client_id", client_id)
    )

    if agent_id:
        query = query.eq("agent_key", agent_id).limit(1)

    response = query.execute()
    rows = response.data or []

    if agent_id:
        if not rows:
            return {}
        return rows[0].get("result_payload") or {}

    return {
        row.get("agent_key"): row.get("result_payload")
        for row in rows
        if row.get("agent_key")
    }


def get_client_latest_snapshot(client_id: str) -> dict[str, Any]:
    if not client_id:
        return {}

    supabase = get_supabase_client()
    response = (
        supabase.table("client_latest_analysis_snapshots")
        .select("recommendations,executive_summary")
        .eq("client_id", client_id)
        .limit(1)
        .execute()
    )

    return (response.data or [{}])[0] or {}

