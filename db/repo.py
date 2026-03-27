from __future__ import annotations
from typing import Optional
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from .models import Base


def get_engine(url: Optional[str] = None):
    url = url or "sqlite:///./analytics.db"
    return create_engine(url, echo=False, future=True)


def init_db(url: Optional[str] = None):
    engine = get_engine(url)
    Base.metadata.create_all(engine)
    return engine


def get_session(url: Optional[str] = None) -> Session:
    engine = get_engine(url)
    return Session(engine)
