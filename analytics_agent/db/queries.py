from __future__ import annotations

import json
import os
from io import StringIO
from pathlib import Path
from typing import Any, Iterable

import pandas as pd

from analytics_agent.clients.supabase_client import (
    download_file_from_storage,
    get_supabase_client,
    list_training_upload_records,
)

DATA_DIR = Path(__file__).resolve().parents[1] / "data"
SUPPORTED_DATASETS = {"campaigns", "customers", "events", "retention", "transactions"}

UPSERT_CONFLICT_COLUMNS: dict[str, str] = {
    "campaigns": "campaign_id,date",
    "customers": "customer_id",
    "events": "customer_id,timestamp,event_type,touch_order",
    "transactions": "customer_id,order_number,purchase_date",
    "retention": "customer_id,tenure_months",
}

_SUPABASE = None
CLIENT_DATASET_CATEGORIES = {"campaigns", "customers", "events", "retention", "transactions"}

AGENT_DATASET_REQUIREMENTS: dict[str, list[tuple[str, ...]]] = {
    "forecast": [("campaigns",)],
    "scenario": [("campaigns",)],
    "budget_allocator": [("campaigns",)],
    "attribution": [("campaigns",), ("events",), ("transactions",)],
    "cohort": [("customers",), ("retention",), ("transactions",)],
    "funnel": [("campaigns", "events")],
}


def _get_supabase():
    global _SUPABASE
    if _SUPABASE is None:
        _SUPABASE = get_supabase_client()
    return _SUPABASE


def _safe_to_records(df: pd.DataFrame) -> list[dict[str, Any]]:
    if df.empty:
        return []
    return df.where(pd.notnull(df), None).to_dict(orient="records")


def _read_local_csv(table_name: str) -> pd.DataFrame:
    file_path = DATA_DIR / f"{table_name}.csv"
    if not file_path.exists():
        return pd.DataFrame()
    return pd.read_csv(file_path)


def _read_remote_table(table_name: str, limit: int | None = None) -> pd.DataFrame:
    try:
        query = _get_supabase().table(table_name).select("*")
        if limit is not None:
            query = query.limit(limit)
        response = query.execute()
        return pd.DataFrame(response.data or [])
    except Exception:
        return pd.DataFrame()


def _get_table_dataframe(table_name: str, limit: int | None = None) -> pd.DataFrame:
    # For now, local bundled data is the source of truth.
    local_df = _read_local_csv(table_name)
    if not local_df.empty:
        if limit is None:
            return local_df
        return local_df.head(limit)

    remote_df = _read_remote_table(table_name, limit)
    return remote_df.head(limit) if limit is not None and not remote_df.empty else remote_df


def _normalize_client_id(client_id: str | None) -> str:
    return str(client_id or "").strip()


def _list_client_training_uploads(client_id: str) -> list[dict[str, Any]]:
    normalized_client_id = _normalize_client_id(client_id)
    if not normalized_client_id:
        return []

    try:
        response = list_training_upload_records(normalized_client_id)
        return response.data or []
    except Exception:
        return []


def _parse_uploaded_dataset_file(path: Path) -> pd.DataFrame:
    suffix = path.suffix.lower()
    if suffix == ".csv":
        return pd.read_csv(path)

    if suffix == ".json":
        with path.open("r", encoding="utf-8") as handle:
            payload = json.load(handle)

        if isinstance(payload, list):
            return pd.DataFrame(payload)

        if isinstance(payload, dict):
            for key in ("rows", "data", "records", "items"):
                value = payload.get(key)
                if isinstance(value, list):
                    return pd.DataFrame(value)
            return pd.DataFrame([payload])

    raise ValueError(f"Unsupported dataset file format: {path.suffix or 'unknown'}")


def _parse_uploaded_dataset_bytes(file_name: str, payload: bytes) -> pd.DataFrame:
    suffix = Path(file_name).suffix.lower()
    if suffix == ".csv":
        text = payload.decode("utf-8-sig", errors="replace")
        return pd.read_csv(StringIO(text))

    if suffix == ".json":
        text = payload.decode("utf-8", errors="replace")
        raw = json.loads(text)
        if isinstance(raw, list):
            return pd.DataFrame(raw)
        if isinstance(raw, dict):
            for key in ("rows", "data", "records", "items"):
                value = raw.get(key)
                if isinstance(value, list):
                    return pd.DataFrame(value)
            return pd.DataFrame([raw])
        return pd.DataFrame()

    raise ValueError(f"Unsupported dataset file format: {suffix or 'unknown'}")


def get_client_dataset_dataframe_with_source(
    dataset_name: str,
    client_id: str,
    limit: int | None = None,
) -> tuple[pd.DataFrame, str]:
    normalized_client_id = _normalize_client_id(client_id)
    if dataset_name not in CLIENT_DATASET_CATEGORIES or not normalized_client_id:
        return pd.DataFrame(), "missing_client_context"

    records = [
        row
        for row in _list_client_training_uploads(normalized_client_id)
        if str(row.get("category") or "").strip().lower() == dataset_name
    ]
    if not records:
        return pd.DataFrame(), "missing_client_upload"

    parsed_frames: list[pd.DataFrame] = []
    training_bucket = os.getenv("SUPABASE_TRAINING_BUCKET", "agent-training-assets")
    for row in records:
        local_path = Path(str(row.get("local_storage_path") or "").strip())
        frame = pd.DataFrame()

        if local_path.exists():
            try:
                frame = _parse_uploaded_dataset_file(local_path)
            except Exception:
                frame = pd.DataFrame()

        if frame.empty:
            remote_path = str(row.get("remote_storage_path") or "").strip()
            file_name = str(row.get("file_name") or "").strip() or remote_path
            if remote_path and file_name:
                try:
                    payload = download_file_from_storage(training_bucket, remote_path)
                    frame = _parse_uploaded_dataset_bytes(file_name, payload)
                except Exception:
                    frame = pd.DataFrame()

        if frame.empty:
            continue
        parsed_frames.append(frame)

    if not parsed_frames:
        return pd.DataFrame(), "missing_client_upload"

    combined = pd.concat(parsed_frames, ignore_index=True, sort=False)
    if limit is not None:
        combined = combined.head(limit)
    return combined, "client_uploads"


def get_missing_client_datasets_for_agents(client_id: str, agent_names: Iterable[str]) -> list[str]:
    normalized_client_id = _normalize_client_id(client_id)
    if not normalized_client_id:
        return []

    missing: list[str] = []
    availability_cache: dict[str, bool] = {}

    def _has_usable_dataset(category: str) -> bool:
        if category in availability_cache:
            return availability_cache[category]
        frame, _ = get_client_dataset_dataframe_with_source(category, normalized_client_id, limit=1)
        is_available = not frame.empty
        availability_cache[category] = is_available
        return is_available

    for agent_name in agent_names:
        requirements = AGENT_DATASET_REQUIREMENTS.get(str(agent_name or "").strip().lower(), [])
        for requirement_group in requirements:
            if any(_has_usable_dataset(category) for category in requirement_group):
                continue
            missing.extend(category for category in requirement_group if category not in missing)

    return missing


def build_missing_client_dataset_message(
    client_id: str,
    dataset_names: Iterable[str],
) -> str:
    normalized_client_id = _normalize_client_id(client_id)
    dataset_list = [name for name in dataset_names if name]
    if not dataset_list:
        return "Required client datasets are missing. Upload them in Supervisor -> Train Model before running analysis."

    pretty_names = ", ".join(sorted(dataset_list))
    return (
        f"Client dataset(s) missing for {normalized_client_id}: {pretty_names}. "
        "Please upload the required file(s) in Supervisor -> Train Model using the matching dataset category, then run the analysis again."
    )


def _get_table_data(table_name: str, limit: int | None = None) -> list[dict[str, Any]]:
    return _safe_to_records(_get_table_dataframe(table_name, limit))


def get_dataset_dataframe(
    dataset_name: str,
    limit: int | None = None,
    prefer_remote: bool = False,
    client_id: str | None = None,
) -> pd.DataFrame:
    if dataset_name not in SUPPORTED_DATASETS:
        return pd.DataFrame()

    normalized_client_id = _normalize_client_id(client_id)
    if normalized_client_id:
        client_df, _ = get_client_dataset_dataframe_with_source(dataset_name, normalized_client_id, limit)
        return client_df

    if prefer_remote:
        remote = _read_remote_table(dataset_name, limit)
        if not remote.empty:
            return remote
    return _get_table_dataframe(dataset_name, limit)


def get_dataset_dataframe_with_source(
    dataset_name: str,
    limit: int | None = None,
    prefer_remote: bool = False,
    client_id: str | None = None,
) -> tuple[pd.DataFrame, str]:
    if dataset_name not in SUPPORTED_DATASETS:
        return pd.DataFrame(), "unsupported"

    normalized_client_id = _normalize_client_id(client_id)
    if normalized_client_id:
        return get_client_dataset_dataframe_with_source(dataset_name, normalized_client_id, limit)

    if prefer_remote:
        remote = _read_remote_table(dataset_name, limit)
        if not remote.empty:
            return remote.head(limit) if limit is not None else remote, "supabase"

        local = _read_local_csv(dataset_name)
        if not local.empty:
            return local.head(limit) if limit is not None else local, "local"

        return pd.DataFrame(), "empty"

    local = _read_local_csv(dataset_name)
    if not local.empty:
        return local.head(limit) if limit is not None else local, "local"

    remote = _read_remote_table(dataset_name, limit)
    if not remote.empty:
        return remote.head(limit) if limit is not None else remote, "supabase"

    return pd.DataFrame(), "empty"


def _looks_like_datetime(series: pd.Series, sample_size: int = 100) -> bool:
    if series.empty:
        return False
    if pd.api.types.is_datetime64_any_dtype(series):
        return True
    if pd.api.types.is_numeric_dtype(series):
        return False
    sample = series.dropna().astype(str).head(sample_size)
    if sample.empty:
        return False
    parsed = pd.to_datetime(sample, errors="coerce")
    return float(parsed.notna().mean()) >= 0.7


def get_supported_dataset_schemas(client_id: str | None = None) -> dict[str, dict[str, Any]]:
    normalized_client_id = _normalize_client_id(client_id)
    schema_catalog: dict[str, dict[str, Any]] = {}

    for dataset_name in sorted(SUPPORTED_DATASETS):
        frame, source = get_dataset_dataframe_with_source(
            dataset_name,
            client_id=normalized_client_id or None,
            prefer_remote=not bool(normalized_client_id),
        )

        # For client-scoped querying, expose only datasets that are truly uploaded
        # for that client and contain usable rows.
        if normalized_client_id:
            if source != "client_uploads" or frame.empty:
                continue

        columns = frame.columns.tolist() if not frame.empty else []
        numeric_columns: list[str] = []
        date_columns: list[str] = []
        filterable_columns: list[str] = []
        groupable_columns: list[str] = []

        if not frame.empty:
            for column in frame.columns:
                series = frame[column]
                filterable_columns.append(column)

                if pd.api.types.is_numeric_dtype(series):
                    numeric_columns.append(column)

                lowered = str(column).strip().lower()
                if _looks_like_datetime(series) or lowered.endswith("_date") or lowered.endswith("_at") or "timestamp" in lowered:
                    date_columns.append(column)

                # High-cardinality identifiers are still groupable for ranked answers.
                groupable_columns.append(column)

        schema_catalog[dataset_name] = {
            "dataset": dataset_name,
            "source": source,
            "row_count": int(len(frame.index)),
            "columns": columns,
            "filterable": sorted(set(filterable_columns)),
            "aggregatable": sorted(set(numeric_columns)),
            "groupable": sorted(set(groupable_columns)),
            "date_columns": sorted(set(date_columns)),
            "numeric_columns": sorted(set(numeric_columns)),
        }

    return schema_catalog


def _unique_non_empty_values(df: pd.DataFrame, column: str) -> list[str]:
    if df.empty or column not in df.columns:
        return []

    values = (
        df[column]
        .dropna()
        .astype(str)
        .map(str.strip)
    )
    unique_values = sorted({value for value in values if value})
    return unique_values


def get_funnel_filter_options(prefer_remote: bool = True, client_id: str | None = None) -> dict[str, Any]:
    campaigns_df, campaigns_source = get_dataset_dataframe_with_source(
        "campaigns",
        prefer_remote=prefer_remote,
        client_id=client_id,
    )
    events_df, events_source = get_dataset_dataframe_with_source(
        "events",
        prefer_remote=prefer_remote,
        client_id=client_id,
    )
    customers_df, customers_source = get_dataset_dataframe_with_source(
        "customers",
        prefer_remote=prefer_remote,
        client_id=client_id,
    )

    campaign_channels = _unique_non_empty_values(campaigns_df, "channel")
    event_channels = _unique_non_empty_values(events_df, "channel")
    channels = sorted(set(campaign_channels).union(event_channels))

    event_types = _unique_non_empty_values(events_df, "event_type")
    event_type_labels = {
        "impression": "Impressions",
        "click": "Clicks",
        "landing_page_view": "Landing Page Views",
        "add_to_cart": "Add To Cart",
        "purchase": "Purchases",
    }

    ordered_event_stages: list[dict[str, str]] = []
    for event_type in ["impression", "click", "landing_page_view", "add_to_cart", "purchase"]:
        if event_type in event_types:
            ordered_event_stages.append(
                {
                    "event_type": event_type,
                    "label": event_type_labels[event_type],
                }
            )

    campaigns_columns = campaigns_df.columns.tolist() if not campaigns_df.empty else []
    events_columns = events_df.columns.tolist() if not events_df.empty else []
    customers_columns = customers_df.columns.tolist() if not customers_df.empty else []

    return {
        "channels": channels,
        "campaign_types": _unique_non_empty_values(campaigns_df, "campaign_type"),
        "segments": _unique_non_empty_values(customers_df, "segment"),
        "event_types": event_types,
        "event_stages": ordered_event_stages,
        "time_periods": ["week", "month", "quarter", "year", "all"],
        "defaults": {
            "channel": "all",
            "campaign_type": "all",
            "segment": "all",
            "event_type": "all",
            "time_period": "month",
        },
        "available_filters": {
            "channel": bool(channels),
            "campaign_type": bool(_unique_non_empty_values(campaigns_df, "campaign_type")),
            "segment": bool(_unique_non_empty_values(customers_df, "segment")),
            "event_type": bool(event_types),
            "time_period": True,
        },
        "sources": {
            "campaigns": campaigns_source,
            "events": events_source,
            "customers": customers_source,
        },
        "row_counts": {
            "campaigns": int(len(campaigns_df.index)),
            "events": int(len(events_df.index)),
            "customers": int(len(customers_df.index)),
        },
        "schema_details": {
            "campaigns": {
                "source": campaigns_source,
                "columns": campaigns_columns,
                "funnel_metrics": [
                    column
                    for column in [
                        "impressions",
                        "clicks",
                        "landing_page_views",
                        "add_to_cart",
                        "purchases",
                    ]
                    if column in campaigns_columns
                ],
                "filter_columns": [column for column in ["channel", "campaign_type", "date"] if column in campaigns_columns],
            },
            "events": {
                "source": events_source,
                "columns": events_columns,
                "event_stage_column": "event_type" if "event_type" in events_columns else "",
                "filter_columns": [column for column in ["channel", "event_type", "timestamp"] if column in events_columns],
            },
            "customers": {
                "source": customers_source,
                "columns": customers_columns,
                "segment_column": "segment" if "segment" in customers_columns else "",
                "join_key": "customer_id" if "customer_id" in customers_columns else "",
            },
        },
    }


def upsert_dataset_rows(dataset_name: str, rows: list[dict[str, Any]]) -> int:
    if dataset_name not in SUPPORTED_DATASETS:
        raise ValueError(f"Unsupported dataset '{dataset_name}'")
    if not rows:
        return 0

    conflict_columns = UPSERT_CONFLICT_COLUMNS.get(dataset_name)
    if conflict_columns:
        _get_supabase().table(dataset_name).upsert(rows, on_conflict=conflict_columns).execute()
    else:
        _get_supabase().table(dataset_name).upsert(rows).execute()

    return len(rows)


def _normalize_datetime(df: pd.DataFrame, columns: Iterable[str]) -> pd.DataFrame:
    out = df.copy()
    for column in columns:
        if column in out.columns:
            out[column] = pd.to_datetime(out[column], errors="coerce")
    return out


def _filter_eq(df: pd.DataFrame, column: str, value: Any) -> pd.DataFrame:
    if df.empty or column not in df.columns:
        return pd.DataFrame()
    return df[df[column] == value]


# ---------------------------------------------------------
# CAMPAIGN DATA
# ---------------------------------------------------------

def get_campaign_data(limit: int | None = None, client_id: str | None = None) -> list[dict[str, Any]]:
    if _normalize_client_id(client_id):
        return _safe_to_records(get_dataset_dataframe("campaigns", limit, client_id=client_id))
    return _get_table_data("campaigns", limit)


def get_campaign_dataframe(limit: int | None = None, client_id: str | None = None) -> pd.DataFrame:
    if _normalize_client_id(client_id):
        return get_dataset_dataframe("campaigns", limit, client_id=client_id)
    return _get_table_dataframe("campaigns", limit)


def get_campaign_dataframe_remote_only(limit: int | None = None) -> pd.DataFrame:
    remote_df = _read_remote_table("campaigns", limit)
    return remote_df.head(limit) if limit is not None and not remote_df.empty else remote_df


def get_campaign_data_remote_only(limit: int | None = None) -> list[dict[str, Any]]:
    return _safe_to_records(get_campaign_dataframe_remote_only(limit))


def get_attribution_filter_options(client_id: str | None = None) -> dict[str, Any]:
    normalized_client_id = _normalize_client_id(client_id)
    if normalized_client_id:
        campaigns_df, campaigns_source = get_dataset_dataframe_with_source("campaigns", client_id=normalized_client_id)
        events_df, events_source = get_dataset_dataframe_with_source("events", client_id=normalized_client_id)
        transactions_df, transactions_source = get_dataset_dataframe_with_source("transactions", client_id=normalized_client_id)
        if campaigns_df.empty or events_df.empty or transactions_df.empty:
            missing = get_missing_client_datasets_for_agents(normalized_client_id, ["attribution"])
            raise ValueError(build_missing_client_dataset_message(normalized_client_id, missing))
    else:
        campaigns_df = get_campaign_dataframe_remote_only()
        events_df = _read_remote_table("events")
        transactions_df = _read_remote_table("transactions")
        campaigns_source = events_source = transactions_source = "supabase"
        if campaigns_df.empty or events_df.empty or transactions_df.empty:
            raise ValueError("Supabase attribution datasets are incomplete. campaigns, events, and transactions are required")

    channels = sorted(
        set(_unique_non_empty_values(campaigns_df, "channel")).union(
            set(_unique_non_empty_values(events_df, "channel"))
        )
    )
    campaign_types = _unique_non_empty_values(campaigns_df, "campaign_type")
    attribution_models = ["linear", "first_click", "last_click", "time_decay"]
    metrics = ["revenue", "roas", "roi", "cac", "cpa", "conversions"]

    min_date = ""
    max_date = ""
    date_series: list[pd.Series] = []
    if "date" in campaigns_df.columns:
        date_series.append(pd.to_datetime(campaigns_df["date"], errors="coerce"))
    if "timestamp" in events_df.columns:
        date_series.append(pd.to_datetime(events_df["timestamp"], errors="coerce"))
    if "purchase_date" in transactions_df.columns:
        date_series.append(pd.to_datetime(transactions_df["purchase_date"], errors="coerce"))

    if date_series:
        merged = pd.concat(date_series, ignore_index=True).dropna()
        if not merged.empty:
            min_date = merged.min().date().isoformat()
            max_date = merged.max().date().isoformat()

    return {
        "channels": channels,
        "campaign_types": campaign_types,
        "attribution_models": attribution_models,
        "metrics": metrics,
        "defaults": {
            "channel": "all",
            "campaign_type": "all",
            "attribution_model": "linear",
            "metric": "revenue",
            "budget_shift_cap_percent": 20,
            "start_date": min_date,
            "end_date": max_date,
        },
        "available_filters": {
            "channel": bool(channels),
            "campaign_type": bool(campaign_types),
            "date_range": bool(min_date and max_date),
        },
        "sources": {
            "campaigns": campaigns_source,
            "events": events_source,
            "transactions": transactions_source,
        },
        "row_counts": {
            "campaigns": int(len(campaigns_df.index)),
            "events": int(len(events_df.index)),
            "transactions": int(len(transactions_df.index)),
        },
        "date_range": {
            "min": min_date,
            "max": max_date,
        },
        "schema_details": {
            "campaigns": {
                "source": "supabase",
                "source": campaigns_source,
                "columns": campaigns_df.columns.tolist(),
            },
            "events": {
                "source": events_source,
                "columns": events_df.columns.tolist(),
            },
            "transactions": {
                "source": transactions_source,
                "columns": transactions_df.columns.tolist(),
            },
        },
    }


def get_forecast_filter_options(client_id: str | None = None) -> dict[str, Any]:
    normalized_client_id = _normalize_client_id(client_id)
    if normalized_client_id:
        campaigns_df, campaigns_source = get_dataset_dataframe_with_source("campaigns", client_id=normalized_client_id)
        if campaigns_df.empty:
            missing = get_missing_client_datasets_for_agents(normalized_client_id, ["forecast"])
            raise ValueError(build_missing_client_dataset_message(normalized_client_id, missing))
    else:
        campaigns_df = get_campaign_dataframe_remote_only()
        campaigns_source = "supabase"
        if campaigns_df.empty:
            raise ValueError("No campaigns data found in Supabase for forecast options")

    channels = _unique_non_empty_values(campaigns_df, "channel")
    campaign_types = _unique_non_empty_values(campaigns_df, "campaign_type")
    campaign_ids = _unique_non_empty_values(campaigns_df, "campaign_id")

    min_date = ""
    max_date = ""
    if "date" in campaigns_df.columns:
        parsed_dates = pd.to_datetime(campaigns_df["date"], errors="coerce").dropna()
        if not parsed_dates.empty:
            min_date = parsed_dates.min().date().isoformat()
            max_date = parsed_dates.max().date().isoformat()

    return {
        "channels": channels,
        "campaign_types": campaign_types,
        "campaign_ids": campaign_ids,
        "defaults": {
            "channel": "all",
            "campaign_type": "all",
            "campaign_id": "all",
            "horizon_days": 90,
            "kpi_metric": "revenue",
        },
        "available_filters": {
            "channel": bool(channels),
            "campaign_type": bool(campaign_types),
            "campaign_id": bool(campaign_ids),
        },
        "sources": {
            "campaigns": campaigns_source,
        },
        "row_counts": {
            "campaigns": int(len(campaigns_df.index)),
        },
        "date_range": {
            "min": min_date,
            "max": max_date,
        },
        "schema_details": {
            "campaigns": {
                "source": "supabase",
                "source": campaigns_source,
                "columns": campaigns_df.columns.tolist(),
            }
        },
    }


def get_scenario_filter_options(client_id: str | None = None) -> dict[str, Any]:
    normalized_client_id = _normalize_client_id(client_id)
    if normalized_client_id:
        campaigns_df, campaigns_source = get_dataset_dataframe_with_source("campaigns", client_id=normalized_client_id)
        if campaigns_df.empty:
            missing = get_missing_client_datasets_for_agents(normalized_client_id, ["scenario"])
            raise ValueError(build_missing_client_dataset_message(normalized_client_id, missing))
    else:
        campaigns_df = get_campaign_dataframe_remote_only()
        campaigns_source = "supabase"
        if campaigns_df.empty:
            raise ValueError("No campaigns data found in Supabase for scenario options")

    channels = _unique_non_empty_values(campaigns_df, "channel")
    campaign_types = _unique_non_empty_values(campaigns_df, "campaign_type")
    campaign_ids = _unique_non_empty_values(campaigns_df, "campaign_id")

    min_date = ""
    max_date = ""
    if "date" in campaigns_df.columns:
        parsed_dates = pd.to_datetime(campaigns_df["date"], errors="coerce").dropna()
        if not parsed_dates.empty:
            min_date = parsed_dates.min().date().isoformat()
            max_date = parsed_dates.max().date().isoformat()

    return {
        "channels": channels,
        "campaign_types": campaign_types,
        "campaign_ids": campaign_ids,
        "kpi_metrics": [
            "revenue",
            "profit",
            "roi",
            "spend",
            "clicks",
            "purchases",
            "impressions",
            "ctr",
            "conversion_rate",
        ],
        "defaults": {
            "channel": "all",
            "campaign_type": "all",
            "campaign_id": "all",
            "horizon_days": 90,
            "kpi_metric": "revenue",
            "base_spend_change_pct": 0,
            "base_ctr_lift_pct": 0,
            "base_conversion_lift_pct": 0,
            "base_aov_change_pct": 0,
        },
        "available_filters": {
            "channel": bool(channels),
            "campaign_type": bool(campaign_types),
            "campaign_id": bool(campaign_ids),
        },
        "sources": {
            "campaigns": campaigns_source,
        },
        "row_counts": {
            "campaigns": int(len(campaigns_df.index)),
        },
        "date_range": {
            "min": min_date,
            "max": max_date,
        },
        "schema_details": {
            "campaigns": {
                "source": "supabase",
                "source": campaigns_source,
                "columns": campaigns_df.columns.tolist(),
            }
        },
    }


def get_budget_allocator_options(client_id: str | None = None) -> dict[str, Any]:
    normalized_client_id = _normalize_client_id(client_id)
    if normalized_client_id:
        campaigns_df, campaigns_source = get_dataset_dataframe_with_source("campaigns", client_id=normalized_client_id)
        if campaigns_df.empty:
            missing = get_missing_client_datasets_for_agents(normalized_client_id, ["budget_allocator"])
            raise ValueError(build_missing_client_dataset_message(normalized_client_id, missing))
    else:
        campaigns_df = get_campaign_dataframe_remote_only()
        campaigns_source = "supabase"
        if campaigns_df.empty:
            raise ValueError("No campaigns data found in Supabase for budget allocator options")

    channels = _unique_non_empty_values(campaigns_df, "channel")
    campaign_types = _unique_non_empty_values(campaigns_df, "campaign_type")
    campaign_ids = _unique_non_empty_values(campaigns_df, "campaign_id")

    baseline_budget = 0.0
    if "spend" in campaigns_df.columns:
        baseline_budget = float(pd.to_numeric(campaigns_df["spend"], errors="coerce").fillna(0.0).sum())

    return {
        "channels": channels,
        "campaign_types": campaign_types,
        "campaign_ids": campaign_ids,
        "objectives": ["profit", "revenue", "roas", "new_customers"],
        "risk_tolerances": ["conservative", "balanced", "aggressive"],
        "defaults": {
            "channel": "all",
            "campaign_type": "all",
            "campaign_id": "all",
            "objective": "profit",
            "risk_tolerance": "balanced",
            "total_budget": round(baseline_budget, 2),
            "max_shift_pct": 20,
            "min_channel_pct": 5,
            "max_channel_pct": 60,
        },
        "available_filters": {
            "channel": bool(channels),
            "campaign_type": bool(campaign_types),
            "campaign_id": bool(campaign_ids),
        },
        "sources": {
            "campaigns": campaigns_source,
        },
        "row_counts": {
            "campaigns": int(len(campaigns_df.index)),
        },
        "schema_details": {
            "campaigns": {
                "source": "supabase",
                "source": campaigns_source,
                "columns": campaigns_df.columns.tolist(),
            }
        },
    }


def get_cohort_filter_options(client_id: str | None = None) -> dict[str, Any]:
    normalized_client_id = _normalize_client_id(client_id)
    customers_df, customers_source = get_dataset_dataframe_with_source("customers", prefer_remote=not normalized_client_id, client_id=normalized_client_id or None)
    retention_df, retention_source = get_dataset_dataframe_with_source("retention", prefer_remote=not normalized_client_id, client_id=normalized_client_id or None)
    transactions_df, transactions_source = get_dataset_dataframe_with_source("transactions", prefer_remote=not normalized_client_id, client_id=normalized_client_id or None)

    if normalized_client_id:
        if customers_df.empty or retention_df.empty or transactions_df.empty:
            missing = get_missing_client_datasets_for_agents(normalized_client_id, ["cohort"])
            raise ValueError(build_missing_client_dataset_message(normalized_client_id, missing))
    elif customers_df.empty:
        raise ValueError("No customers data found in Supabase for cohort options")

    if "signup_date" in customers_df.columns:
        signup_dates = pd.to_datetime(customers_df["signup_date"], errors="coerce").dropna()
        min_signup_date = signup_dates.min().date().isoformat() if not signup_dates.empty else ""
        max_signup_date = signup_dates.max().date().isoformat() if not signup_dates.empty else ""
    else:
        min_signup_date = ""
        max_signup_date = ""

    max_tenure = 24
    if not retention_df.empty and "tenure_months" in retention_df.columns:
        tenure_values = pd.to_numeric(retention_df["tenure_months"], errors="coerce").dropna()
        if not tenure_values.empty:
            max_tenure = int(max(1, tenure_values.max()))

    return {
        "segments": _unique_non_empty_values(customers_df, "segment"),
        "signup_channels": _unique_non_empty_values(customers_df, "signup_channel"),
        "contract_types": _unique_non_empty_values(customers_df, "contract_type"),
        "cohort_periods": ["week", "month", "quarter"],
        "defaults": {
            "cohort_period": "month",
            "retention_months": 3,
            "segment": "all",
            "signup_channel": "all",
            "contract_type": "all",
            "signup_start_date": min_signup_date,
            "signup_end_date": max_signup_date,
            "min_tenure_months": 0,
            "churn_probability_min": 0.0,
            "top_n": 8,
        },
        "limits": {
            "max_tenure_months": max_tenure,
            "max_top_n": 20,
        },
        "available_filters": {
            "segment": bool(_unique_non_empty_values(customers_df, "segment")),
            "signup_channel": bool(_unique_non_empty_values(customers_df, "signup_channel")),
            "contract_type": bool(_unique_non_empty_values(customers_df, "contract_type")),
            "signup_date": "signup_date" in customers_df.columns,
            "min_tenure_months": not retention_df.empty,
            "churn_probability_min": ("churn_probability" in retention_df.columns) if not retention_df.empty else False,
        },
        "sources": {
            "customers": customers_source,
            "retention": retention_source,
            "transactions": transactions_source,
        },
        "row_counts": {
            "customers": int(len(customers_df.index)),
            "retention": int(len(retention_df.index)),
            "transactions": int(len(transactions_df.index)),
        },
        "date_range": {
            "signup_min": min_signup_date,
            "signup_max": max_signup_date,
        },
    }


def get_campaigns_by_channel(channel: str, client_id: str | None = None) -> list[dict[str, Any]]:
    return _safe_to_records(_filter_eq(get_campaign_dataframe(client_id=client_id), "channel", channel))


def get_campaigns_by_type(campaign_type: str, client_id: str | None = None) -> list[dict[str, Any]]:
    return _safe_to_records(_filter_eq(get_campaign_dataframe(client_id=client_id), "campaign_type", campaign_type))


def get_campaigns_between_dates(start_date: str, end_date: str, client_id: str | None = None) -> list[dict[str, Any]]:
    df = get_campaign_dataframe(client_id=client_id)
    if df.empty or "date" not in df.columns:
        return []

    out = _normalize_datetime(df, ["date"])
    start = pd.to_datetime(start_date)
    end = pd.to_datetime(end_date)
    filtered = out[(out["date"] >= start) & (out["date"] <= end)]
    return _safe_to_records(filtered)


def get_campaign_dataframe_between_dates(start_date: str, end_date: str, client_id: str | None = None) -> pd.DataFrame:
    return pd.DataFrame(get_campaigns_between_dates(start_date, end_date, client_id=client_id))


# ---------------------------------------------------------
# EVENT DATA
# ---------------------------------------------------------

def get_events_data(limit: int | None = None, client_id: str | None = None) -> list[dict[str, Any]]:
    if _normalize_client_id(client_id):
        return _safe_to_records(get_dataset_dataframe("events", limit, client_id=client_id))
    return _get_table_data("events", limit)


def get_events_dataframe(limit: int | None = None, client_id: str | None = None) -> pd.DataFrame:
    if _normalize_client_id(client_id):
        return get_dataset_dataframe("events", limit, client_id=client_id)
    return _get_table_dataframe("events", limit)


def get_events_for_customer(customer_id: str) -> list[dict[str, Any]]:
    df = get_events_dataframe()
    if df.empty:
        return []

    filtered = _filter_eq(df, "customer_id", customer_id)
    if "timestamp" in filtered.columns:
        filtered = filtered.sort_values("timestamp")
    return _safe_to_records(filtered)


def get_events_by_channel(channel: str) -> list[dict[str, Any]]:
    return _safe_to_records(_filter_eq(get_events_dataframe(), "channel", channel))


# ---------------------------------------------------------
# CUSTOMER DATA
# ---------------------------------------------------------

def get_customers_data(limit: int | None = None, client_id: str | None = None) -> list[dict[str, Any]]:
    if _normalize_client_id(client_id):
        return _safe_to_records(get_dataset_dataframe("customers", limit, client_id=client_id))
    return _get_table_data("customers", limit)


def get_customers_dataframe(limit: int | None = None, client_id: str | None = None) -> pd.DataFrame:
    if _normalize_client_id(client_id):
        return get_dataset_dataframe("customers", limit, client_id=client_id)
    return _get_table_dataframe("customers", limit)


def get_customer(customer_id: str) -> dict[str, Any] | None:
    records = _safe_to_records(_filter_eq(get_customers_dataframe(), "customer_id", customer_id))
    return records[0] if records else None


def get_customers_by_segment(segment: str) -> list[dict[str, Any]]:
    return _safe_to_records(_filter_eq(get_customers_dataframe(), "segment", segment))


# ---------------------------------------------------------
# RETENTION DATA
# ---------------------------------------------------------

def get_retention_data(limit: int | None = None, client_id: str | None = None) -> list[dict[str, Any]]:
    if _normalize_client_id(client_id):
        return _safe_to_records(get_dataset_dataframe("retention", limit, client_id=client_id))
    return _get_table_data("retention", limit)


def get_retention_dataframe(limit: int | None = None, client_id: str | None = None) -> pd.DataFrame:
    if _normalize_client_id(client_id):
        return get_dataset_dataframe("retention", limit, client_id=client_id)
    return _get_table_dataframe("retention", limit)


def get_high_risk_customers(churn_threshold: float = 0.7) -> list[dict[str, Any]]:
    df = get_retention_dataframe()
    if df.empty or "churn_probability" not in df.columns:
        return []
    filtered = df[df["churn_probability"] >= churn_threshold]
    return _safe_to_records(filtered)


# ---------------------------------------------------------
# TRANSACTION DATA
# ---------------------------------------------------------

def get_transactions_data(limit: int | None = None, client_id: str | None = None) -> list[dict[str, Any]]:
    if _normalize_client_id(client_id):
        return _safe_to_records(get_dataset_dataframe("transactions", limit, client_id=client_id))
    return _get_table_data("transactions", limit)


def get_transactions_dataframe(limit: int | None = None, client_id: str | None = None) -> pd.DataFrame:
    if _normalize_client_id(client_id):
        return get_dataset_dataframe("transactions", limit, client_id=client_id)
    return _get_table_dataframe("transactions", limit)


def get_transactions_for_customer(customer_id: str) -> list[dict[str, Any]]:
    df = get_transactions_dataframe()
    if df.empty:
        return []

    filtered = _filter_eq(df, "customer_id", customer_id)
    if "purchase_date" in filtered.columns:
        filtered = filtered.sort_values("purchase_date")
    return _safe_to_records(filtered)


# ---------------------------------------------------------
# AGENT-SPECIFIC QUERY HELPERS
# ---------------------------------------------------------

def get_forecast_agent_data() -> pd.DataFrame:
    df = get_campaign_dataframe()
    if df.empty:
        return df

    required_columns = [
        "channel",
        "campaign_type",
        "spend",
        "impressions",
        "clicks",
        "ctr",
        "conversion_rate",
        "purchases",
        "revenue",
        "roi",
    ]
    for column in required_columns:
        if column not in df.columns:
            df[column] = 0
    return df[required_columns].copy()


def get_attribution_agent_data() -> pd.DataFrame:
    events_df = get_events_dataframe()
    transactions_df = get_transactions_dataframe()
    if events_df.empty:
        return pd.DataFrame()

    if transactions_df.empty:
        return events_df

    merge_cols = ["customer_id", "purchase_date", "revenue"]
    for column in merge_cols:
        if column not in transactions_df.columns:
            transactions_df[column] = None
    return events_df.merge(transactions_df[merge_cols], on="customer_id", how="left")


def get_funnel_agent_data() -> pd.DataFrame:
    df = get_campaign_dataframe()
    if df.empty:
        return df

    required_columns = [
        "date",
        "channel",
        "impressions",
        "clicks",
        "landing_page_views",
        "add_to_cart",
        "purchases",
    ]
    for column in required_columns:
        if column not in df.columns:
            df[column] = 0
    return df[required_columns].copy()


def get_cohort_agent_data() -> pd.DataFrame:
    customers_df = get_customers_dataframe()
    retention_df = get_retention_dataframe()
    transactions_df = get_transactions_dataframe()

    if customers_df.empty:
        return pd.DataFrame()

    df = customers_df.copy()

    if not retention_df.empty and "customer_id" in retention_df.columns:
        df = df.merge(retention_df, on="customer_id", how="left")

    if not transactions_df.empty and "customer_id" in transactions_df.columns:
        customer_revenue = (
            transactions_df.groupby("customer_id")["revenue"]
            .sum()
            .reset_index()
            .rename(columns={"revenue": "total_revenue"})
        )
        purchase_counts = (
            transactions_df.groupby("customer_id")
            .size()
            .reset_index(name="purchase_count")
        )
        df = df.merge(customer_revenue, on="customer_id", how="left")
        df = df.merge(purchase_counts, on="customer_id", how="left")

    if "total_revenue" not in df.columns:
        df["total_revenue"] = 0.0
    if "purchase_count" not in df.columns:
        df["purchase_count"] = 0

    df["total_revenue"] = df["total_revenue"].fillna(0.0)
    df["purchase_count"] = df["purchase_count"].fillna(0)
    return df


# ---------------------------------------------------------
# INSERT HELPERS
# ---------------------------------------------------------

def insert_campaign_rows(rows: list[dict[str, Any]]):
    return _get_supabase().table("campaigns").insert(rows).execute()


def insert_customer_rows(rows: list[dict[str, Any]]):
    return _get_supabase().table("customers").insert(rows).execute()


def insert_event_rows(rows: list[dict[str, Any]]):
    return _get_supabase().table("events").insert(rows).execute()


def insert_transaction_rows(rows: list[dict[str, Any]]):
    return _get_supabase().table("transactions").insert(rows).execute()


def insert_retention_rows(rows: list[dict[str, Any]]):
    return _get_supabase().table("retention").insert(rows).execute()


# ---------------------------------------------------------
# FILE MANAGEMENT QUERIES
# ---------------------------------------------------------

def get_files_from_db(agent_id: int | None = None) -> list[dict[str, Any]]:
    """Get all uploaded files from SQLAlchemy DB; optionally scoped to an agent."""
    try:
        from analytics_agent.db.models import Agent, File
        from analytics_agent.db.repo import get_session

        session = get_session()
        try:
            if agent_id:
                agent = session.query(Agent).filter(Agent.id == agent_id).first()
                if not agent:
                    return []
                return [
                    {
                        "id": f.id,
                        "file_name": f.file_name,
                        "file_type": f.file_type,
                        "file_size": f.file_size,
                        "storage_path": f.storage_path,
                        "created_at": f.created_at.isoformat() if f.created_at else None,
                    }
                    for f in agent.files
                ]

            files = session.query(File).all()
            return [
                {
                    "id": f.id,
                    "file_name": f.file_name,
                    "file_type": f.file_type,
                    "file_size": f.file_size,
                    "storage_path": f.storage_path,
                    "created_at": f.created_at.isoformat() if f.created_at else None,
                }
                for f in files
            ]
        finally:
            session.close()
    except Exception:
        return []

