import os
from functools import lru_cache
from dotenv import load_dotenv
from typing import Any

load_dotenv()


@lru_cache
def get_supabase_client() -> Any:
    try:
        from supabase import create_client
    except ImportError as exc:
        raise RuntimeError(
            "Supabase SDK is not installed. Add 'supabase' to requirements.txt."
        ) from exc

    supabase_url = os.getenv("SUPABASE_URL")
    service_key = (
        os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        or os.getenv("SUPABASE_KEY")
        or os.getenv("SUPABASE_ANON_KEY")
    )

    if not supabase_url:
        raise ValueError("SUPABASE_URL is missing")

    if not service_key:
        raise ValueError(
            "Supabase API key is missing. Set SUPABASE_SERVICE_ROLE_KEY (preferred) or SUPABASE_KEY/SUPABASE_ANON_KEY."
        )

    return create_client(supabase_url, service_key)


def upload_file_to_storage(bucket_name: str, file_path: str, file_body: bytes):
    supabase = get_supabase_client()

    try:
        result = (
            supabase.storage
            .from_(bucket_name)
            .upload(
                path=file_path,
                file=file_body,
                file_options={"upsert": "true"}
            )
        )
        return result
    except Exception as e:
        raise RuntimeError(f"Failed to upload file to Supabase Storage: {e}")


def insert_training_upload_record(record: dict[str, Any]):
    supabase = get_supabase_client()

    try:
        return supabase.table("training_uploads").insert(record).execute()
    except Exception as e:
        raise RuntimeError(f"Failed to persist training upload metadata to Supabase: {e}")


def list_training_upload_records(client_id: str):
    supabase = get_supabase_client()

    try:
        return (
            supabase
            .table("training_uploads")
            .select("*")
            .eq("client_id", client_id)
            .order("created_at", desc=True)
            .execute()
        )
    except Exception as e:
        raise RuntimeError(f"Failed to load training upload metadata from Supabase: {e}")


def get_training_upload_record(upload_id: int, client_id: str):
    supabase = get_supabase_client()

    try:
        return (
            supabase
            .table("training_uploads")
            .select("*")
            .eq("id", upload_id)
            .eq("client_id", client_id)
            .limit(1)
            .execute()
        )
    except Exception as e:
        raise RuntimeError(f"Failed to fetch training upload metadata from Supabase: {e}")


def delete_training_upload_record(upload_id: int, client_id: str):
    supabase = get_supabase_client()

    try:
        return (
            supabase
            .table("training_uploads")
            .delete()
            .eq("id", upload_id)
            .eq("client_id", client_id)
            .execute()
        )
    except Exception as e:
        raise RuntimeError(f"Failed to delete training upload metadata from Supabase: {e}")


def delete_file_from_storage(bucket_name: str, file_path: str):
    supabase = get_supabase_client()

    try:
        return supabase.storage.from_(bucket_name).remove([file_path])
    except Exception as e:
        raise RuntimeError(f"Failed to delete file from Supabase Storage: {e}")
