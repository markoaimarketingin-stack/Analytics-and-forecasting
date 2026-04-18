from __future__ import annotations

from typing import Any

import pandas as pd

from analytics_agent.agents.data_query_validator import ALLOWED_JOINS
from analytics_agent.db import queries


class DataQueryExecutor:
    """Deterministic, safe structured-query executor for client-scoped datasets."""

    def execute(
        self,
        *,
        query_spec: dict[str, Any],
        client_id: str,
        schema_catalog: dict[str, dict[str, Any]],
    ) -> dict[str, Any]:
        datasets: list[str] = list(query_spec.get("datasets") or [])
        if not datasets:
            return self._insufficient("No dataset selected for the query plan.", query_spec, datasets)

        dataframes: dict[str, pd.DataFrame] = {}
        missing_datasets: list[str] = []
        source_map: dict[str, str] = {}

        for dataset in datasets:
            frame, source = queries.get_dataset_dataframe_with_source(dataset, client_id=client_id)
            source_map[dataset] = source
            if source != "client_uploads" or frame.empty:
                missing_datasets.append(dataset)
                continue
            dataframes[dataset] = frame.copy()

        if missing_datasets:
            message = (
                "Not enough information within the available data to answer this request confidently. "
                f"Missing required client dataset(s): {', '.join(sorted(set(missing_datasets)))}. "
                "Upload them in Supervisor -> Train Model and try again."
            )
            return self._insufficient(message, query_spec, datasets, missing_datasets=missing_datasets, sources=source_map)

        prefixed = {name: self._prefix_columns(name, frame) for name, frame in dataframes.items()}
        combined = self._build_joined_dataframe(prefixed, datasets, schema_catalog)
        if combined.empty:
            return self._insufficient(
                "Not enough information within the available data to answer this request confidently.",
                query_spec,
                datasets,
                sources=source_map,
            )

        filtered = self._apply_filters(combined, query_spec.get("filters") or [], datasets)
        if filtered.empty:
            return self._insufficient(
                "Not enough information within the available data to answer this request confidently.",
                query_spec,
                datasets,
                sources=source_map,
            )

        result_frame = self._apply_projection_and_aggregation(filtered, query_spec, datasets)
        if result_frame.empty:
            return self._insufficient(
                "Not enough information within the available data to answer this request confidently.",
                query_spec,
                datasets,
                sources=source_map,
            )

        ordered = self._apply_ordering(result_frame, query_spec.get("order_by") or [], datasets)
        limited = ordered.head(int(query_spec.get("limit") or 50))

        rows = limited.where(pd.notnull(limited), None).to_dict(orient="records")
        columns = [str(column) for column in limited.columns.tolist()]

        if not rows:
            return self._insufficient(
                "Not enough information within the available data to answer this request confidently.",
                query_spec,
                datasets,
                sources=source_map,
            )

        message = f"Found {len(rows)} matching row(s) from {', '.join(datasets)}."
        return {
            "status": "success",
            "message": message,
            "chosen_datasets": datasets,
            "columns": columns,
            "rows": rows,
            "row_count": len(rows),
            "download_ready": bool(rows),
            "insufficient_data": False,
            "query_spec": query_spec,
            "missing_datasets": [],
            "sources": source_map,
        }

    def _prefix_columns(self, dataset: str, frame: pd.DataFrame) -> pd.DataFrame:
        renamed = frame.copy()
        renamed.columns = [f"{dataset}.{column}" for column in frame.columns]
        return renamed

    def _build_joined_dataframe(
        self,
        prefixed_dataframes: dict[str, pd.DataFrame],
        datasets: list[str],
        schema_catalog: dict[str, dict[str, Any]],
    ) -> pd.DataFrame:
        if not datasets:
            return pd.DataFrame()

        merged = prefixed_dataframes[datasets[0]].copy()
        joined_datasets = {datasets[0]}

        for next_dataset in datasets[1:]:
            right = prefixed_dataframes[next_dataset].copy()
            join_found = False
            for anchor in list(joined_datasets):
                join_keys = self._resolve_join_keys(anchor, next_dataset, schema_catalog)
                if not join_keys:
                    continue
                left_key, right_key = join_keys
                left_column = f"{anchor}.{left_key}"
                right_column = f"{next_dataset}.{right_key}"
                if left_column not in merged.columns or right_column not in right.columns:
                    continue
                merged = merged.merge(right, left_on=left_column, right_on=right_column, how="inner")
                joined_datasets.add(next_dataset)
                join_found = True
                break

            if not join_found:
                return pd.DataFrame()

        return merged

    def _resolve_join_keys(
        self,
        left_dataset: str,
        right_dataset: str,
        schema_catalog: dict[str, dict[str, Any]],
    ) -> tuple[str, str] | None:
        join_pair = ALLOWED_JOINS.get(frozenset({left_dataset, right_dataset}))
        if not join_pair:
            return None
        left_key, right_key = join_pair

        left_columns = set(schema_catalog.get(left_dataset, {}).get("columns") or [])
        right_columns = set(schema_catalog.get(right_dataset, {}).get("columns") or [])
        if left_key in left_columns and right_key in right_columns:
            return left_key, right_key
        if right_key in left_columns and left_key in right_columns:
            return right_key, left_key
        return None

    def _apply_filters(
        self,
        frame: pd.DataFrame,
        filters: list[dict[str, Any]],
        datasets: list[str],
    ) -> pd.DataFrame:
        working = frame.copy()
        for flt in filters:
            field = str(flt.get("field") or "").strip()
            operator = str(flt.get("op") or "=").strip().lower()
            value = flt.get("value")
            resolved_field = self._resolve_column(field, working.columns, datasets)
            if not resolved_field:
                continue

            series = working[resolved_field]

            if operator == "contains":
                needle = str(value or "").strip().lower()
                working = working[series.astype(str).str.lower().str.contains(needle, na=False)]
                continue

            if operator == "in":
                values = value if isinstance(value, list) else [value]
                working = working[series.isin(values)]
                continue

            left_series, right_value = self._coerce_for_comparison(series, value)

            if operator == "=":
                working = working[left_series == right_value]
            elif operator == "!=":
                working = working[left_series != right_value]
            elif operator == ">":
                working = working[left_series > right_value]
            elif operator == ">=":
                working = working[left_series >= right_value]
            elif operator == "<":
                working = working[left_series < right_value]
            elif operator == "<=":
                working = working[left_series <= right_value]

        return working

    def _coerce_for_comparison(self, series: pd.Series, value: Any) -> tuple[pd.Series, Any]:
        if pd.api.types.is_numeric_dtype(series):
            try:
                return pd.to_numeric(series, errors="coerce"), float(value)
            except Exception:
                return pd.to_numeric(series, errors="coerce"), value

        datetime_candidate = pd.to_datetime(series, errors="coerce")
        if datetime_candidate.notna().any():
            try:
                return datetime_candidate, pd.to_datetime(value)
            except Exception:
                return datetime_candidate, value

        return series.astype(str), str(value)

    def _apply_projection_and_aggregation(
        self,
        frame: pd.DataFrame,
        query_spec: dict[str, Any],
        datasets: list[str],
    ) -> pd.DataFrame:
        group_by = [self._resolve_column(field, frame.columns, datasets) for field in query_spec.get("group_by") or []]
        group_by = [field for field in group_by if field]
        aggregations = list(query_spec.get("aggregations") or [])
        select = list(query_spec.get("select") or [])

        if not group_by and not aggregations:
            selected_columns = [
                self._resolve_column(field, frame.columns, datasets) for field in select
            ] if select else list(frame.columns)
            selected_columns = [column for column in selected_columns if column]
            return frame[selected_columns].copy() if selected_columns else pd.DataFrame()

        if group_by:
            grouped = frame.groupby(group_by, dropna=False)
            result = grouped.size().reset_index(name="__group_size__")
        else:
            grouped = None
            result = pd.DataFrame([{}])

        for agg in aggregations:
            fn_name = str(agg.get("fn") or "").strip().lower()
            alias = str(agg.get("alias") or "").strip() or f"{fn_name}_value"
            field_name = str(agg.get("field") or "").strip()
            resolved_field = self._resolve_column(field_name, frame.columns, datasets) if field_name and field_name != "*" else None

            if group_by:
                if fn_name == "count" and (field_name == "*" or not resolved_field):
                    agg_frame = grouped.size().reset_index(name=alias)
                else:
                    agg_frame = self._group_aggregate(grouped, resolved_field, fn_name, alias)
                result = result.merge(agg_frame, on=group_by, how="left")
            else:
                value = self._aggregate_scalar(frame, resolved_field, fn_name)
                result[alias] = value

        if "__group_size__" in result.columns and not any(str(agg.get("alias") or "").strip() == "__group_size__" for agg in aggregations):
            result = result.drop(columns=["__group_size__"])

        if select:
            selected_columns: list[str] = []
            for item in select:
                if item in result.columns:
                    selected_columns.append(item)
                    continue
                resolved = self._resolve_column(item, result.columns, datasets)
                if resolved:
                    selected_columns.append(resolved)
            for agg in aggregations:
                alias = str(agg.get("alias") or "").strip()
                if alias and alias in result.columns and alias not in selected_columns:
                    selected_columns.append(alias)
            if selected_columns:
                result = result[selected_columns]

        renamed_columns = {}
        for column in result.columns:
            if "." in column:
                renamed_columns[column] = column.split(".", 1)[1]
        if renamed_columns:
            result = result.rename(columns=renamed_columns)

        return result

    def _group_aggregate(
        self,
        grouped: Any,
        resolved_field: str | None,
        fn_name: str,
        alias: str,
    ) -> pd.DataFrame:
        if not resolved_field:
            return grouped.size().reset_index(name=alias)
        if fn_name == "avg":
            fn_name = "mean"
        if fn_name not in {"sum", "mean", "count", "min", "max"}:
            fn_name = "count"
        return grouped[resolved_field].agg(fn_name).reset_index(name=alias)

    def _aggregate_scalar(self, frame: pd.DataFrame, resolved_field: str | None, fn_name: str) -> Any:
        if fn_name == "count" and not resolved_field:
            return int(len(frame.index))
        if not resolved_field or resolved_field not in frame.columns:
            return None
        series = frame[resolved_field]
        if fn_name == "avg":
            fn_name = "mean"
        if fn_name == "sum":
            return float(series.sum())
        if fn_name == "mean":
            return float(series.mean())
        if fn_name == "count":
            return int(series.count())
        if fn_name == "min":
            return series.min()
        if fn_name == "max":
            return series.max()
        return None

    def _apply_ordering(
        self,
        frame: pd.DataFrame,
        order_by: list[dict[str, Any]],
        datasets: list[str],
    ) -> pd.DataFrame:
        if frame.empty or not order_by:
            return frame

        sort_columns: list[str] = []
        ascending: list[bool] = []
        for item in order_by:
            field = str(item.get("field") or "").strip()
            direction = str(item.get("direction") or "asc").strip().lower()

            if field in frame.columns:
                sort_columns.append(field)
                ascending.append(direction != "desc")
                continue

            resolved = self._resolve_column(field, frame.columns, datasets)
            if resolved and resolved in frame.columns:
                sort_columns.append(resolved)
                ascending.append(direction != "desc")

        if not sort_columns:
            return frame
        return frame.sort_values(by=sort_columns, ascending=ascending, kind="mergesort")

    def _resolve_column(self, field: str, columns: Any, datasets: list[str]) -> str | None:
        value = str(field or "").strip()
        if not value:
            return None

        available = [str(column) for column in columns]
        if value in available:
            return value

        if "." in value:
            if value in available:
                return value
            return None

        suffix = f".{value}"
        matches = [column for column in available if column.endswith(suffix)]
        if len(matches) == 1:
            return matches[0]
        if len(matches) > 1:
            # Should have been validated earlier as ambiguous.
            return None
        return None

    def _insufficient(
        self,
        message: str,
        query_spec: dict[str, Any],
        datasets: list[str],
        missing_datasets: list[str] | None = None,
        sources: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        return {
            "status": "success",
            "message": message,
            "chosen_datasets": datasets,
            "columns": [],
            "rows": [],
            "row_count": 0,
            "download_ready": False,
            "insufficient_data": True,
            "query_spec": query_spec,
            "missing_datasets": missing_datasets or [],
            "sources": sources or {},
        }
