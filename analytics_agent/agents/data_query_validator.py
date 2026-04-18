from __future__ import annotations

from dataclasses import dataclass
from typing import Any


ALLOWED_OPERATORS = {"=", "!=", ">", ">=", "<", "<=", "in", "contains"}
ALLOWED_AGGREGATIONS = {"sum", "avg", "count", "min", "max"}
ALLOWED_DIRECTIONS = {"asc", "desc"}
MAX_LIMIT = 200
DEFAULT_LIMIT = 50

ALLOWED_JOINS: dict[frozenset[str], tuple[str, str]] = {
    frozenset({"customers", "transactions"}): ("customer_id", "customer_id"),
    frozenset({"customers", "retention"}): ("customer_id", "customer_id"),
    frozenset({"customers", "events"}): ("customer_id", "customer_id"),
    frozenset({"campaigns", "events"}): ("campaign_id", "campaign_id"),
    frozenset({"campaigns", "transactions"}): ("campaign_id", "campaign_id"),
}


@dataclass
class QueryValidationResult:
    query_spec: dict[str, Any]
    warnings: list[str]


class DataQueryValidator:
    """Validates and normalizes a structured query spec."""

    def validate(
        self,
        *,
        query_spec: dict[str, Any],
        schema_catalog: dict[str, dict[str, Any]],
    ) -> QueryValidationResult:
        if not isinstance(query_spec, dict):
            raise ValueError("Planner output must be a JSON object.")

        datasets = self._normalize_datasets(query_spec.get("datasets"), schema_catalog)
        if not datasets:
            raise ValueError("No valid dataset found in query plan.")

        normalized: dict[str, Any] = {
            "datasets": datasets,
            "select": self._as_string_list(query_spec.get("select")),
            "filters": self._normalize_filters(query_spec.get("filters")),
            "group_by": self._as_string_list(query_spec.get("group_by")),
            "aggregations": self._normalize_aggregations(query_spec.get("aggregations")),
            "order_by": self._normalize_order_by(query_spec.get("order_by")),
            "limit": self._normalize_limit(query_spec.get("limit")),
            "question_type": str(query_spec.get("question_type") or "lookup").strip().lower() or "lookup",
            "joins": self._normalize_joins(query_spec.get("joins")),
        }

        warnings: list[str] = []
        for field_name in normalized["select"]:
            self._assert_field_valid(field_name, datasets, schema_catalog, aliases=[])

        for group_field in normalized["group_by"]:
            self._assert_field_valid(group_field, datasets, schema_catalog, aliases=[])

        for flt in normalized["filters"]:
            self._assert_field_valid(str(flt["field"]), datasets, schema_catalog, aliases=[])

        aliases: list[str] = []
        for agg in normalized["aggregations"]:
            field = str(agg.get("field") or "").strip()
            fn_name = str(agg.get("fn") or "").strip().lower()
            if fn_name not in ALLOWED_AGGREGATIONS:
                raise ValueError(f"Unsupported aggregation function '{fn_name}'.")

            if field not in {"*", ""}:
                self._assert_field_valid(field, datasets, schema_catalog, aliases=[])

            alias = str(agg.get("alias") or "").strip()
            if not alias:
                alias = f"{fn_name}_{field.replace('.', '_')}" if field else f"{fn_name}_value"
                agg["alias"] = alias
            aliases.append(alias)

        for order in normalized["order_by"]:
            field = str(order.get("field") or "").strip()
            if field in aliases:
                continue
            self._assert_field_valid(field, datasets, schema_catalog, aliases=aliases)

        if len(datasets) > 1:
            self._validate_join_path(datasets, schema_catalog)

        if not normalized["select"] and normalized["aggregations"]:
            normalized["select"] = list(normalized["group_by"])
            normalized["select"].extend([str(agg["alias"]) for agg in normalized["aggregations"]])

        if not normalized["order_by"] and normalized["aggregations"]:
            normalized["order_by"] = [{"field": str(normalized["aggregations"][0]["alias"]), "direction": "desc"}]

        return QueryValidationResult(query_spec=normalized, warnings=warnings)

    def _normalize_datasets(
        self,
        raw: Any,
        schema_catalog: dict[str, dict[str, Any]],
    ) -> list[str]:
        if isinstance(raw, str):
            candidates = [raw]
        elif isinstance(raw, list):
            candidates = raw
        else:
            candidates = []

        normalized: list[str] = []
        for item in candidates:
            dataset = str(item or "").strip().lower()
            if not dataset or dataset not in schema_catalog:
                continue
            if dataset not in normalized:
                normalized.append(dataset)
        return normalized[:3]

    def _as_string_list(self, raw: Any) -> list[str]:
        if not isinstance(raw, list):
            return []
        normalized: list[str] = []
        for item in raw:
            value = str(item or "").strip()
            if value and value not in normalized:
                normalized.append(value)
        return normalized

    def _normalize_filters(self, raw: Any) -> list[dict[str, Any]]:
        if not isinstance(raw, list):
            return []
        filters: list[dict[str, Any]] = []
        for item in raw:
            if not isinstance(item, dict):
                continue
            field = str(item.get("field") or "").strip()
            op = str(item.get("op") or "=").strip().lower()
            if not field:
                continue
            if op not in ALLOWED_OPERATORS:
                raise ValueError(f"Unsupported filter operator '{op}'.")
            filters.append({"field": field, "op": op, "value": item.get("value")})
        return filters

    def _normalize_aggregations(self, raw: Any) -> list[dict[str, Any]]:
        if not isinstance(raw, list):
            return []
        aggregations: list[dict[str, Any]] = []
        for item in raw:
            if not isinstance(item, dict):
                continue
            field = str(item.get("field") or "").strip()
            fn_name = str(item.get("fn") or "").strip().lower()
            alias = str(item.get("alias") or "").strip()
            if not fn_name:
                continue
            aggregations.append({"field": field, "fn": fn_name, "alias": alias})
        return aggregations

    def _normalize_order_by(self, raw: Any) -> list[dict[str, Any]]:
        if not isinstance(raw, list):
            return []
        order_by: list[dict[str, Any]] = []
        for item in raw:
            if not isinstance(item, dict):
                continue
            field = str(item.get("field") or "").strip()
            direction = str(item.get("direction") or "asc").strip().lower()
            if not field:
                continue
            if direction not in ALLOWED_DIRECTIONS:
                raise ValueError(f"Unsupported sort direction '{direction}'.")
            order_by.append({"field": field, "direction": direction})
        return order_by

    def _normalize_limit(self, raw: Any) -> int:
        try:
            parsed = int(raw)
        except Exception:
            parsed = DEFAULT_LIMIT
        return max(1, min(MAX_LIMIT, parsed))

    def _normalize_joins(self, raw: Any) -> list[dict[str, Any]]:
        if not isinstance(raw, list):
            return []
        joins: list[dict[str, Any]] = []
        for item in raw:
            if not isinstance(item, dict):
                continue
            left = str(item.get("left_dataset") or "").strip().lower()
            right = str(item.get("right_dataset") or "").strip().lower()
            left_key = str(item.get("left_key") or "").strip()
            right_key = str(item.get("right_key") or "").strip()
            if not left or not right or not left_key or not right_key:
                continue
            joins.append(
                {
                    "left_dataset": left,
                    "right_dataset": right,
                    "left_key": left_key,
                    "right_key": right_key,
                }
            )
        return joins

    def _assert_field_valid(
        self,
        field_name: str,
        datasets: list[str],
        schema_catalog: dict[str, dict[str, Any]],
        aliases: list[str],
    ) -> None:
        if not field_name:
            raise ValueError("Field name cannot be empty.")
        if field_name in aliases:
            return

        if "." in field_name:
            dataset, column = field_name.split(".", 1)
            if dataset not in datasets:
                raise ValueError(f"Field '{field_name}' references dataset '{dataset}' not in query datasets.")
            if column not in (schema_catalog.get(dataset, {}).get("columns") or []):
                raise ValueError(f"Unknown column '{column}' for dataset '{dataset}'.")
            return

        matches: list[tuple[str, str]] = []
        for dataset in datasets:
            for column in schema_catalog.get(dataset, {}).get("columns") or []:
                if column == field_name:
                    matches.append((dataset, column))

        if not matches:
            raise ValueError(f"Unknown field '{field_name}' for selected datasets.")
        if len(matches) > 1:
            matched_datasets = ", ".join(sorted({dataset for dataset, _ in matches}))
            raise ValueError(
                f"Field '{field_name}' is ambiguous across datasets ({matched_datasets}). Use dataset.field format."
            )

    def _validate_join_path(self, datasets: list[str], schema_catalog: dict[str, dict[str, Any]]) -> None:
        connected: set[str] = {datasets[0]}
        remaining = set(datasets[1:])

        while remaining:
            progress = False
            for dataset in list(remaining):
                for anchor in connected:
                    if self._join_for(anchor, dataset, schema_catalog) is not None:
                        connected.add(dataset)
                        remaining.remove(dataset)
                        progress = True
                        break
                if progress:
                    break
            if not progress:
                unresolved = ", ".join(sorted(remaining))
                raise ValueError(
                    f"Cannot safely join dataset(s): {unresolved}. Only approved join paths are allowed."
                )

    def _join_for(
        self,
        left_dataset: str,
        right_dataset: str,
        schema_catalog: dict[str, dict[str, Any]],
    ) -> tuple[str, str] | None:
        key = frozenset({left_dataset, right_dataset})
        join_pair = ALLOWED_JOINS.get(key)
        if not join_pair:
            return None

        left_columns = set(schema_catalog.get(left_dataset, {}).get("columns") or [])
        right_columns = set(schema_catalog.get(right_dataset, {}).get("columns") or [])
        left_key, right_key = join_pair
        if left_key in left_columns and right_key in right_columns:
            return left_key, right_key
        if right_key in left_columns and left_key in right_columns:
            return right_key, left_key
        return None
