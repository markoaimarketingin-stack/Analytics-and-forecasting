from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from analytics_agent.agents.data_query_executor import DataQueryExecutor
from analytics_agent.agents.data_query_planner import DataQueryPlanner
from analytics_agent.agents.data_query_validator import DataQueryValidator
from analytics_agent.clients.gemini_client import GeminiClient
from analytics_agent.db import queries


@dataclass
class DataQueryRequest:
    prompt: str
    client_id: str
    limit: int = 50


class DataQueryAgent:
    """Client-scoped dynamic query agent with planner -> validator -> executor pipeline."""

    def __init__(self, gemini_client: GeminiClient | None = None) -> None:
        self.planner = DataQueryPlanner(gemini_client=gemini_client)
        self.validator = DataQueryValidator()
        self.executor = DataQueryExecutor()

    def run(self, request: DataQueryRequest) -> dict[str, Any]:
        prompt = str(request.prompt or "").strip()
        client_id = str(request.client_id or "").strip()
        if not prompt:
            raise ValueError("Prompt is required for data query.")
        if not client_id:
            raise ValueError("Client context is required for data query.")

        schema_catalog = queries.get_supported_dataset_schemas(client_id=client_id)
        if not schema_catalog:
            return {
                "status": "success",
                "message": (
                    "No client-linked datasets are available for this account yet. "
                    "Please upload at least one dataset in Supervisor -> Train Model, then run the query again."
                ),
                "chosen_datasets": [],
                "columns": [],
                "rows": [],
                "row_count": 0,
                "download_ready": False,
                "insufficient_data": True,
                "query_spec": {
                    "datasets": [],
                    "select": [],
                    "filters": [],
                    "group_by": [],
                    "aggregations": [],
                    "order_by": [],
                    "limit": request.limit,
                    "question_type": "lookup",
                },
                "missing_datasets": [],
                "sources": {},
            }

        planned_spec = self.planner.plan(prompt=prompt, schema_catalog=schema_catalog)
        if "limit" not in planned_spec and request.limit:
            planned_spec["limit"] = request.limit

        validated = self.validator.validate(query_spec=planned_spec, schema_catalog=schema_catalog)
        execution = self.executor.execute(
            query_spec=validated.query_spec,
            client_id=client_id,
            schema_catalog=schema_catalog,
        )

        execution["planner_output"] = planned_spec
        execution["validated_query_spec"] = validated.query_spec
        execution["warnings"] = validated.warnings
        execution["schema_catalog"] = schema_catalog
        return execution
