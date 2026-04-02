import os
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()


def get_supabase_client() -> Client | None:
    """
    Initializes and returns the Supabase client.
    Returns None if the required environment variables are not set.
    """
    supabase_url = os.getenv("SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_KEY")

    if not supabase_url or not supabase_key:
        print("Warning: SUPABASE_URL and SUPABASE_KEY are not set. Supabase client not created.")
        return None

    return create_client(supabase_url, supabase_key)


def upload_file_to_storage(bucket_name: str, file_path: str, file_body: bytes):
    """
    Uploads a file to the specified Supabase storage bucket.
    """
    supabase = get_supabase_client()
    if not supabase:
        raise ConnectionError("Supabase client is not initialized.")

    response = supabase.storage.from_(bucket_name).upload(file_path, file_body)
    return response
