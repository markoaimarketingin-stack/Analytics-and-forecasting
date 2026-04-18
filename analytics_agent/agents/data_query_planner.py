from __future__ import annotations

import json
import re
from datetime import datetime, timedelta, timezone
from typing import Any

from analytics_agent.clients.gemini_client import GeminiClient


DEFAULT_LIMIT = 50


class DataQueryPlanner:
    """Builds a structured, non-SQL query spec from a natural-language question."""

    def __init__(self, gemini_client: GeminiClient | None = None) -> None:
        self.gemini_client = gemini_client

    def plan(self, *, prompt: str, schema_catalog: dict[str, dict[str, Any]]) -> dict[str, Any]:
        llm_spec = self._plan_with_llm(prompt=prompt, schema_catalog=schema_catalog)
        if llm_spec:
            return llm_spec
        return self._fallback_plan(prompt=prompt, schema_catalog=schema_catalog)

    def _plan_with_llm(self, *, prompt: str, schema_catalog: dict[str, dict[str, Any]]) -> dict[str, Any] | None:
        if not self.gemini_client or not getattr(self.gemini_client, "enabled", False):
            return None

        schema_payload = json.dumps(schema_catalog, default=str)
        planner_prompt = f"""
You are a data query planner.
Return ONLY valid JSON.
Never return SQL.

Goal:
Convert user question to a structured query spec.

Allowed datasets and schema:
{schema_payload}

Rules:
1. Use only datasets and columns from the schema.
2. Prefer one dataset when possible.
3. Use `question_type` in ["lookup","aggregation","ranking","trend","comparison"].
4. Allowed filter operators: =, !=, >, >=, <, <=, in, contains.
5. Allowed aggregation functions: sum, avg, count, min, max.
6. Limit must be an integer from 1 to 200.
7. If data seems insufficient, still return best-effort spec with empty arrays where needed.

Output JSON shape:
{{
  "datasets": ["transactions"],
  "select": ["segment"],
  "filters": [{{"field":"purchase_date","op":">=","value":"2026-03-01"}}],
  "group_by": ["segment"],
  "aggregations": [{{"field":"revenue","fn":"sum","alias":"total_revenue"}}],
  "order_by": [{{"field":"total_revenue","direction":"desc"}}],
  "limit": 50,
  "question_type": "aggregation"
}}

User question:
{prompt}
"""
        try:
            raw = self.gemini_client.generate(planner_prompt)
            if not raw or not raw.strip():
                return None
            cleaned = raw.strip().replace("```json", "").replace("```", "").strip()
            parsed = json.loads(cleaned)
            if isinstance(parsed, dict):
                return parsed
        except Exception:
            return None
        return None

    def _fallback_plan(self, *, prompt: str, schema_catalog: dict[str, dict[str, Any]]) -> dict[str, Any]:
        lowered = (prompt or "").strip().lower()
        datasets = self._choose_datasets(lowered, schema_catalog)
        primary_dataset = datasets[0] if datasets else "transactions"
        schema = schema_catalog.get(primary_dataset, {})
        columns = set(schema.get("columns") or [])
        numeric_columns = list(schema.get("numeric_columns") or [])
        date_columns = list(schema.get("date_columns") or [])

        limit = self._extract_limit(lowered)
        filters = self._extract_date_filters(lowered, date_columns)
        group_by: list[str] = []
        aggregations: list[dict[str, Any]] = []
        select: list[str] = []
        order_by: list[dict[str, Any]] = []
        question_type = "lookup"

        if "top " in lowered or "highest" in lowered or "best" in lowered:
            question_type = "ranking"

        if any(token in lowered for token in ["sum", "total", "average", "avg", "count", "by "]):
            question_type = "aggregation"

        if any(token in lowered for token in ["trend", "over time", "daily", "monthly", "weekly"]):
            question_type = "trend"

        revenue_like = self._first_existing(
            ["revenue", "amount", "value", "profit", "spend"],
            columns,
        )
        if not revenue_like and numeric_columns:
            revenue_like = numeric_columns[0]

        candidate_group = self._first_existing(
            ["segment", "channel", "campaign_type", "campaign_id", "customer_id", "event_type"],
            columns,
        )
        if " by " in lowered and candidate_group:
            group_by = [candidate_group]
            select = [candidate_group]

        if question_type in {"aggregation", "ranking"} and revenue_like:
            aggregations = [{"field": revenue_like, "fn": "sum", "alias": f"total_{revenue_like}"}]
            if group_by:
                order_by = [{"field": f"total_{revenue_like}", "direction": "desc"}]
            else:
                select = [revenue_like]

        if question_type == "trend":
            trend_date = date_columns[0] if date_columns else self._first_existing(["date", "purchase_date", "timestamp"], columns)
            if trend_date:
                group_by = [trend_date]
                select = [trend_date]
                if revenue_like:
                    aggregations = [{"field": revenue_like, "fn": "sum", "alias": f"total_{revenue_like}"}]
                    order_by = [{"field": trend_date, "direction": "asc"}]

        if not select:
            select = list(schema.get("columns") or [])[:5]

        return {
            "datasets": datasets or [primary_dataset],
            "select": select,
            "filters": filters,
            "group_by": group_by,
            "aggregations": aggregations,
            "order_by": order_by,
            "limit": limit,
            "question_type": question_type,
        }

    def _choose_datasets(self, lowered_prompt: str, schema_catalog: dict[str, dict[str, Any]]) -> list[str]:
        candidates: list[str] = []
        mapping = {
            "transactions": ["transaction", "revenue", "sales", "purchase", "order", "gmv"],
            "campaigns": ["campaign", "spend", "roas", "ads", "channel"],
            "events": ["event", "journey", "click", "view", "funnel"],
            "customers": ["customer", "segment", "signup", "user"],
            "retention": ["retention", "churn", "cohort", "renewal"],
        }
        for dataset, keywords in mapping.items():
            if dataset not in schema_catalog:
                continue
            if any(keyword in lowered_prompt for keyword in keywords):
                candidates.append(dataset)

        if not candidates:
            fallback = [name for name, meta in schema_catalog.items() if int(meta.get("row_count") or 0) > 0]
            return fallback[:1]
        return candidates[:2]

    def _extract_limit(self, lowered_prompt: str) -> int:
        match = re.search(r"\btop\s+(\d{1,3})\b", lowered_prompt)
        if not match:
            match = re.search(r"\blimit\s+(\d{1,3})\b", lowered_prompt)
        if match:
            value = int(match.group(1))
            return max(1, min(200, value))
        return DEFAULT_LIMIT

    def _extract_date_filters(self, lowered_prompt: str, date_columns: list[str]) -> list[dict[str, Any]]:
        if not date_columns:
            return []
        date_field = date_columns[0]
        now = datetime.now(timezone.utc)
        filters: list[dict[str, Any]] = []

        relative_match = re.search(r"last\s+(\d{1,3})\s+days?", lowered_prompt)
        if relative_match:
            days = int(relative_match.group(1))
            start = (now - timedelta(days=days)).date().isoformat()
            filters.append({"field": date_field, "op": ">=", "value": start})
            return filters

        if "last month" in lowered_prompt:
            start = (now - timedelta(days=30)).date().isoformat()
            filters.append({"field": date_field, "op": ">=", "value": start})
            return filters

        explicit_dates = re.findall(r"\b(20\d{2}-\d{2}-\d{2})\b", lowered_prompt)
        if len(explicit_dates) >= 2:
            filters.append({"field": date_field, "op": ">=", "value": explicit_dates[0]})
            filters.append({"field": date_field, "op": "<=", "value": explicit_dates[1]})
        elif len(explicit_dates) == 1:
            filters.append({"field": date_field, "op": ">=", "value": explicit_dates[0]})

        return filters

    def _first_existing(self, candidates: list[str], available: set[str]) -> str | None:
        for candidate in candidates:
            if candidate in available:
                return candidate
        return None
