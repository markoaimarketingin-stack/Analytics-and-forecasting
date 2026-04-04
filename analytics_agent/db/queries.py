from __future__ import annotations

from pathlib import Path
from typing import Any, Iterable

import pandas as pd

from analytics_agent.clients.supabase_client import get_supabase_client

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


def _get_table_data(table_name: str, limit: int | None = None) -> list[dict[str, Any]]:
    return _safe_to_records(_get_table_dataframe(table_name, limit))


def get_dataset_dataframe(
    dataset_name: str,
    limit: int | None = None,
    prefer_remote: bool = False,
) -> pd.DataFrame:
    if dataset_name not in SUPPORTED_DATASETS:
        return pd.DataFrame()

    if prefer_remote:
        remote = _read_remote_table(dataset_name, limit)
        if not remote.empty:
            return remote
    return _get_table_dataframe(dataset_name, limit)


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

def get_campaign_data(limit: int | None = None) -> list[dict[str, Any]]:
    return _get_table_data("campaigns", limit)


def get_campaign_dataframe(limit: int | None = None) -> pd.DataFrame:
    return _get_table_dataframe("campaigns", limit)


def get_campaigns_by_channel(channel: str) -> list[dict[str, Any]]:
    return _safe_to_records(_filter_eq(get_campaign_dataframe(), "channel", channel))


def get_campaigns_by_type(campaign_type: str) -> list[dict[str, Any]]:
    return _safe_to_records(_filter_eq(get_campaign_dataframe(), "campaign_type", campaign_type))


def get_campaigns_between_dates(start_date: str, end_date: str) -> list[dict[str, Any]]:
    df = get_campaign_dataframe()
    if df.empty or "date" not in df.columns:
        return []

    out = _normalize_datetime(df, ["date"])
    start = pd.to_datetime(start_date)
    end = pd.to_datetime(end_date)
    filtered = out[(out["date"] >= start) & (out["date"] <= end)]
    return _safe_to_records(filtered)


def get_campaign_dataframe_between_dates(start_date: str, end_date: str) -> pd.DataFrame:
    return pd.DataFrame(get_campaigns_between_dates(start_date, end_date))


# ---------------------------------------------------------
# EVENT DATA
# ---------------------------------------------------------

def get_events_data(limit: int | None = None) -> list[dict[str, Any]]:
    return _get_table_data("events", limit)


def get_events_dataframe(limit: int | None = None) -> pd.DataFrame:
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

def get_customers_data(limit: int | None = None) -> list[dict[str, Any]]:
    return _get_table_data("customers", limit)


def get_customers_dataframe(limit: int | None = None) -> pd.DataFrame:
    return _get_table_dataframe("customers", limit)


def get_customer(customer_id: str) -> dict[str, Any] | None:
    records = _safe_to_records(_filter_eq(get_customers_dataframe(), "customer_id", customer_id))
    return records[0] if records else None


def get_customers_by_segment(segment: str) -> list[dict[str, Any]]:
    return _safe_to_records(_filter_eq(get_customers_dataframe(), "segment", segment))


# ---------------------------------------------------------
# RETENTION DATA
# ---------------------------------------------------------

def get_retention_data(limit: int | None = None) -> list[dict[str, Any]]:
    return _get_table_data("retention", limit)


def get_retention_dataframe(limit: int | None = None) -> pd.DataFrame:
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

def get_transactions_data(limit: int | None = None) -> list[dict[str, Any]]:
    return _get_table_data("transactions", limit)


def get_transactions_dataframe(limit: int | None = None) -> pd.DataFrame:
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

