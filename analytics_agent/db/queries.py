from analytics_agent.clients.supabase_client import get_supabase_client
import pandas as pd
from pathlib import Path

# Lazy load supabase - only initialize when actually needed
_supabase = None

def _get_supabase():
    """Lazy load Supabase client only when needed"""
    global _supabase
    if _supabase is None:
        _supabase = get_supabase_client()
    return _supabase


def _read_local_csv(table_name: str) -> list[dict]:
    """Fallback to bundled local CSV data when Supabase is unavailable."""
    file_path = Path(__file__).resolve().parents[1] / "data" / f"{table_name}.csv"
    if not file_path.exists():
        return []
    return pd.read_csv(file_path).to_dict(orient="records")


# ---------------------------------------------------------
# CAMPAIGN DATA
# ---------------------------------------------------------

def get_campaign_data(limit: int | None = None) -> list[dict]:
    try:
        query = _get_supabase().table("campaigns").select("*")

        if limit:
            query = query.limit(limit)

        response = query.execute()
        return response.data
    except Exception:
        data = _read_local_csv("campaigns")
        return data[:limit] if limit else data


def get_campaign_dataframe(limit: int | None = None) -> pd.DataFrame:
    return pd.DataFrame(get_campaign_data(limit))


def get_campaigns_by_channel(channel: str) -> list[dict]:
    response = (
        _get_supabase().table("campaigns")
        .select("*")
        .eq("channel", channel)
        .execute()
    )
    return response.data


def get_campaigns_by_type(campaign_type: str) -> list[dict]:
    response = (
        _get_supabase().table("campaigns")
        .select("*")
        .eq("campaign_type", campaign_type)
        .execute()
    )
    return response.data


def get_campaigns_between_dates(start_date: str, end_date: str) -> list[dict]:
    response = (
        _get_supabase().table("campaigns")
        .select("*")
        .gte("date", start_date)
        .lte("date", end_date)
        .execute()
    )
    return response.data


def get_campaign_dataframe_between_dates(start_date: str, end_date: str) -> pd.DataFrame:
    return pd.DataFrame(get_campaigns_between_dates(start_date, end_date))


# ---------------------------------------------------------
# EVENT DATA
# ---------------------------------------------------------

def get_events_data(limit: int | None = None) -> list[dict]:
    query = _get_supabase().table("events").select("*")

    if limit:
        query = query.limit(limit)

    response = query.execute()
    return response.data


def get_events_dataframe(limit: int | None = None) -> pd.DataFrame:
    return pd.DataFrame(get_events_data(limit))


def get_events_for_customer(customer_id: str) -> list[dict]:
    response = (
        _get_supabase().table("events")
        .select("*")
        .eq("customer_id", customer_id)
        .order("timestamp")
        .execute()
    )
    return response.data


def get_events_by_channel(channel: str) -> list[dict]:
    response = (
        _get_supabase().table("events")
        .select("*")
        .eq("channel", channel)
        .execute()
    )
    return response.data


# ---------------------------------------------------------
# CUSTOMER DATA
# ---------------------------------------------------------

def get_customers_data(limit: int | None = None) -> list[dict]:
    query = _get_supabase().table("customers").select("*")

    if limit:
        query = query.limit(limit)

    response = query.execute()
    return response.data


def get_customers_dataframe(limit: int | None = None) -> pd.DataFrame:
    return pd.DataFrame(get_customers_data(limit))


def get_customer(customer_id: str) -> dict | None:
    response = (
        _get_supabase().table("customers")
        .select("*")
        .eq("customer_id", customer_id)
        .limit(1)
        .execute()
    )

    if response.data:
        return response.data[0]

    return None


def get_customers_by_segment(segment: str) -> list[dict]:
    response = (
        _get_supabase().table("customers")
        .select("*")
        .eq("segment", segment)
        .execute()
    )
    return response.data


# ---------------------------------------------------------
# RETENTION DATA
# ---------------------------------------------------------

def get_retention_data(limit: int | None = None) -> list[dict]:
    try:
        query = _get_supabase().table("retention").select("*")

        if limit:
            query = query.limit(limit)

        response = query.execute()
        return response.data
    except Exception:
        data = _read_local_csv("retention")
        return data[:limit] if limit else data


def get_retention_dataframe(limit: int | None = None) -> pd.DataFrame:
    return pd.DataFrame(get_retention_data(limit))


def get_high_risk_customers(churn_threshold: float = 0.7) -> list[dict]:
    response = (
        _get_supabase().table("retention")
        .select("*")
        .gte("churn_probability", churn_threshold)
        .execute()
    )
    return response.data


# ---------------------------------------------------------
# TRANSACTION DATA
# ---------------------------------------------------------

def get_transactions_data(limit: int | None = None) -> list[dict]:
    query = _get_supabase().table("transactions").select("*")

    if limit:
        query = query.limit(limit)

    response = query.execute()
    return response.data


def get_transactions_dataframe(limit: int | None = None) -> pd.DataFrame:
    return pd.DataFrame(get_transactions_data(limit))


def get_transactions_for_customer(customer_id: str) -> list[dict]:
    response = (
        _get_supabase().table("transactions")
        .select("*")
        .eq("customer_id", customer_id)
        .order("purchase_date")
        .execute()
    )
    return response.data


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

    return df[required_columns].copy()


def get_attribution_agent_data() -> pd.DataFrame:
    events_df = get_events_dataframe()
    transactions_df = get_transactions_dataframe()

    if events_df.empty:
        return pd.DataFrame()

    if not transactions_df.empty:
        merged = events_df.merge(
            transactions_df[["customer_id", "purchase_date", "revenue"]],
            on="customer_id",
            how="left"
        )
        return merged

    return events_df


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

    return df[required_columns].copy()


def get_cohort_agent_data() -> pd.DataFrame:
    customers_df = get_customers_dataframe()
    retention_df = get_retention_dataframe()
    transactions_df = get_transactions_dataframe()

    if customers_df.empty:
        return pd.DataFrame()

    df = customers_df.merge(
        retention_df,
        on="customer_id",
        how="left"
    )

    if not transactions_df.empty:
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

    df["total_revenue"] = df["total_revenue"].fillna(0)
    df["purchase_count"] = df["purchase_count"].fillna(0)

    return df


# ---------------------------------------------------------
# INSERT HELPERS
# ---------------------------------------------------------

def insert_campaign_rows(rows: list[dict]):
    return _get_supabase().table("campaigns").insert(rows).execute()


def insert_customer_rows(rows: list[dict]):
    return _get_supabase().table("customers").insert(rows).execute()


def insert_event_rows(rows: list[dict]):
    return _get_supabase().table("events").insert(rows).execute()


def insert_transaction_rows(rows: list[dict]):
    return _get_supabase().table("transactions").insert(rows).execute()


def insert_retention_rows(rows: list[dict]):
    return _get_supabase().table("retention").insert(rows).execute()


# ---------------------------------------------------------
# FILE MANAGEMENT QUERIES
# ---------------------------------------------------------

def get_files_from_db(agent_id: int | None = None) -> list[dict]:
    """
    Get all uploaded files from the database.
    If agent_id is provided, get files associated with that agent.
    """
    try:
        from analytics_agent.db.repo import get_session
        from analytics_agent.db.models import File, Agent
        
        session = get_session()
        try:
            if agent_id:
                # Get files for specific agent
                agent = session.query(Agent).filter(Agent.id == agent_id).first()
                if not agent:
                    return []
                
                files_data = [
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
                return files_data
            else:
                # Get all files
                files = session.query(File).all()
                files_data = [
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
                return files_data
        finally:
            session.close()
    except Exception as e:
        print(f"Error getting files from database: {e}")
        return []


def get_file_by_id(file_id: int) -> dict | None:
    """Get a specific file by ID."""
    try:
        from analytics_agent.db.repo import get_session
        from analytics_agent.db.models import File
        
        session = get_session()
        try:
            file = session.query(File).filter(File.id == file_id).first()
            if not file:
                return None
            
            return {
                "id": file.id,
                "file_name": file.file_name,
                "file_type": file.file_type,
                "file_size": file.file_size,
                "storage_path": file.storage_path,
                "created_at": file.created_at.isoformat() if file.created_at else None,
            }
        finally:
            session.close()
    except Exception as e:
        print(f"Error getting file: {e}")
        return None


def get_files_by_agent_id(agent_id: int) -> list[dict]:
    """Get all files associated with a specific agent."""
    return get_files_from_db(agent_id)


def read_csv_file_content(file_path: str) -> pd.DataFrame | None:
    """
    Read CSV file content from storage path.
    This assumes files are stored locally or accessible via the path.
    """
    try:
        return pd.read_csv(file_path)
    except Exception as e:
        print(f"Error reading CSV file {file_path}: {e}")
        return None


def get_files_dataframe(agent_id: int | None = None) -> pd.DataFrame:
    """
    Get uploaded files as a DataFrame showing file metadata.
    Useful for agents to see what files are available.
    """
    files = get_files_from_db(agent_id)
    if not files:
        return pd.DataFrame()
    return pd.DataFrame(files)


def get_file_metadata_for_agent(agent_id: int) -> list[dict]:
    """
    Get file metadata for an agent - useful for showing available files in UI.
    Returns simplified metadata about each file.
    """
    files = get_files_from_db(agent_id)
    return [
        {
            "id": f["id"],
            "name": f["file_name"],
            "type": f["file_type"],
            "size": f["file_size"],
            "path": f["storage_path"],
            "uploaded_at": f["created_at"]
        }
        for f in files
    ]


def get_all_agent_file_associations() -> dict:
    """
    Get mapping of all agents to their files.
    Returns: {agent_id: [file_list], agent_id2: [file_list], ...}
    """
    try:
        from analytics_agent.db.repo import get_session
        from analytics_agent.db.models import Agent
        
        session = get_session()
        try:
            agents = session.query(Agent).all()
            mapping = {}
            
            for agent in agents:
                files_data = [
                    {
                        "id": f.id,
                        "file_name": f.file_name,
                        "file_type": f.file_type,
                        "file_size": f.file_size,
                    }
                    for f in agent.files
                ]
                mapping[agent.id] = files_data
            
            return mapping
        finally:
            session.close()
    except Exception as e:
        print(f"Error getting agent file associations: {e}")
        return {}

