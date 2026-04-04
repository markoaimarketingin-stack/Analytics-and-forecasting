from __future__ import annotations
from datetime import datetime
from sqlalchemy.orm import declarative_base, Mapped, mapped_column, relationship
from sqlalchemy import String, Integer, Float, JSON, DateTime, Text, Table, Column, ForeignKey

Base = declarative_base()


# Association Table for Agent and File (many-to-many)
agent_file_association = Table(
    "agent_file_association",
    Base.metadata,
    Column("agent_id", Integer, ForeignKey("agents.id")),
    Column("file_id", Integer, ForeignKey("files.id")),
)


class Agent(Base):
    __tablename__ = "agents"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    files: Mapped[list[File]] = relationship(
        secondary=agent_file_association, back_populates="agents"
    )


class File(Base):
    __tablename__ = "files"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    file_type: Mapped[str] = mapped_column(String(50))
    file_size: Mapped[int] = mapped_column(Integer)
    storage_path: Mapped[str] = mapped_column(String(512), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    agents: Mapped[list[Agent]] = relationship(
        secondary=agent_file_association, back_populates="files"
    )


class AnalyticsModel(Base):
    __tablename__ = "analytics_models"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100))
    state: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class ForecastResult(Base):
    __tablename__ = "forecast_results"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    model_id: Mapped[int] = mapped_column(Integer)
    monthly: Mapped[dict] = mapped_column(JSON)
    totals: Mapped[dict] = mapped_column(JSON)
    breakeven_month: Mapped[int | None]


class ScenarioOutput(Base):
    __tablename__ = "scenario_outputs"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    model_id: Mapped[int] = mapped_column(Integer)
    scenarios: Mapped[dict] = mapped_column(JSON)


class CohortData(Base):
    __tablename__ = "cohort_data"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    model_id: Mapped[int] = mapped_column(Integer)
    data: Mapped[dict] = mapped_column(JSON)


class FunnelModel(Base):
    __tablename__ = "funnel_models"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    model_id: Mapped[int] = mapped_column(Integer)
    data: Mapped[dict] = mapped_column(JSON)


class AttributionModel(Base):
    __tablename__ = "attribution_models"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    model_id: Mapped[int] = mapped_column(Integer)
    data: Mapped[dict] = mapped_column(JSON)


class KPIHistory(Base):
    __tablename__ = "kpi_history"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    kpi: Mapped[str] = mapped_column(String(64))
    value: Mapped[float] = mapped_column(Float)
    at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class AnalyticsLog(Base):
    __tablename__ = "analytics_logs"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    level: Mapped[str] = mapped_column(String(16))
    message: Mapped[str] = mapped_column(Text)
    context: Mapped[dict] = mapped_column(JSON)
    at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
