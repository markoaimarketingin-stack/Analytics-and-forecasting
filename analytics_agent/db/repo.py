from __future__ import annotations
from typing import Optional
import os
from urllib.parse import quote_plus, unquote
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError
from analytics_agent.logging_config import get_logger
from analytics_agent.config import settings
from .models import Base

load_dotenv()
logger = get_logger(__name__)


def get_engine(url: Optional[str] = None):
    """Create and return a SQLAlchemy engine with configuration."""
    try:
        if url:
            if str(url).startswith("sqlite"):
                raise ValueError("SQLite is not supported. Configure Supabase Postgres instead.")
            database_url = url
            echo = False
        elif os.getenv("USE_SUPABASE", "false").lower() == "true":
            db_user = os.getenv("DB_USER")
            raw_password = os.getenv("DB_PASSWORD", "")
            # Support both plain and already URL-encoded passwords safely.
            db_password = quote_plus(unquote(raw_password))
            db_host = os.getenv("DB_HOST")
            db_port = os.getenv("DB_PORT")
            db_name = os.getenv("DB_NAME")
            database_url = f"postgresql+psycopg2://{db_user}:{db_password}@{db_host}:{db_port}/{db_name}"
            echo = False
        elif str(getattr(settings, "DATABASE_URL", "") or "").strip() and not settings.DATABASE_URL.startswith("sqlite"):
            database_url = settings.DATABASE_URL
            echo = bool(getattr(settings, "DATABASE_ECHO", False))
        else:
            raise ValueError(
                "Supabase Postgres configuration is required. "
                "Set USE_SUPABASE=true with DB_USER/DB_PASSWORD/DB_HOST/DB_PORT/DB_NAME "
                "or provide a non-sqlite DATABASE_URL."
            )

        logger.debug("Creating database engine", echo=echo)
        engine = create_engine(database_url, echo=echo, future=True)
        logger.info("Database engine created successfully")
        return engine

    except SQLAlchemyError as e:
        logger.error("Failed to create database engine", error=str(e))
        raise
    except Exception as e:
        logger.error("Unexpected error creating database engine", error=str(e))
        raise


def init_db(url: Optional[str] = None):
    """Initialize database tables."""
    try:
        logger.info("Initializing database tables")
        engine = get_engine(url)
        Base.metadata.create_all(engine)
        logger.info("Database tables created successfully")
        return engine

    except SQLAlchemyError as e:
        logger.error("Failed to initialize database", error=str(e))
        raise
    except Exception as e:
        logger.error("Unexpected error initializing database", error=str(e))
        raise


def get_session(url: Optional[str] = None) -> Session:
    """Create and return a database session."""
    try:
        engine = get_engine(url)
        session = Session(engine)
        logger.debug("Database session created successfully")
        return session

    except SQLAlchemyError as e:
        logger.error("Failed to create database session", error=str(e))
        raise
    except Exception as e:
        logger.error("Unexpected error creating database session", error=str(e))
        raise
