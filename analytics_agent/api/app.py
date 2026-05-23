# Deployment update trigger
from contextlib import asynccontextmanager
from datetime import datetime
from io import StringIO
from typing import Any, Literal, Optional
import asyncio
import base64
import hashlib
import hmac
import json
import os
import re
import uuid
from pathlib import Path
from urllib import error as urllib_error
from urllib import request as urllib_request

from fastapi import BackgroundTasks, FastAPI, Form, HTTPException, Query, Request, UploadFile, File as FastAPIFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
from pydantic import BaseModel, Field, field_serializer
import pandas as pd
from sqlalchemy.orm import Session

from analytics_agent.analytics_runner import AnalyticsRunner
from analytics_agent.config import settings
from analytics_agent.logging_config import get_logger
from analytics_agent.api.orchestrator import AnalyticsSupervisor
from analytics_agent.api.strategic_summary import build_strategic_summary_payload
from analytics_agent.db.repo import get_session, init_db
from analytics_agent.db.models import File, Agent
from analytics_agent.db.chat_history_repo import (
    append_chat_message,
    ensure_chat_thread,
    get_chat_thread,
    list_chat_messages,
    list_chat_threads,
    list_recent_messages,
)
from analytics_agent.db.agent_results_repo import (
    get_client_agent_results,
    get_client_latest_snapshot,
    upsert_client_agent_results,
    upsert_client_latest_snapshot,
)
from analytics_agent.db.recommendation_outcomes_repo import (
    list_recommendation_outcomes,
    upsert_recommendation_outcome,
)
from analytics_agent.api.file_handler import FileHandler
from analytics_agent.agents.data_query_agent import DataQueryAgent, DataQueryRequest
from analytics_agent.clients.supabase_client import (
    delete_file_from_storage,
    delete_training_upload_record,
    get_training_upload_record,
    insert_training_upload_record,
    list_training_upload_records,
    upload_file_to_storage,
)
from analytics_agent.api.models import (
    AnalyticsPayloadRequest,
    AnalyticsResponse,
    BreakEvenResponse,
    BudgetSensitivityResponse,
    CapabilitiesResponse,
    CFOReportResponse,
    HealthCheckResponse,
    LTVProjectionResponse,
    StrategicAnalyticsPayload,
    StandardizedRecommendationsResponse,
)

logger = get_logger(__name__)


def _should_suppress_connection_reset(context: dict) -> bool:
    exc = context.get("exception")
    if isinstance(exc, ConnectionResetError):
        if getattr(exc, "winerror", None) == 10054:
            return True
    message = str(context.get("message") or "")
    return "_ProactorBasePipeTransport._call_connection_lost" in message


def _install_asyncio_exception_handler() -> None:
    if os.name != "nt":
        return
    loop = asyncio.get_running_loop()
    previous_handler = loop.get_exception_handler()

    def _handler(loop: asyncio.AbstractEventLoop, context: dict) -> None:
        if _should_suppress_connection_reset(context):
            logger.debug(
                "Suppressed Windows connection reset noise",
                message=str(context.get("message") or ""),
                error=str(context.get("exception") or ""),
            )
            return
        if previous_handler:
            previous_handler(loop, context)
        else:
            loop.default_exception_handler(context)

    loop.set_exception_handler(_handler)


# -----------------------------------------------------------------------------
# Request / Response Models
# -----------------------------------------------------------------------------
class ChatRequest(BaseModel):
    message: str
    selected_datasets: list[str] = Field(default_factory=list)
    thread_id: Optional[str] = None
    client_id: Optional[str] = None


class ChatResponse(BaseModel):
    success: bool = True
    message: str
    thread_id: str
    timestamp: str


class GoogleAuthRequest(BaseModel):
    credential: str


class AuthenticatedUser(BaseModel):
    google_sub: str
    email: str
    name: str
    picture: Optional[str] = None
    email_verified: bool = False


class GoogleAuthResponse(BaseModel):
    success: bool = True
    client_id: str
    user: AuthenticatedUser
    access_token: str
    token_type: str = "Bearer"
    expires_in: int
    timestamp: str


class OrchestrateResponse(BaseModel):
    success: bool = True
    reasoning: str
    intent: dict
    activated_agents: list[dict]
    timeline: list[str]
    payload: dict
    result: dict
    ui: dict
    thread_id: str
    timestamp: str


class ChatThreadSummary(BaseModel):
    id: str
    title: str
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    last_message_at: Optional[str] = None
    last_message_preview: str = ""


class ChatMessageRecord(BaseModel):
    id: str
    role: str
    content: str
    created_at: str


class ChatThreadListResponse(BaseModel):
    success: bool = True
    threads: list[ChatThreadSummary]
    timestamp: str


class ChatThreadDetailResponse(BaseModel):
    success: bool = True
    thread: ChatThreadSummary
    messages: list[ChatMessageRecord]
    timestamp: str


class FileResponse(BaseModel):
    id: int
    file_name: str
    file_type: str
    file_size: int
    storage_path: str
    created_at: datetime
    client_id: Optional[str] = None
    category: Optional[str] = None
    instructions: Optional[str] = None
    remote_storage_path: Optional[str] = None

    class Config:
        from_attributes = True

    @field_serializer('created_at')
    def serialize_created_at(self, value: datetime) -> str:
        """Convert datetime to ISO format string"""
        if isinstance(value, datetime):
            return value.isoformat()
        return value


class FilesListResponse(BaseModel):
    success: bool = True
    files: list[FileResponse]
    timestamp: str


class FileUploadResponse(BaseModel):
    success: bool = True
    file: FileResponse
    message: str
    timestamp: str


class FileDeleteResponse(BaseModel):
    success: bool = True
    message: str
    timestamp: str


class TrainingUploadRecord(BaseModel):
    id: int
    client_id: str
    agent_id: int
    file_name: str
    file_type: Optional[str] = None
    file_size: Optional[int] = None
    local_storage_path: Optional[str] = None
    remote_storage_path: str
    category: str
    instructions: Optional[str] = None
    created_at: str


class TrainingUploadListResponse(BaseModel):
    success: bool = True
    files: list[TrainingUploadRecord] = Field(default_factory=list)
    timestamp: str


class TrainingUploadPreviewResponse(BaseModel):
    success: bool = True
    file: TrainingUploadRecord
    preview: str
    timestamp: str


ALLOWED_TRAINING_CATEGORIES = {
    "general",
    "campaigns",
    "events",
    "transactions",
    "customers",
    "retention",
}

ACCESS_TOKEN_COOKIE_NAME = "marko_access_token"
MAX_DATASET_UPLOAD_BYTES = int(os.getenv("MAX_DATASET_UPLOAD_BYTES", str(2 * 1024 * 1024)))
MAX_DATASET_UPLOAD_ROWS = int(os.getenv("MAX_DATASET_UPLOAD_ROWS", "50000"))
MAX_DATASET_UPLOAD_COLUMNS = int(os.getenv("MAX_DATASET_UPLOAD_COLUMNS", "200"))
MAX_DATASET_UPLOAD_CELLS = int(os.getenv("MAX_DATASET_UPLOAD_CELLS", str(2_000_000)))


class RecommendationLifecycleRecord(BaseModel):
    suggestion_id: str
    client_id: Optional[str] = None
    thread_id: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None
    prompt: Optional[str] = None
    source: Optional[str] = None
    status: Literal["pending", "accepted", "in_progress", "implemented", "rejected"] = "pending"
    accepted_at: Optional[str] = None
    submitted_at: Optional[str] = None
    owner: Optional[str] = None
    due_date: Optional[str] = None
    expected_impact: Optional[str] = None
    actual_impact: Optional[str] = None
    outcome_notes: Optional[str] = None
    last_updated_at: Optional[str] = None


class RecommendationLifecycleListResponse(BaseModel):
    success: bool = True
    data: list[RecommendationLifecycleRecord] = Field(default_factory=list)
    timestamp: str


class RecommendationLifecycleUpsertResponse(BaseModel):
    success: bool = True
    data: RecommendationLifecycleRecord
    timestamp: str


class BusinessProfile(BaseModel):
    industry: Optional[str] = None
    goal: Optional[str] = None
    kpis: Optional[list[str]] = None


class ContextModel(BaseModel):
    business_profile: Optional[BusinessProfile] = None
    current_strategy: Optional[Any] = None
    previous_agent_outputs: Optional[list[Any]] = None


class TaskModel(BaseModel):
    type: str
    instruction: str


class ExecuteRequest(BaseModel):
    trace_id: str
    run_id: str
    session_id: str
    agent_name: str
    user_input: str
    client_id: str
    context: Optional[ContextModel] = None
    task: TaskModel
    platform: Optional[str] = "all"
    campaign_id: Optional[str] = "all"


class InsightItem(BaseModel):
    title: str
    summary: str


class OpportunityItem(BaseModel):
    title: str
    impact: float
    confidence: float
    priority: str


class ExecuteResponse(BaseModel):
    agent_name: str
    status: str
    insights: list[InsightItem] = []
    opportunities: list[OpportunityItem] = []
    sources: list[str] = []
    error: Optional[str] = None


# -----------------------------------------------------------------------------
# Global services
# -----------------------------------------------------------------------------
analytics_runner: Optional[AnalyticsRunner] = None
marko_brain: Optional[AnalyticsSupervisor] = None
data_query_agent: Optional[DataQueryAgent] = None


def _is_self_ping_enabled() -> bool:
    return str(os.getenv("SELF_PING_ENABLED", "false")).strip().lower() in {"1", "true", "yes", "on"}


def _resolve_self_ping_interval_seconds() -> int:
    raw_value = str(os.getenv("SELF_PING_INTERVAL_SECONDS", "600")).strip()
    try:
        parsed = int(raw_value)
    except ValueError:
        parsed = 600
    return max(60, parsed)


def _resolve_self_ping_url() -> Optional[str]:
    explicit_url = str(os.getenv("SELF_PING_URL", "")).strip()
    if explicit_url and "your-app.onrender.com" in explicit_url:
        logger.warning(
            "SELF_PING_URL uses placeholder value and will be ignored. Set it to your real Render URL.",
            configured_value=explicit_url,
        )
        explicit_url = ""
    if explicit_url:
        return explicit_url

    render_external_url = str(os.getenv("RENDER_EXTERNAL_URL", "")).strip().rstrip("/")
    if render_external_url:
        return f"{render_external_url}/api/health"

    return None


def _send_health_ping(url: str, timeout_seconds: int = 5) -> int:
    request = urllib_request.Request(
        url=url,
        method="GET",
        headers={"User-Agent": "analytics-agent-self-ping/1.0"},
    )
    with urllib_request.urlopen(request, timeout=timeout_seconds) as response:
        return int(getattr(response, "status", 200))


async def _self_ping_loop(stop_event: asyncio.Event) -> None:
    url = _resolve_self_ping_url()
    if not url:
        logger.warning(
            "Self-ping is enabled but no URL was resolved. Set SELF_PING_URL or RENDER_EXTERNAL_URL.",
        )
        return

    interval_seconds = _resolve_self_ping_interval_seconds()
    logger.info(
        "Self-ping loop started",
        url=url,
        interval_seconds=interval_seconds,
    )

    # Add a small deterministic offset so repeated restarts avoid pinging at the exact same second.
    initial_delay_seconds = 5 + (os.getpid() % 11)
    try:
        await asyncio.wait_for(stop_event.wait(), timeout=initial_delay_seconds)
        return
    except asyncio.TimeoutError:
        pass

    while not stop_event.is_set():
        try:
            status_code = await asyncio.to_thread(_send_health_ping, url, 5)
            logger.info("Self-ping succeeded", url=url, status_code=status_code)
        except urllib_error.URLError as exc:
            logger.warning("Self-ping failed", url=url, error=str(exc))
        except Exception as exc:
            logger.warning("Self-ping failed unexpectedly", url=url, error=str(exc))

        try:
            await asyncio.wait_for(stop_event.wait(), timeout=interval_seconds)
        except asyncio.TimeoutError:
            continue


# -----------------------------------------------------------------------------
# Application lifespan
# -----------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    global analytics_runner, marko_brain, data_query_agent
    self_ping_task: Optional[asyncio.Task] = None
    self_ping_stop_event: Optional[asyncio.Event] = None

    try:
        _install_asyncio_exception_handler()
        logger.info("Starting Analytics Agent API")
        settings.validate_security()

        # Ensure local metadata tables (agents/files/etc.) exist before serving requests.
        init_db()

        analytics_runner = AnalyticsRunner()

        marko_brain = AnalyticsSupervisor(
            analytics_runner=analytics_runner,
            gemini_client=analytics_runner.gemini,
        )
        data_query_agent = DataQueryAgent(gemini_client=analytics_runner.gemini)

        logger.info(
            "Analytics services initialized successfully",
            gemini_enabled=getattr(analytics_runner.gemini, "enabled", False),
        )

        if _is_self_ping_enabled():
            self_ping_stop_event = asyncio.Event()
            self_ping_task = asyncio.create_task(_self_ping_loop(self_ping_stop_event))
            logger.info(
                "Self-ping backup enabled",
                url=_resolve_self_ping_url(),
                interval_seconds=_resolve_self_ping_interval_seconds(),
            )
        else:
            logger.info("Self-ping backup disabled")

    except Exception as e:
        logger.error(
            "Failed to initialize services",
            error=str(e),
        )
        raise

    yield

    if self_ping_stop_event is not None:
        self_ping_stop_event.set()
    if self_ping_task is not None:
        try:
            await self_ping_task
        except asyncio.CancelledError:
            pass
        except Exception as exc:
            logger.warning("Self-ping task shutdown failed", error=str(exc))

    logger.info("Shutting down Analytics Agent API")


# -----------------------------------------------------------------------------
# FastAPI App
# -----------------------------------------------------------------------------
app = FastAPI(
    title="Analytics & Forecasting Agent API",
    description="REST API for Analytics Agent and analytics agents",
    version=settings.APP_VERSION,
    lifespan=lifespan,
)


def _resolve_client_id(client_id: Optional[str]) -> str:
    value = (client_id or "").strip()
    return value or "anonymous-client"


def _is_auth_bypass_enabled() -> bool:
    return str(os.getenv("AUTH_BYPASS_ENABLED", "false")).strip().lower() in {"1", "true", "yes", "on"}


def _get_bypass_identity() -> dict[str, Any]:
    client_id = str(os.getenv("AUTH_BYPASS_CLIENT_ID", "local-client")).strip() or "local-client"
    email = str(os.getenv("AUTH_BYPASS_EMAIL", "local@marko.ai")).strip() or "local@marko.ai"
    name = str(os.getenv("AUTH_BYPASS_NAME", "Local Client")).strip() or "Local Client"
    return {
        "sub": f"bypass-{client_id}",
        "email": email,
        "name": name,
        "client_id": client_id,
        "iat": int(datetime.utcnow().timestamp()),
        "exp": int(datetime.utcnow().timestamp()) + (60 * 60 * 24 * 365),
    }


def _b64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _b64url_decode(raw: str) -> bytes:
    padded = raw + "=" * (-len(raw) % 4)
    return base64.urlsafe_b64decode(padded.encode("ascii"))


def _get_auth_secret() -> bytes:
    secret = (
        (getattr(settings, "JWT_SECRET_KEY", None) or "").strip()
        or (getattr(settings, "SECRET_KEY", None) or "").strip()
    )
    if not secret:
        raise ValueError("JWT secret key is missing")
    return secret.encode("utf-8")


def _create_access_token(*, google_sub: str, email: str, client_id: str, name: str) -> tuple[str, int]:
    now = int(datetime.utcnow().timestamp())
    ttl_seconds = max(300, int(os.getenv("ACCESS_TOKEN_TTL_SECONDS", "43200")))
    payload = {
        "sub": google_sub,
        "email": email,
        "name": name,
        "client_id": client_id,
        "iat": now,
        "exp": now + ttl_seconds,
    }

    payload_json = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    payload_part = _b64url_encode(payload_json)
    signature = hmac.new(_get_auth_secret(), payload_part.encode("ascii"), hashlib.sha256).digest()
    token = f"{payload_part}.{_b64url_encode(signature)}"
    return token, ttl_seconds


def _verify_access_token(token: str) -> dict[str, Any]:
    if not token or "." not in token:
        raise HTTPException(status_code=401, detail="Missing or invalid access token")

    payload_part, signature_part = token.split(".", 1)
    expected_signature = hmac.new(_get_auth_secret(), payload_part.encode("ascii"), hashlib.sha256).digest()
    provided_signature = _b64url_decode(signature_part)
    if not hmac.compare_digest(expected_signature, provided_signature):
        raise HTTPException(status_code=401, detail="Invalid access token signature")

    try:
        payload = json.loads(_b64url_decode(payload_part).decode("utf-8"))
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Invalid access token payload") from exc

    exp = int(payload.get("exp", 0) or 0)
    now = int(datetime.utcnow().timestamp())
    if exp <= now:
        raise HTTPException(status_code=401, detail="Access token has expired")

    client_id = str(payload.get("client_id") or "").strip()
    if not client_id:
        raise HTTPException(status_code=401, detail="Access token missing client context")

    return payload


def _resolve_authenticated_client_id(request: Request) -> str:
    token_payload = getattr(request.state, "token_payload", None) or {}
    client_id = str(token_payload.get("client_id") or "").strip()
    if not client_id:
        raise HTTPException(status_code=401, detail="Authentication required")
    return client_id


def _resolve_company_access(request: Request, company_id: str) -> str:
    requested_company_id = (company_id or "").strip()
    if not requested_company_id:
        raise HTTPException(status_code=400, detail="company_id is required")

    authenticated_client_id = _resolve_authenticated_client_id(request)
    if _is_auth_bypass_enabled():
        return requested_company_id

    if authenticated_client_id != requested_company_id:
        raise HTTPException(status_code=403, detail="Authenticated client does not match requested company_id")

    return requested_company_id


def _client_id_from_google_sub(google_sub: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9_-]", "", (google_sub or "").strip())
    if not cleaned:
        raise ValueError("Google subject is missing")
    return f"google-{cleaned}"


def _normalize_training_category(value: Optional[str]) -> str:
    normalized = (value or "general").strip().lower() or "general"
    return normalized if normalized in ALLOWED_TRAINING_CATEGORIES else "general"


def _build_training_storage_path(
        *,
        client_id: str,
        agent_id: int,
        category: str,
        original_file_name: str,
) -> str:
    safe_client = re.sub(r"[^a-zA-Z0-9_-]", "-", client_id.strip()) or "anonymous-client"
    safe_category = re.sub(r"[^a-zA-Z0-9_-]", "-", category.strip()) or "general"
    safe_name = re.sub(r"[^a-zA-Z0-9._-]", "_", original_file_name.strip()) or "uploaded_file"
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    return f"{safe_client}/agent_{agent_id}/{safe_category}/{timestamp}_{safe_name}"


_AGENT_ANALYSIS_FIELDS = {
    "attribution": "attribution_analysis",
    "funnel": "funnel_analysis",
    "cohort": "cohort_analysis",
    "forecast": "forecast_analysis",
    "scenario": "scenario_analysis",
    "budget_allocator": "budget_allocation_analysis",
}


def _extract_agent_result_map(result_payload: dict) -> dict[str, object]:
    if not isinstance(result_payload, dict):
        return {}

    extracted: dict[str, object] = {}

    nested = result_payload.get("agent_results")
    if isinstance(nested, dict):
        for agent_key in _AGENT_ANALYSIS_FIELDS:
            value = nested.get(agent_key)
            if value is not None:
                extracted[agent_key] = value

    for agent_key, field_name in _AGENT_ANALYSIS_FIELDS.items():
        value = result_payload.get(field_name)
        if value is not None:
            extracted[agent_key] = value

    return extracted


def _persist_client_results(
        *,
        client_id: str,
        result_payload: dict,
        thread_id: Optional[str] = None,
        intent: Optional[str] = None,
) -> None:
    if not client_id or not isinstance(result_payload, dict):
        return

    agent_results = _extract_agent_result_map(result_payload)

    recommendations_raw = result_payload.get("recommendations") or result_payload.get("suggestions") or []
    recommendations = [str(item) for item in recommendations_raw] if isinstance(recommendations_raw, list) else []
    executive_summary_raw = result_payload.get("executive_summary")
    executive_summary = str(executive_summary_raw) if isinstance(executive_summary_raw, str) else None

    if not agent_results and not recommendations and not executive_summary:
        return

    upsert_client_agent_results(
        client_id=client_id,
        agent_results=agent_results,
        thread_id=thread_id,
        intent=intent,
    )
    upsert_client_latest_snapshot(
        client_id=client_id,
        recommendations=recommendations,
        executive_summary=executive_summary,
        thread_id=thread_id,
        intent=intent,
    )


def _build_standardized_recommendations_payload(
        *,
        recommendations: list[str],
        client_id: Optional[str] = None,
        thread_id: Optional[str] = None,
) -> dict[str, Any]:
    timestamp_tag = datetime.utcnow().strftime("%Y%m%d%H%M%S")
    clean_client = re.sub(r"[^a-zA-Z0-9_-]", "-", (client_id or "unknown").strip()) or "unknown"

    items = []
    for idx, raw in enumerate(recommendations, start=1):
        action = (raw or "").strip() or "Review analytics recommendations"
        source_key = f"analytics_{clean_client}_{timestamp_tag}_{idx:03d}"
        agent_specific: dict[str, Any] = {}
        if client_id:
            agent_specific["client_id"] = client_id
        if thread_id:
            agent_specific["thread_id"] = thread_id

        items.append(
            {
                "source_recommendation_key": source_key,
                "recommendation_type": "other",
                "platform": "unknown",
                "action": action,
                "reasoning": {
                    "triggered_by": "analytics_recommendations",
                    "metric_name": "CTR",
                    "metric_change": "0%",
                    "supporting_data": "No metric context available; defaults applied.",
                },
                "confidence": 0.5,
                "priority": "medium",
                "context": {
                    "ctr": 0.0,
                    "cpa": 0.0,
                    "roas": 0.0,
                    "cvr": 0.0,
                    "trend": "stable",
                },
                "version": 1,
                "agent_specific": agent_specific,
            }
        )

    return {
        "agent_name": "Analytics Agent",
        "recommendations": items,
    }


def _build_chat_prompt(message: str, history: list[dict]) -> str:
    context_lines: list[str] = []
    for item in history[-8:]:
        role = (item.get("role") or "user").strip().lower()
        content = (item.get("content") or "").strip()
        if not content:
            continue
        speaker = "User" if role == "user" else "Assistant"
        context_lines.append(f"{speaker}: {content}")

    conversation_context = "\n".join(context_lines) if context_lines else "No previous conversation context."

    return f"""
You are Analytics Supervisor, the intelligent supervisor of a growth analytics platform.

You can help with:
- Revenue forecasting
- Scenario comparison
- Funnel analysis
- Attribution
- Customer cohorts
- Budget planning
- Break-even analysis
- Executive summaries

Guidelines:
- Be concise and helpful
- If the user says hello, introduce yourself
- Mention what you can do
- Keep answers conversational

Conversation so far:
{conversation_context}

Latest user message:
{message}
"""


# -----------------------------------------------------------------------------
# CORS
# -----------------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.get_cors_origins(),
    allow_credentials=settings.CORS_ALLOW_CREDENTIALS,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.middleware("http")
async def _auth_middleware(request: Request, call_next):
    path = request.url.path
    request.state.token_payload = None

    if request.method == "OPTIONS":
        return await call_next(request)

    public_paths = {
        "/api/health",
        "/api/auth/google",
        "/api/auth/session",
        "/api/auth/logout",
        "/api",
        "/docs",
        "/openapi.json",
        "/redoc",
        "/execute",
        "/api/execute",
    }

    requires_auth = (
        path.startswith("/api/")
        or path.startswith("/agents/")
        or path.startswith("/analytics/")
        or path.startswith("/funnel/")
        or path.startswith("/cohort/")
    )

    if requires_auth and _is_auth_bypass_enabled():
        request.state.token_payload = _get_bypass_identity()
        return await call_next(request)

    if requires_auth and path not in public_paths:
        auth_header = (request.headers.get("Authorization") or "").strip()
        token = ""
        if auth_header.startswith("Bearer "):
            token = auth_header[7:].strip()
        else:
            token = (request.cookies.get(ACCESS_TOKEN_COOKIE_NAME) or "").strip()
        if not token:
            return JSONResponse(status_code=401, content={"detail": "Missing authentication token"})
        try:
            request.state.token_payload = _verify_access_token(token)
        except HTTPException as exc:
            return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})

    return await call_next(request)


# -----------------------------------------------------------------------------
# Health
# -----------------------------------------------------------------------------
def _build_health_payload() -> dict[str, Any]:
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "version": settings.APP_VERSION,
        "analytics_ready": analytics_runner is not None,
    }


@app.get("/", response_model=HealthCheckResponse)
async def root_health():
    return _build_health_payload()


@app.head("/", include_in_schema=False)
async def root_health_head():
    return Response(status_code=200)


@app.get("/health", response_model=HealthCheckResponse)
async def health_check_root():
    return _build_health_payload()


@app.head("/health", include_in_schema=False)
async def health_check_root_head():
    return Response(status_code=200)


@app.get("/api/health", response_model=HealthCheckResponse)
async def health_check():
    return _build_health_payload()


@app.head("/api/health", include_in_schema=False)
async def health_check_head():
    return Response(status_code=200)


# -----------------------------------------------------------------------------
# Authentication
# -----------------------------------------------------------------------------
@app.post("/api/auth/google", response_model=GoogleAuthResponse)
async def authenticate_google(payload: GoogleAuthRequest):
    if _is_auth_bypass_enabled():
        bypass = _get_bypass_identity()
        return {
            "success": True,
            "client_id": str(bypass.get("client_id") or ""),
            "user": {
                "google_sub": str(bypass.get("sub") or ""),
                "email": str(bypass.get("email") or ""),
                "name": str(bypass.get("name") or ""),
                "picture": None,
                "email_verified": True,
            },
            "access_token": "",
            "token_type": "Bearer",
            "expires_in": 60 * 60 * 24 * 365,
            "timestamp": datetime.utcnow().isoformat(),
        }

    credential = (payload.credential or "").strip()
    if not credential:
        raise HTTPException(status_code=400, detail="Google credential is required")

    google_client_id = (
            (getattr(settings, "GOOGLE_CLIENT_ID", None) or "").strip()
            or (os.getenv("VITE_GOOGLE_CLIENT_ID") or "").strip()
    )
    if not google_client_id:
        raise HTTPException(status_code=500, detail="Server Google auth is not configured")

    try:
        token_info = google_id_token.verify_oauth2_token(
            credential,
            google_requests.Request(),
            google_client_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=401, detail="Invalid Google credential") from exc

    issuer = str(token_info.get("iss") or "")
    if issuer not in {"accounts.google.com", "https://accounts.google.com"}:
        raise HTTPException(status_code=401, detail="Invalid Google token issuer")

    google_sub = str(token_info.get("sub") or "").strip()
    email = str(token_info.get("email") or "").strip()
    name = str(token_info.get("name") or email or "Marko AI User").strip()
    picture = str(token_info.get("picture") or "").strip() or None
    email_verified = bool(token_info.get("email_verified"))

    if not google_sub or not email:
        raise HTTPException(status_code=401, detail="Google token missing required identity fields")

    client_id = _client_id_from_google_sub(google_sub)
    access_token, expires_in = _create_access_token(
        google_sub=google_sub,
        email=email,
        client_id=client_id,
        name=name,
    )

    response_payload = {
        "success": True,
        "client_id": client_id,
        "user": {
            "google_sub": google_sub,
            "email": email,
            "name": name,
            "picture": picture,
            "email_verified": email_verified,
        },
        "access_token": access_token,
        "token_type": "Bearer",
        "expires_in": expires_in,
        "timestamp": datetime.utcnow().isoformat(),
    }
    response = JSONResponse(content=response_payload)
    secure_cookie = (settings.APP_ENV or "").strip().lower() in {"production", "prod", "staging"}
    same_site = "none" if secure_cookie else "lax"
    response.set_cookie(
        key=ACCESS_TOKEN_COOKIE_NAME,
        value=access_token,
        httponly=True,
        secure=secure_cookie,
        samesite=same_site,
        max_age=expires_in,
    )
    return response


@app.get("/api/auth/session", response_model=GoogleAuthResponse)
async def auth_session(request: Request):
    if _is_auth_bypass_enabled():
        bypass = _get_bypass_identity()
        return {
            "success": True,
            "client_id": str(bypass.get("client_id") or ""),
            "user": {
                "google_sub": str(bypass.get("sub") or ""),
                "email": str(bypass.get("email") or ""),
                "name": str(bypass.get("name") or ""),
                "picture": None,
                "email_verified": True,
            },
            "access_token": "",
            "token_type": "Bearer",
            "expires_in": 60 * 60 * 24 * 365,
            "timestamp": datetime.utcnow().isoformat(),
        }

    payload = _verify_access_token((request.cookies.get(ACCESS_TOKEN_COOKIE_NAME) or "").strip())
    remaining = max(0, int(payload.get("exp", 0)) - int(datetime.utcnow().timestamp()))
    return {
        "success": True,
        "client_id": str(payload.get("client_id") or ""),
        "user": {
            "google_sub": str(payload.get("sub") or ""),
            "email": str(payload.get("email") or ""),
            "name": str(payload.get("name") or ""),
            "picture": None,
            "email_verified": True,
        },
        "access_token": "",
        "token_type": "Bearer",
        "expires_in": remaining,
        "timestamp": datetime.utcnow().isoformat(),
    }


@app.post("/api/auth/logout")
async def auth_logout():
    if _is_auth_bypass_enabled():
        return {"success": True, "timestamp": datetime.utcnow().isoformat()}

    response = JSONResponse(content={"success": True, "timestamp": datetime.utcnow().isoformat()})
    secure_cookie = (settings.APP_ENV or "").strip().lower() in {"production", "prod", "staging"}
    same_site = "none" if secure_cookie else "lax"
    response.delete_cookie(ACCESS_TOKEN_COOKIE_NAME, samesite=same_site, secure=secure_cookie)
    return response


# -----------------------------------------------------------------------------
# Simple Gemini Chat
# -----------------------------------------------------------------------------
@app.post("/api/chat", response_model=ChatResponse)
async def chat_with_marko_brain(payload: ChatRequest, request: Request):
    if not analytics_runner:
        raise HTTPException(status_code=503, detail="Analytics service not ready")

    try:
        client_id = _resolve_authenticated_client_id(request)
        thread = ensure_chat_thread(client_id, payload.thread_id, payload.message)
        thread_id = str(thread["id"])

        history = list_recent_messages(client_id, thread_id, limit=8)
        prompt = _build_chat_prompt(payload.message, history)

        append_chat_message(
            client_id=client_id,
            thread_id=thread_id,
            role="user",
            content=payload.message,
        )

        response = analytics_runner.gemini.generate(prompt)
        if not response or not response.strip():
            response = (
                "I am online and ready. I can help with forecasting, scenario planning, "
                "funnel analysis, attribution, cohorts, and budget optimization."
            )

        append_chat_message(
            client_id=client_id,
            thread_id=thread_id,
            role="assistant",
            content=response,
        )

        return {
            "success": True,
            "message": response,
            "thread_id": thread_id,
            "timestamp": datetime.utcnow().isoformat(),
        }

    except Exception as e:
        logger.error("Chat endpoint failed", error=str(e))
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate response: {str(e)}",
        )


# -----------------------------------------------------------------------------
# Supervisor Integration Execute Route
# -----------------------------------------------------------------------------
def _format_execute_results_with_llm(
    agent_name: str,
    user_input: str,
    task_instruction: str,
    platform: str,
    executive_summary: str,
    recommendations: list[str],
) -> dict:
    if not marko_brain or not marko_brain.gemini_client:
        return {
            "insights": [
                {"title": "Orchestration Summary", "summary": executive_summary}
            ],
            "opportunities": [
                {
                    "title": rec,
                    "impact": 75.0,
                    "confidence": 80.0,
                    "priority": "medium"
                }
                for rec in recommendations
            ],
            "sources": [platform, "database"]
        }

    prompt = f"""
You are the MarkoAI Integration Schema Formatter.
An analytics orchestration run has finished. Format the results into the integration specification response schema.

Input User Request: {user_input}
Task Instruction: {task_instruction}
Platform: {platform}

Orchestration Executive Summary:
{executive_summary}

Orchestration Recommendations:
{recommendations}

Return ONLY a valid JSON object matching the following structure:
{{
  "insights": [
    {{
      "title": "Short title describing the metric or behavior trend",
      "summary": "Detailed summary of the insight based on the executive summary and recommendations."
    }}
  ],
  "opportunities": [
    {{
      "title": "Short action-oriented title",
      "impact": 0.0 to 100.0 float representing financial or business impact,
      "confidence": 0.0 to 100.0 float representing our confidence in this result,
      "priority": "low" or "medium" or "high"
    }}
  ],
  "sources": ["list", "of", "sources", "used"]
}}

DO NOT return any markdown blocks or conversational text. Return ONLY the JSON object.
"""
    try:
        raw = marko_brain.gemini_client.generate(prompt)
        cleaned = raw.strip().replace("```json", "").replace("```", "").strip()
        parsed = json.loads(cleaned)
        if "insights" in parsed and "opportunities" in parsed:
            return parsed
    except Exception as e:
        logger.warning(f"Failed to generate structured execute response with LLM: {e}")

    return {
        "insights": [
            {"title": "Orchestration Summary", "summary": executive_summary}
        ],
        "opportunities": [
            {
                "title": rec,
                "impact": 75.0,
                "confidence": 80.0,
                "priority": "medium"
            }
            for rec in recommendations
        ],
        "sources": [platform, "database"]
    }


@app.post("/execute")
@app.post("/api/execute")
async def execute_task(payload: ExecuteRequest, request: Request):
    if not marko_brain:
        return JSONResponse(
            status_code=503,
            content={
                "agent_name": payload.agent_name,
                "status": "error",
                "insights": [],
                "opportunities": [],
                "sources": [],
                "error": "Analytics Agent not ready"
            }
        )

    # Validate Shared Secret
    x_supervisor_token = request.headers.get("X-Supervisor-Token")
    expected_token = getattr(settings, "SUPERVISOR_TOKEN", "shared_supervisor_api_key")
    if not x_supervisor_token or x_supervisor_token != expected_token:
        return JSONResponse(
            status_code=401,
            content={
                "agent_name": payload.agent_name,
                "status": "error",
                "insights": [],
                "opportunities": [],
                "sources": [],
                "error": "Unauthorized: Invalid X-Supervisor-Token."
            }
        )

    try:
        client_id = payload.client_id.strip()
        platform = (payload.platform or "meta").strip().lower()
        campaign_id = (payload.campaign_id or "all").strip().lower()
        task_type = (payload.task.type or "optimize").strip().lower()

        # Map agent requested or platform to suitable specialized execution agents
        # Default marketing agent: performance-marketer optimize
        if payload.agent_name == "performance-marketer" or platform in {"meta", "google"}:
            agents_to_run = ["attribution", "funnel", "budget_allocator"]
        elif payload.agent_name == "forecast":
            agents_to_run = ["forecast", "scenario"]
        else:
            agents_to_run = ["attribution", "funnel", "cohort", "forecast", "scenario", "budget_allocator"]

        # Build payload
        base_payload = marko_brain._build_base_payload()
        base_payload["client_id"] = client_id
        base_payload["platform"] = platform
        base_payload["campaign_id"] = campaign_id
        if platform == "meta":
            base_payload["channel"] = "Facebook"
        elif platform == "google":
            base_payload["channel"] = "Google Ads"

        # Execute orchestration
        results = marko_brain.agent_manager.orchestrate(
            intent="budget_optimization" if task_type == "optimize" else "dashboard",
            agents_to_run=agents_to_run,
            payload=base_payload
        )
        
        # If client-specific execution fails (e.g. due to missing client datasets), retry on global dataset context
        if not results.get("success", False):
            logger.warning(
                f"Client execution failed/incomplete for {client_id}. Retrying on global dataset context."
            )
            base_payload["client_id"] = None
            results = marko_brain.agent_manager.orchestrate(
                intent="budget_optimization" if task_type == "optimize" else "dashboard",
                agents_to_run=agents_to_run,
                payload=base_payload
            )

        if not results.get("success", False):
            error_msg = results.get("errors", {}).get("system", "Orchestration failed.")
            raise ValueError(error_msg)

        executive_summary = results.get("executive_summary", "No summary generated.")
        recommendations = results.get("recommendations", [])

        # Structure using LLM formatter
        structured_output = _format_execute_results_with_llm(
            agent_name=payload.agent_name,
            user_input=payload.user_input,
            task_instruction=payload.task.instruction,
            platform=platform,
            executive_summary=executive_summary,
            recommendations=recommendations
        )

        return {
            "agent_name": payload.agent_name,
            "status": "ok",
            "insights": structured_output.get("insights", []),
            "opportunities": structured_output.get("opportunities", []),
            "sources": structured_output.get("sources", [platform, "database"]),
            "error": None
        }

    except Exception as e:
        logger.error(f"POST /execute failed: {e}")
        return JSONResponse(
            status_code=500,
            content={
                "agent_name": payload.agent_name,
                "status": "error",
                "insights": [],
                "opportunities": [],
                "sources": [],
                "error": str(e)
            }
        )


# -----------------------------------------------------------------------------
# Main Orchestrator Endpoint
# -----------------------------------------------------------------------------
@app.post("/api/orchestrate", response_model=OrchestrateResponse)
async def orchestrate_request(payload: ChatRequest, request: Request):
    if not marko_brain:
        raise HTTPException(status_code=503, detail="Analytics Agent not ready")

    try:
        client_id = _resolve_authenticated_client_id(request)
        thread = ensure_chat_thread(client_id, payload.thread_id, payload.message)
        thread_id = str(thread["id"])
        context_pairs = max(1, int(getattr(settings, "CONTEXT_SIZE", 3) or 3))
        history_message_limit = context_pairs * 2
        prior_history = list_recent_messages(
            client_id=client_id,
            thread_id=thread_id,
            limit=history_message_limit,
        )

        append_chat_message(
            client_id=client_id,
            thread_id=thread_id,
            role="user",
            content=payload.message,
        )

        # Log the selected datasets for context
        if payload.selected_datasets:
            logger.info(
                "Orchestrating with selected datasets",
                datasets=payload.selected_datasets,
                message=payload.message,
            )

        result = marko_brain.orchestrate(
            payload.message,
            thread_id=thread_id,
            conversation_history=prior_history,
            client_id=client_id,
        )

        try:
            result_payload = result.get("result") if isinstance(result.get("result"), dict) else {}
            intent_raw = result.get("intent")
            intent = intent_raw.get("id") if isinstance(intent_raw, dict) else None
            _persist_client_results(
                client_id=client_id,
                thread_id=thread_id,
                intent=intent,
                result_payload=result_payload,
            )
        except Exception as persist_error:
            logger.warning(
                "Could not persist supervisor orchestrate results",
                client_id=client_id,
                thread_id=thread_id,
                error=str(persist_error),
            )

        assistant_message = result.get("reasoning") or result.get("result", {}).get(
            "message") or "Analysis completed successfully."
        append_chat_message(
            client_id=client_id,
            thread_id=thread_id,
            role="assistant",
            content=assistant_message,
            metadata={
                "intent": result.get("intent", {}),
                "activated_agents": result.get("activated_agents", []),
            },
        )

        return {
            "success": True,
            "reasoning": result["reasoning"],
            "intent": result["intent"],
            "activated_agents": result["activated_agents"],
            "timeline": result["timeline"],
            "payload": result["payload"],
            "result": result["result"],
            "ui": result.get(
                "ui",
                {
                    "workspace": {"cards": []},
                    "insights_panel": {
                        "confidence_score": None,
                        "warnings": [],
                        "suggestions": [],
                    },
                },
            ),
            "thread_id": thread_id,
            "timestamp": datetime.utcnow().isoformat(),
        }

    except Exception as e:
        logger.error("Orchestrator endpoint failed", error=str(e))
        raise HTTPException(
            status_code=500,
            detail=f"Failed to orchestrate request: {str(e)}",
        )


@app.get("/api/chat-history", response_model=ChatThreadListResponse)
async def get_chat_history(
        request: Request,
        limit: int = Query(50, ge=1, le=200),
):
    client_id = "unknown"
    try:
        client_id = _resolve_authenticated_client_id(request)
        threads = list_chat_threads(client_id=client_id, limit=limit)
        return {
            "success": True,
            "threads": threads,
            "timestamp": datetime.utcnow().isoformat(),
        }
    except Exception as e:
        logger.error("Chat history listing failed", error=str(e), client_id=client_id)
        raise HTTPException(status_code=500, detail=f"Failed to fetch chat history: {str(e)}")


@app.get("/api/chat-history/{thread_id}", response_model=ChatThreadDetailResponse)
async def get_chat_history_thread(
        thread_id: str,
        request: Request,
):
    try:
        client_id = _resolve_authenticated_client_id(request)
        thread = get_chat_thread(client_id=client_id, thread_id=thread_id)
        if not thread:
            raise HTTPException(status_code=404, detail="Chat thread not found")

        messages = list_chat_messages(client_id=client_id, thread_id=thread_id)
        serialized_messages = [
            {
                "id": str(item.get("id", "")),
                "role": item.get("role", "assistant"),
                "content": item.get("content", ""),
                "created_at": item.get("created_at", datetime.utcnow().isoformat()),
            }
            for item in messages
        ]

        return {
            "success": True,
            "thread": thread,
            "messages": serialized_messages,
            "timestamp": datetime.utcnow().isoformat(),
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Chat history thread fetch failed", error=str(e), thread_id=thread_id)
        raise HTTPException(status_code=500, detail=f"Failed to fetch chat thread: {str(e)}")


@app.get(
    "/api/recommendations/outcomes",
    response_model=RecommendationLifecycleListResponse,
)
@app.get(
    "/agents/recommendations/outcomes",
    response_model=RecommendationLifecycleListResponse,
)
async def get_recommendation_outcomes(
        request: Request,
        thread_id: Optional[str] = Query(None, description="Chat thread identifier"),
):
    resolved_client_id = "unknown"
    try:
        resolved_client_id = _resolve_authenticated_client_id(request)
        records = list_recommendation_outcomes(
            client_id=resolved_client_id,
            thread_id=thread_id,
        )
        return {
            "success": True,
            "data": records,
            "timestamp": datetime.utcnow().isoformat(),
        }
    except Exception as e:
        logger.error(
            "Recommendation outcomes fetch failed",
            error=str(e),
            client_id=resolved_client_id,
            thread_id=thread_id,
        )
        raise HTTPException(status_code=500, detail=f"Failed to fetch recommendation outcomes: {str(e)}")


@app.post(
    "/api/recommendations/outcomes",
    response_model=RecommendationLifecycleUpsertResponse,
)
@app.post(
    "/agents/recommendations/outcomes",
    response_model=RecommendationLifecycleUpsertResponse,
)
async def save_recommendation_outcome(payload: RecommendationLifecycleRecord, request: Request):
    try:
        record_data = payload.model_dump()
        record_data["client_id"] = _resolve_authenticated_client_id(request)
        saved = upsert_recommendation_outcome(record_data)
        return {
            "success": True,
            "data": saved,
            "timestamp": datetime.utcnow().isoformat(),
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("Recommendation outcome upsert failed", error=str(e))
        raise HTTPException(status_code=500, detail=f"Failed to save recommendation outcome: {str(e)}")


# -----------------------------------------------------------------------------
# Direct Analytics Endpoint
# -----------------------------------------------------------------------------
@app.post("/api/analyze", response_model=AnalyticsResponse)
async def run_analysis(
        payload: AnalyticsPayloadRequest,
        background_tasks: BackgroundTasks,
):
    if not analytics_runner:
        raise HTTPException(status_code=503, detail="Analytics service not ready")

    run_id = str(uuid.uuid4())

    try:
        result = analytics_runner.run(payload.model_dump())

        return {
            "success": True,
            "run_id": run_id,
            "timestamp": datetime.utcnow().isoformat(),
            "data": result,
        }

    except Exception as e:
        logger.error(
            "Analysis failed",
            run_id=run_id,
            error=str(e),
        )
        raise HTTPException(
            status_code=500,
            detail=f"Analysis failed: {str(e)}",
        )


# -----------------------------------------------------------------------------
# Budget Sensitivity
# -----------------------------------------------------------------------------
@app.post("/api/budget-sensitivity", response_model=BudgetSensitivityResponse)
async def budget_sensitivity(
        payload: AnalyticsPayloadRequest,
        budgets: list[float],
):
    if not analytics_runner:
        raise HTTPException(status_code=503, detail="Analytics service not ready")

    try:
        result = analytics_runner.budget_sensitivity(
            payload.model_dump(),
            budgets,
        )

        return {
            "success": True,
            "timestamp": datetime.utcnow().isoformat(),
            "data": result,
        }

    except Exception as e:
        logger.error("Budget sensitivity failed", error=str(e))
        raise HTTPException(
            status_code=500,
            detail=f"Analysis failed: {str(e)}",
        )


# -----------------------------------------------------------------------------
# Break-even
# -----------------------------------------------------------------------------
@app.post("/api/break-even", response_model=BreakEvenResponse)
async def break_even(payload: AnalyticsPayloadRequest):
    if not analytics_runner:
        raise HTTPException(status_code=503, detail="Analytics service not ready")

    try:
        result = analytics_runner.break_even(payload.model_dump())

        return {
            "success": True,
            "timestamp": datetime.utcnow().isoformat(),
            "data": result,
        }

    except Exception as e:
        logger.error("Break-even failed", error=str(e))
        raise HTTPException(
            status_code=500,
            detail=f"Analysis failed: {str(e)}",
        )


# -----------------------------------------------------------------------------
# LTV Projection
# -----------------------------------------------------------------------------
@app.post("/api/ltv-projection", response_model=LTVProjectionResponse)
async def ltv_projection(
        payload: AnalyticsPayloadRequest,
        months: int = 12,
):
    if not analytics_runner:
        raise HTTPException(status_code=503, detail="Analytics service not ready")

    try:
        result = analytics_runner.ltv_projection(
            payload.model_dump(),
            months,
        )

        return {
            "success": True,
            "timestamp": datetime.utcnow().isoformat(),
            "data": result,
        }

    except Exception as e:
        logger.error("LTV projection failed", error=str(e))
        raise HTTPException(
            status_code=500,
            detail=f"Analysis failed: {str(e)}",
        )


# -----------------------------------------------------------------------------
# CFO Mode
# -----------------------------------------------------------------------------
@app.post("/api/cfo-mode", response_model=CFOReportResponse)
async def cfo_mode(payload: AnalyticsPayloadRequest):
    if not analytics_runner:
        raise HTTPException(status_code=503, detail="Analytics service not ready")

    try:
        result = analytics_runner.cfo_mode(payload.model_dump())

        return {
            "success": True,
            "timestamp": datetime.utcnow().isoformat(),
            "data": result,
        }

    except Exception as e:
        logger.error("CFO mode failed", error=str(e))
        raise HTTPException(
            status_code=500,
            detail=f"Analysis failed: {str(e)}",
        )


# -----------------------------------------------------------------------------
# Capabilities
# -----------------------------------------------------------------------------
@app.get("/api/capabilities", response_model=CapabilitiesResponse)
async def get_capabilities():
    if not analytics_runner:
        raise HTTPException(status_code=503, detail="Analytics service not ready")

    return {
        "success": True,
        "capabilities": analytics_runner.capabilities,
    }


# -----------------------------------------------------------------------------
# File Management Endpoints
# -----------------------------------------------------------------------------
@app.post("/api/agents/{agent_id}/files", response_model=FileUploadResponse)
async def upload_agent_file(
        agent_id: int,
        request: Request,
        file: UploadFile = FastAPIFile(...),
        category: Optional[str] = Form(default=None),
        instructions: Optional[str] = Form(default=None),
):
    """Upload a file for an agent and store it in the database."""
    try:
        # Validate file
        FileHandler.validate_file(file)

        # Save file to disk
        file_metadata = await FileHandler.save_file(file, agent_id)
        resolved_client_id = _resolve_authenticated_client_id(request)
        resolved_category = _normalize_training_category(category)
        cleaned_instructions = (instructions or "").strip() or None

        local_storage_path = str(file_metadata["storage_path"])
        file_bytes = Path(local_storage_path).read_bytes()
        remote_storage_path = _build_training_storage_path(
            client_id=resolved_client_id,
            agent_id=agent_id,
            category=resolved_category,
            original_file_name=file_metadata["file_name"],
        )

        upload_file_to_storage(
            bucket_name=os.getenv("SUPABASE_TRAINING_BUCKET", "agent-training-assets"),
            file_path=remote_storage_path,
            file_body=file_bytes,
        )

        insert_training_upload_record(
            {
                "client_id": resolved_client_id,
                "agent_id": agent_id,
                "file_name": file_metadata["file_name"],
                "file_type": file_metadata["file_type"],
                "file_size": file_metadata["file_size"],
                "local_storage_path": local_storage_path,
                "remote_storage_path": remote_storage_path,
                "category": resolved_category,
                "instructions": cleaned_instructions,
                "created_at": datetime.utcnow().isoformat(),
            }
        )

        # Get database session
        session = get_session()
        try:
            # Ensure agent exists
            agent = session.query(Agent).filter(Agent.id == agent_id).first()
            if not agent:
                agent = Agent(id=agent_id, name=f"Agent_{agent_id}")
                session.add(agent)
                session.commit()

            # Create file record in database
            db_file = File(
                file_name=file_metadata["file_name"],
                file_type=file_metadata["file_type"],
                file_size=file_metadata["file_size"],
                storage_path=file_metadata["storage_path"],
            )
            session.add(db_file)
            session.commit()

            # Associate file with agent
            agent.files.append(db_file)
            session.commit()

            logger.info(
                "File uploaded and associated with agent",
                agent_id=agent_id,
                file_id=db_file.id,
                file_name=file.filename,
                client_id=resolved_client_id,
                category=resolved_category,
            )

            return {
                "success": True,
                "file": {
                    "id": db_file.id,
                    "file_name": db_file.file_name,
                    "file_type": db_file.file_type,
                    "file_size": db_file.file_size,
                    "storage_path": db_file.storage_path,
                    "created_at": db_file.created_at,
                    "client_id": resolved_client_id,
                    "category": resolved_category,
                    "instructions": cleaned_instructions,
                    "remote_storage_path": remote_storage_path,
                },
                "message": f"File '{file.filename}' uploaded successfully",
                "timestamp": datetime.utcnow().isoformat(),
            }
        finally:
            session.close()

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Upload endpoint failed", error=str(e))
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


@app.get("/api/agents/{agent_id}/files", response_model=FilesListResponse)
async def get_agent_files(agent_id: int):
    """Get all files associated with an agent."""
    try:
        session = get_session()
        try:
            # Get agent and its files
            agent = session.query(Agent).filter(Agent.id == agent_id).first()
            if not agent:
                logger.warning("Agent not found", agent_id=agent_id)
                return {
                    "success": True,
                    "files": [],
                    "timestamp": datetime.utcnow().isoformat(),
                }

            files = [FileResponse.from_orm(f) for f in agent.files]
            logger.info("Retrieved agent files", agent_id=agent_id, count=len(files))

            return {
                "success": True,
                "files": files,
                "timestamp": datetime.utcnow().isoformat(),
            }
        finally:
            session.close()

    except Exception as e:
        logger.error("Get files endpoint failed", error=str(e), agent_id=agent_id)
        raise HTTPException(status_code=500, detail=f"Failed to retrieve files: {str(e)}")


@app.get("/api/training-uploads", response_model=TrainingUploadListResponse)
async def list_training_uploads(
        request: Request,
):
    resolved_client_id = "unknown"
    try:
        resolved_client_id = _resolve_authenticated_client_id(request)
        response = list_training_upload_records(resolved_client_id)
        records = response.data or []

        return {
            "success": True,
            "files": records,
            "timestamp": datetime.utcnow().isoformat(),
        }
    except Exception as e:
        logger.error("Training upload listing failed", error=str(e), client_id=resolved_client_id)
        raise HTTPException(status_code=500, detail=f"Failed to load training uploads: {str(e)}")


@app.get("/api/training-uploads/{upload_id}/preview", response_model=TrainingUploadPreviewResponse)
async def preview_training_upload(
        upload_id: int,
        request: Request,
):
    resolved_client_id = "unknown"
    try:
        resolved_client_id = _resolve_authenticated_client_id(request)
        response = get_training_upload_record(upload_id, resolved_client_id)
        records = response.data or []
        if not records:
            raise HTTPException(status_code=404, detail="Training upload not found")

        record = records[0]
        local_path = str(record.get("local_storage_path") or "").strip()
        preview = FileHandler.extract_file_preview(local_path, lines=12) if local_path else ""

        return {
            "success": True,
            "file": record,
            "preview": preview,
            "timestamp": datetime.utcnow().isoformat(),
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Training upload preview failed", error=str(e), upload_id=upload_id)
        raise HTTPException(status_code=500, detail=f"Failed to preview training upload: {str(e)}")


@app.delete("/api/training-uploads/{upload_id}", response_model=FileDeleteResponse)
async def delete_training_upload(
        upload_id: int,
        request: Request,
):
    resolved_client_id = "unknown"
    try:
        resolved_client_id = _resolve_authenticated_client_id(request)
        response = get_training_upload_record(upload_id, resolved_client_id)
        records = response.data or []
        if not records:
            raise HTTPException(status_code=404, detail="Training upload not found")

        record = records[0]
        local_path = str(record.get("local_storage_path") or "").strip()
        remote_path = str(record.get("remote_storage_path") or "").strip()

        if remote_path:
            delete_file_from_storage(
                bucket_name=os.getenv("SUPABASE_TRAINING_BUCKET", "agent-training-assets"),
                file_path=remote_path,
            )

        if local_path:
            try:
                FileHandler.delete_file(local_path)
            except HTTPException as local_delete_error:
                logger.warning(
                    "Skipping local file delete due to path validation or missing file",
                    upload_id=upload_id,
                    local_path=local_path,
                    detail=str(local_delete_error.detail),
                )

        session = get_session()
        try:
            db_file = session.query(File).filter(File.storage_path == local_path).first()
            if db_file:
                session.delete(db_file)
                session.commit()
        finally:
            session.close()

        delete_training_upload_record(upload_id, resolved_client_id)

        return {
            "success": True,
            "message": "Training upload deleted successfully",
            "timestamp": datetime.utcnow().isoformat(),
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Training upload delete failed", error=str(e), upload_id=upload_id)
        raise HTTPException(status_code=500, detail=f"Failed to delete training upload: {str(e)}")


@app.get("/api/files/{file_id}", response_model=FileResponse)
async def get_file(file_id: int):
    """Get file details by ID."""
    try:
        session = get_session()
        try:
            db_file = session.query(File).filter(File.id == file_id).first()
            if not db_file:
                raise HTTPException(status_code=404, detail="File not found")

            return FileResponse.from_orm(db_file)
        finally:
            session.close()

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Get file endpoint failed", error=str(e), file_id=file_id)
        raise HTTPException(status_code=500, detail=f"Failed to retrieve file: {str(e)}")


@app.delete("/api/files/{file_id}", response_model=FileDeleteResponse)
async def delete_file(file_id: int):
    """Delete a file by ID."""
    try:
        session = get_session()
        try:
            # Get file
            db_file = session.query(File).filter(File.id == file_id).first()
            if not db_file:
                raise HTTPException(status_code=404, detail="File not found")

            # Delete from storage
            FileHandler.delete_file(db_file.storage_path)

            # Delete from database
            session.delete(db_file)
            session.commit()

            logger.info("File deleted", file_id=file_id, file_name=db_file.file_name)

            return {
                "success": True,
                "message": f"File '{db_file.file_name}' deleted successfully",
                "timestamp": datetime.utcnow().isoformat(),
            }
        finally:
            session.close()

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Delete file endpoint failed", error=str(e), file_id=file_id)
        raise HTTPException(status_code=500, detail=f"Failed to delete file: {str(e)}")


# -----------------------------------------------------------------------------
# Available Data / Datasets
# -----------------------------------------------------------------------------
class AvailableDataset(BaseModel):
    name: str
    description: str
    agent_types: list[str]
    row_count: int = 0
    columns: list[str] = []


class AvailableDatasetsResponse(BaseModel):
    success: bool = True
    datasets: list[AvailableDataset]
    timestamp: str


class SelectedDatasetsRequest(BaseModel):
    selected_datasets: list[str] = Field(default_factory=list, description="List of dataset names to use for analysis")


class DatasetRowsResponse(BaseModel):
    success: bool = True
    dataset: str
    columns: list[str]
    rows: list[dict]
    row_count: int
    source: str
    timestamp: str


class DatasetUpdateResponse(BaseModel):
    success: bool = True
    dataset: str
    updated_rows: int
    message: str
    timestamp: str


class DatasetRowsUpdateRequest(BaseModel):
    rows: list[dict] = Field(default_factory=list)


class DataQueryAgentRequest(BaseModel):
    prompt: str
    client_id: Optional[str] = None
    limit: int = Field(default=50, ge=1, le=200)


class DataQueryAgentResponse(BaseModel):
    success: bool = True
    data: dict
    timestamp: str


class FunnelOptionsResponse(BaseModel):
    success: bool = True
    data: dict
    timestamp: str


class AttributionOptionsResponse(BaseModel):
    success: bool = True
    data: dict
    timestamp: str


class ForecastOptionsResponse(BaseModel):
    success: bool = True
    data: dict
    timestamp: str


class CohortOptionsResponse(BaseModel):
    success: bool = True
    data: dict
    timestamp: str


class ScenarioOptionsResponse(BaseModel):
    success: bool = True
    data: dict
    timestamp: str


class BudgetAllocatorOptionsResponse(BaseModel):
    success: bool = True
    data: dict
    timestamp: str


ALLOWED_DATASETS = {"campaigns", "customers", "events", "retention", "transactions"}


def _validate_dataset_name(dataset_name: str) -> str:
    normalized = dataset_name.strip().lower()
    if normalized not in ALLOWED_DATASETS:
        raise HTTPException(status_code=400, detail=f"Unsupported dataset '{dataset_name}'")
    return normalized


@app.get("/api/available-datasets", response_model=AvailableDatasetsResponse)
async def get_available_datasets(request: Request):
    """
    Fetch all available datasets from Supabase.
    Returns metadata about each dataset including name, description, and which agents can use it.
    """
    try:
        from analytics_agent.db.queries import get_dataset_dataframe_with_source

        resolved_client_id = _resolve_authenticated_client_id(request)

        datasets: list[AvailableDataset] = []
        dataset_definitions = [
            (
                "campaigns",
                "Campaign performance data including spend, impressions, clicks, conversions, and revenue",
                ["forecast", "scenario", "funnel", "roi_forecaster"],
            ),
            (
                "events",
                "Customer event data including page views, clicks, and interactions",
                ["funnel", "attribution", "cohort"],
            ),
            (
                "customers",
                "Customer demographic and profile information",
                ["cohort", "attribution"],
            ),
            (
                "retention",
                "Customer retention and churn probability data",
                ["cohort", "kpi_validator"],
            ),
            (
                "transactions",
                "Transaction and purchase data including customer ID, amount, and date",
                ["attribution", "cohort", "revenue_attribution"],
            ),
        ]

        for dataset_name, description, agent_types in dataset_definitions:
            try:
                df_preview, source = get_dataset_dataframe_with_source(
                    dataset_name,
                    limit=1,
                    prefer_remote=not bool(resolved_client_id),
                    client_id=resolved_client_id,
                )
                full_df, full_source = get_dataset_dataframe_with_source(
                    dataset_name,
                    prefer_remote=not bool(resolved_client_id),
                    client_id=resolved_client_id,
                )

                # When client context exists, expose datasets available through Supabase
                # for that client context.
                if resolved_client_id:
                    if full_source not in {"client_uploads", "supabase"} or full_df.empty:
                        continue

                # Without client context, keep previous behavior: show only datasets that have rows.
                if full_df.empty:
                    continue

                datasets.append(
                    AvailableDataset(
                        name=dataset_name,
                        description=description,
                        agent_types=agent_types,
                        row_count=len(full_df),
                        columns=df_preview.columns.tolist() if not df_preview.empty else [],
                    )
                )
            except Exception as e:
                logger.warning("Could not fetch dataset metadata", dataset=dataset_name, error=str(e))

        return {
            "success": True,
            "datasets": datasets,
            "timestamp": datetime.utcnow().isoformat(),
        }

    except Exception as e:
        logger.error("Failed to fetch available datasets", error=str(e))
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch available datasets: {str(e)}",
        )


@app.get("/api/datasets/{dataset_name}", response_model=DatasetRowsResponse)
async def get_dataset_rows(dataset_name: str, request: Request, limit: int = 50):
    dataset = _validate_dataset_name(dataset_name)
    try:
        from analytics_agent.db.queries import get_dataset_dataframe_with_source

        safe_limit = max(1, min(limit, 500))
        resolved_client_id = _resolve_authenticated_client_id(request)
        dataframe, source = get_dataset_dataframe_with_source(
            dataset,
            limit=safe_limit,
            prefer_remote=not bool(resolved_client_id),
            client_id=resolved_client_id,
        )

        return {
            "success": True,
            "dataset": dataset,
            "columns": dataframe.columns.tolist() if not dataframe.empty else [],
            "rows": dataframe.where(pd.notnull(dataframe), None).to_dict(
                orient="records") if not dataframe.empty else [],
            "row_count": int(len(dataframe.index)),
            "source": source,
            "timestamp": datetime.utcnow().isoformat(),
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to fetch dataset rows", dataset=dataset, error=str(e))
        raise HTTPException(status_code=500, detail=f"Failed to fetch dataset rows: {str(e)}")


@app.post("/api/datasets/{dataset_name}/rows", response_model=DatasetUpdateResponse)
async def upsert_dataset_rows(dataset_name: str, payload: DatasetRowsUpdateRequest, request: Request):
    dataset = _validate_dataset_name(dataset_name)
    try:
        from analytics_agent.db.queries import upsert_dataset_rows as _upsert_dataset_rows

        _ = _resolve_authenticated_client_id(request)
        updated_rows = _upsert_dataset_rows(dataset, payload.rows)
        return {
            "success": True,
            "dataset": dataset,
            "updated_rows": updated_rows,
            "message": f"Upserted {updated_rows} rows into {dataset}",
            "timestamp": datetime.utcnow().isoformat(),
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to upsert dataset rows", dataset=dataset, error=str(e))
        raise HTTPException(status_code=500, detail=f"Failed to upsert dataset rows: {str(e)}")


@app.post("/api/datasets/{dataset_name}/upload-csv", response_model=DatasetUpdateResponse)
async def upload_dataset_csv(dataset_name: str, request: Request, file: UploadFile = FastAPIFile(...)):
    dataset = _validate_dataset_name(dataset_name)
    _ = _resolve_authenticated_client_id(request)

    if not (file.filename or "").lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV uploads are supported for dataset update")

    try:
        from analytics_agent.db.queries import upsert_dataset_rows as _upsert_dataset_rows

        payload = await file.read()
        if len(payload) > MAX_DATASET_UPLOAD_BYTES:
            raise HTTPException(
                status_code=413,
                detail=f"CSV payload exceeds {MAX_DATASET_UPLOAD_BYTES // (1024 * 1024)}MB limit",
            )
        text = payload.decode("utf-8")
        dataframe = pd.read_csv(StringIO(text), nrows=MAX_DATASET_UPLOAD_ROWS + 1)
        if len(dataframe.index) > MAX_DATASET_UPLOAD_ROWS:
            raise HTTPException(status_code=413, detail=f"CSV row limit exceeded ({MAX_DATASET_UPLOAD_ROWS})")
        if len(dataframe.columns) > MAX_DATASET_UPLOAD_COLUMNS:
            raise HTTPException(status_code=413, detail=f"CSV column limit exceeded ({MAX_DATASET_UPLOAD_COLUMNS})")
        total_cells = int(len(dataframe.index) * len(dataframe.columns))
        if total_cells > MAX_DATASET_UPLOAD_CELLS:
            raise HTTPException(status_code=413, detail="CSV cell limit exceeded")
        rows = dataframe.where(pd.notnull(dataframe), None).to_dict(orient="records")
        updated_rows = _upsert_dataset_rows(dataset, rows)

        return {
            "success": True,
            "dataset": dataset,
            "updated_rows": updated_rows,
            "message": f"Uploaded and upserted {updated_rows} rows into {dataset}",
            "timestamp": datetime.utcnow().isoformat(),
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to upload dataset csv", dataset=dataset, filename=file.filename, error=str(e))
        raise HTTPException(status_code=500, detail=f"Failed to upload dataset csv: {str(e)}")


@app.post("/agents/data-query", response_model=DataQueryAgentResponse)
@app.post("/api/agents/data-query", response_model=DataQueryAgentResponse)
async def run_data_query_agent(request: DataQueryAgentRequest, http_request: Request):
    if not data_query_agent:
        raise HTTPException(status_code=503, detail="Data Query agent is not initialized")

    resolved_client_id = _resolve_authenticated_client_id(http_request)

    try:
        result = data_query_agent.run(
            DataQueryRequest(
                prompt=request.prompt,
                client_id=resolved_client_id,
                limit=request.limit,
            )
        )
        return {
            "success": True,
            "data": result,
            "timestamp": datetime.utcnow().isoformat(),
        }
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.exception("Data query agent execution failed", error=str(exc))
        raise HTTPException(status_code=500, detail=f"Data query agent failed: {str(exc)}")


@app.get("/api/agents-data-mapping")
async def get_agents_data_mapping():
    """
    Fetch which data sources each agent can use.
    This helps the frontend show users which datasets are compatible with which agents.
    """
    try:
        mapping = {
            "forecast": {
                "name": "Forecast Agent",
                "description": "Forecasts future revenue and performance",
                "compatible_datasets": ["campaigns"],
                "icon": "TrendingUp"
            },
            "scenario": {
                "name": "Scenario Agent",
                "description": "Compares different scenarios and budgets",
                "compatible_datasets": ["campaigns", "transactions"],
                "icon": "PieChart"
            },
            "funnel": {
                "name": "Funnel Agent",
                "description": "Analyzes conversion funnels and drop-off rates",
                "compatible_datasets": ["campaigns", "events"],
                "icon": "Filter"
            },
            "cohort": {
                "name": "Cohort Agent",
                "description": "Performs cohort analysis and customer segmentation",
                "compatible_datasets": ["customers", "transactions", "retention", "events"],
                "icon": "Users"
            },
            "attribution": {
                "name": "Attribution Agent",
                "description": "Models customer attribution across channels",
                "compatible_datasets": ["events", "transactions", "customers"],
                "icon": "Network"
            },
            "budget_allocator": {
                "name": "Budget Allocator Agent",
                "description": "Allocates channel budgets using objectives, constraints, and risk tolerance",
                "compatible_datasets": ["campaigns", "transactions"],
                "icon": "Wallet"
            },
            "data_query": {
                "name": "Data Query Agent",
                "description": "Answers natural-language data questions with validated query plans",
                "compatible_datasets": ["campaigns", "customers", "events", "retention", "transactions"],
                "icon": "DatabaseZap"
            },
        }

        return {
            "success": True,
            "mapping": mapping,
            "timestamp": datetime.utcnow().isoformat(),
        }
    except Exception as e:
        logger.error("Failed to fetch agent data mapping", error=str(e))
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch agent data mapping: {str(e)}",
        )


# ============================================================
# Agent Management Endpoints
# ============================================================

class AgentOrchestrationRequest(BaseModel):
    """Request for agent orchestration"""
    intent: str
    agents: list[str]
    payload: dict = {}
    client_id: Optional[str] = None
    thread_id: Optional[str] = None


class TrainForecastRequest(BaseModel):
    """Request to train forecast model"""
    pass


class ReportGenerationRequest(BaseModel):
    """Request for generating an LLM-backed report from selected agents."""
    report_type: Literal["executive", "detailed"] = "executive"
    export_format: Literal["pdf", "doc"] = "pdf"
    agents: list[str] = Field(default_factory=list)
    payload: dict = Field(default_factory=dict)
    client_id: Optional[str] = None
    thread_id: Optional[str] = None


_REPORT_AGENT_ORDER = ["attribution", "funnel", "cohort", "forecast", "scenario", "budget_allocator"]
_REPORT_AGENT_LABELS = {
    "attribution": "Attribution Agent",
    "funnel": "Funnel Agent",
    "cohort": "Cohort Agent",
    "forecast": "Forecast Agent",
    "scenario": "Scenario Agent",
    "budget_allocator": "Budget Allocator Agent",
}


def _normalize_report_agents(raw_agents: list[str]) -> list[str]:
    normalized = {
        str(agent).strip().lower()
        for agent in raw_agents
        if str(agent).strip()
    }
    return [agent for agent in _REPORT_AGENT_ORDER if agent in normalized]


def _clean_line(value: str) -> str:
    compact = re.sub(r"\s+", " ", value).strip()
    return compact


def _build_report_prompt(
        *,
        report_type: str,
        selected_agents: list[str],
        orchestration_result: dict[str, Any],
) -> str:
    agent_results = orchestration_result.get("agent_results") if isinstance(orchestration_result, dict) else {}
    if not isinstance(agent_results, dict):
        agent_results = {}

    selected_payload = {
        agent: agent_results.get(agent)
        for agent in selected_agents
        if agent_results.get(agent) is not None
    }

    sections = "\n".join([f"- {_REPORT_AGENT_LABELS.get(agent, agent.title())}" for agent in selected_agents])
    detail_level = "concise and board-ready" if report_type == "executive" else "thorough and analytical"

    return (
        "You are an analytics reporting assistant.\n"
        f"Create a {report_type} report that is {detail_level}.\n"
        "Use only the evidence from selected agent outputs.\n"
        "Required sections:\n"
        "1) Executive Summary\n"
        "2) Agent Highlights (one subsection per selected agent)\n"
        "3) KPI Snapshot\n"
        "4) Risks and Data Caveats\n"
        "5) Prioritized Action Plan\n\n"
        f"Selected agents:\n{sections}\n\n"
        "Return plain text only (no markdown table, no code block).\n"
        "Keep metric values as provided. If a value is absent, explicitly state unavailable.\n\n"
        "Agent outputs JSON:\n"
        f"{json.dumps(selected_payload, indent=2, default=str)}"
    )


def _build_fallback_report_text(
        *,
        report_type: str,
        selected_agents: list[str],
        orchestration_result: dict[str, Any],
) -> str:
    intent = orchestration_result.get("intent") if isinstance(orchestration_result, dict) else "report"
    recommendations = orchestration_result.get("recommendations") if isinstance(orchestration_result, dict) else []
    recommendations_list = recommendations if isinstance(recommendations, list) else []
    agent_results = orchestration_result.get("agent_results") if isinstance(orchestration_result, dict) else {}
    if not isinstance(agent_results, dict):
        agent_results = {}

    lines = [
        f"{report_type.title()} Analytics Report",
        f"Generated at: {datetime.utcnow().isoformat()} UTC",
        f"Intent: {intent}",
        "",
        "Executive Summary",
        _clean_line(
            str(
                orchestration_result.get("executive_summary")
                or "LLM summary unavailable; using deterministic summary from selected agent outputs."
            )
        ),
        "",
        "Agent Highlights",
    ]

    for agent in selected_agents:
        label = _REPORT_AGENT_LABELS.get(agent, agent.title())
        payload = agent_results.get(agent)
        if not payload:
            lines.extend([f"- {label}: unavailable."])
            continue

        payload_text = json.dumps(payload, indent=2, default=str)
        compact = _clean_line(payload_text)
        lines.extend([f"- {label}: {compact[:900]}{'...' if len(compact) > 900 else ''}"])

    lines.extend(["", "Prioritized Action Plan"])

    if recommendations_list:
        for idx, item in enumerate(recommendations_list[:8], start=1):
            lines.append(f"{idx}. {_clean_line(str(item))}")
    else:
        lines.append("1. No explicit recommendations were produced by the selected agents.")

    return "\n".join(lines)


def _escape_pdf_text(value: str) -> str:
    ascii_text = value.encode("ascii", errors="replace").decode("ascii")
    return ascii_text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def _build_minimal_pdf_bytes(text: str) -> bytes:
    raw_lines = [line.rstrip() for line in text.splitlines()]
    wrapped: list[str] = []
    for line in raw_lines:
        source = line or " "
        while len(source) > 94:
            wrapped.append(source[:94])
            source = source[94:]
        wrapped.append(source)

    if not wrapped:
        wrapped = ["Generated report"]

    lines_per_page = 48
    pages = [wrapped[i:i + lines_per_page] for i in range(0, len(wrapped), lines_per_page)]

    objects: list[str] = []
    objects.append("<< /Type /Catalog /Pages 2 0 R >>")

    page_obj_numbers = [4 + (index * 2) for index in range(len(pages))]
    kids = " ".join([f"{obj} 0 R" for obj in page_obj_numbers])
    objects.append(f"<< /Type /Pages /Count {len(pages)} /Kids [ {kids} ] >>")
    objects.append("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")

    for index, page_lines in enumerate(pages):
        page_obj = 4 + (index * 2)
        content_obj = page_obj + 1
        stream_lines = [
            "BT",
            "/F1 11 Tf",
            "50 790 Td",
            "14 TL",
        ]
        for line in page_lines:
            stream_lines.append(f"({_escape_pdf_text(line)}) Tj")
            stream_lines.append("T*")
        stream_lines.append("ET")
        stream = "\n".join(stream_lines)

        objects.append(
            f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents {content_obj} 0 R >>"
        )
        objects.append(f"<< /Length {len(stream.encode('latin-1'))} >>\nstream\n{stream}\nendstream")

    pdf_parts: list[bytes] = [b"%PDF-1.4\n"]
    offsets: list[int] = [0]

    for index, obj_content in enumerate(objects, start=1):
        offsets.append(sum(len(part) for part in pdf_parts))
        obj_block = f"{index} 0 obj\n{obj_content}\nendobj\n"
        pdf_parts.append(obj_block.encode("latin-1", errors="replace"))

    xref_start = sum(len(part) for part in pdf_parts)
    xref_lines = [f"xref\n0 {len(objects) + 1}\n", "0000000000 65535 f \n"]
    for offset in offsets[1:]:
        xref_lines.append(f"{offset:010d} 00000 n \n")
    trailer = (
            "".join(xref_lines)
            + f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\n"
            + f"startxref\n{xref_start}\n%%EOF"
    )
    pdf_parts.append(trailer.encode("latin-1"))

    return b"".join(pdf_parts)


def _build_doc_bytes(title: str, text: str) -> bytes:
    safe_title = title.replace("<", "&lt;").replace(">", "&gt;")
    escaped_text = (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace("\n", "<br/>")
    )
    html = (
        "<html><head><meta charset='utf-8'/></head><body>"
        f"<h1>{safe_title}</h1>"
        f"<p>{escaped_text}</p>"
        "</body></html>"
    )
    return html.encode("utf-8")


@app.get("/agents/funnel/options", response_model=FunnelOptionsResponse)
@app.get("/api/agents/funnel/options", response_model=FunnelOptionsResponse)
@app.get("/funnel/options", response_model=FunnelOptionsResponse)
@app.get("/api/funnel/options", response_model=FunnelOptionsResponse)
async def get_funnel_options(request: Request):
    """Return only funnel filter options that actually exist in current datasets."""
    try:
        from analytics_agent.db.queries import get_funnel_filter_options

        return {
            "success": True,
            "data": get_funnel_filter_options(
                prefer_remote=False,
                client_id=_resolve_authenticated_client_id(request),
            ),
            "timestamp": datetime.utcnow().isoformat(),
        }
    except Exception as e:
        logger.exception("Failed to fetch funnel options", error=str(e))
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch funnel options: {str(e)}",
        )


@app.get("/agents/forecast/options", response_model=ForecastOptionsResponse)
@app.get("/api/agents/forecast/options", response_model=ForecastOptionsResponse)
async def get_forecast_options(request: Request):
    """Return forecast filters from Supabase campaigns data only."""
    try:
        from analytics_agent.db.queries import get_forecast_filter_options

        return {
            "success": True,
            "data": get_forecast_filter_options(
                _resolve_authenticated_client_id(request)
            ),
            "timestamp": datetime.utcnow().isoformat(),
        }
    except Exception as e:
        logger.exception("Failed to fetch forecast options", error=str(e))
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch forecast options: {str(e)}",
        )


@app.get("/agents/attribution/options", response_model=AttributionOptionsResponse)
@app.get("/api/agents/attribution/options", response_model=AttributionOptionsResponse)
async def get_attribution_options(request: Request):
    """Return attribution filters and toggles from Supabase campaigns/events/transactions only."""
    try:
        from analytics_agent.db.queries import get_attribution_filter_options

        return {
            "success": True,
            "data": get_attribution_filter_options(
                _resolve_authenticated_client_id(request)
            ),
            "timestamp": datetime.utcnow().isoformat(),
        }
    except Exception as e:
        logger.exception("Failed to fetch attribution options", error=str(e))
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch attribution options: {str(e)}",
        )


@app.get("/agents/scenario/options", response_model=ScenarioOptionsResponse)
@app.get("/api/agents/scenario/options", response_model=ScenarioOptionsResponse)
async def get_scenario_options(request: Request):
    """Return scenario filters from Supabase campaigns data only."""
    try:
        from analytics_agent.db.queries import get_scenario_filter_options

        return {
            "success": True,
            "data": get_scenario_filter_options(
                _resolve_authenticated_client_id(request)
            ),
            "timestamp": datetime.utcnow().isoformat(),
        }
    except Exception as e:
        logger.exception("Failed to fetch scenario options", error=str(e))
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch scenario options: {str(e)}",
        )


@app.get("/agents/cohort/options", response_model=CohortOptionsResponse)
@app.get("/api/agents/cohort/options", response_model=CohortOptionsResponse)
@app.get("/cohort/options", response_model=CohortOptionsResponse)
@app.get("/api/cohort/options", response_model=CohortOptionsResponse)
async def get_cohort_options(request: Request):
    """Return cohort filters and defaults from Supabase customers/retention/transactions."""
    try:
        from analytics_agent.db.queries import get_cohort_filter_options

        return {
            "success": True,
            "data": get_cohort_filter_options(
                _resolve_authenticated_client_id(request)
            ),
            "timestamp": datetime.utcnow().isoformat(),
        }
    except Exception as e:
        logger.exception("Failed to fetch cohort options", error=str(e))
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch cohort options: {str(e)}",
        )


@app.get("/agents/budget/options", response_model=BudgetAllocatorOptionsResponse)
@app.get("/api/agents/budget/options", response_model=BudgetAllocatorOptionsResponse)
async def get_budget_allocator_options(request: Request):
    """Return budget allocator filters and defaults from Supabase campaigns data."""
    try:
        from analytics_agent.db.queries import get_budget_allocator_options as _get_budget_allocator_options

        return {
            "success": True,
            "data": _get_budget_allocator_options(
                _resolve_authenticated_client_id(request)
            ),
            "timestamp": datetime.utcnow().isoformat(),
        }
    except Exception as e:
        logger.exception("Failed to fetch budget allocator options", error=str(e))
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch budget allocator options: {str(e)}",
        )


@app.post("/agents/orchestrate")
async def orchestrate_agents(request: AgentOrchestrationRequest, http_request: Request):
    """
    Orchestrate multiple agents for analysis.

    Args:
        request: AgentOrchestrationRequest with intent, agents, and payload

    Returns:
        Aggregated results from all agents
    """
    if not marko_brain:
        raise HTTPException(
            status_code=503,
            detail="Agent services not initialized",
        )

    try:
        client_id = _resolve_authenticated_client_id(http_request)
        result = marko_brain.agent_manager.orchestrate(
            intent=request.intent,
            agents_to_run=request.agents,
            payload={**request.payload, "client_id": client_id},
        )

        try:
            _persist_client_results(
                client_id=client_id,
                thread_id=request.thread_id,
                intent=request.intent,
                result_payload=result,
            )
        except Exception as persist_error:
            logger.warning(
                "Could not persist orchestrated agent results",
                client_id=client_id,
                error=str(persist_error),
            )

        return {
            "success": True,
            "data": result,
            "timestamp": datetime.utcnow().isoformat(),
        }
    except Exception as e:
        logger.exception("Agent orchestration failed", error=str(e))
        raise HTTPException(
            status_code=500,
            detail=f"Agent orchestration failed: {str(e)}",
        )


@app.post("/agents/report/generate")
@app.post("/api/agents/report/generate")
async def generate_agent_report(request: ReportGenerationRequest, http_request: Request):
    """Generate a downloadable report for selected agents using Gemini when available."""
    if not marko_brain:
        raise HTTPException(status_code=503, detail="Agent services not initialized")

    selected_agents = _normalize_report_agents(request.agents)
    if not selected_agents:
        raise HTTPException(status_code=400, detail="Select at least one agent for report generation")

    try:
        client_id = _resolve_authenticated_client_id(http_request)
        orchestrated = marko_brain.agent_manager.orchestrate(
            intent="report",
            agents_to_run=selected_agents,
            payload={**request.payload, "client_id": client_id},
        )

        _persist_client_results(
            client_id=client_id,
            thread_id=request.thread_id,
            intent="report",
            result_payload=orchestrated,
        )

        report_text = ""
        if analytics_runner and getattr(analytics_runner, "gemini", None):
            prompt = _build_report_prompt(
                report_type=request.report_type,
                selected_agents=selected_agents,
                orchestration_result=orchestrated,
            )
            report_text = analytics_runner.gemini.generate(prompt)

        if not report_text.strip():
            report_text = _build_fallback_report_text(
                report_type=request.report_type,
                selected_agents=selected_agents,
                orchestration_result=orchestrated,
            )

        timestamp_tag = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        file_stem = f"{request.report_type}_analytics_report_{timestamp_tag}"

        if request.export_format == "pdf":
            file_bytes = _build_minimal_pdf_bytes(report_text)
            file_name = f"{file_stem}.pdf"
            mime_type = "application/pdf"
        else:
            file_bytes = _build_doc_bytes(f"{request.report_type.title()} Analytics Report", report_text)
            file_name = f"{file_stem}.doc"
            mime_type = "application/msword"

        return {
            "success": True,
            "data": {
                "filename": file_name,
                "mime_type": mime_type,
                "content_base64": base64.b64encode(file_bytes).decode("ascii"),
                "report_text": report_text,
                "report_type": request.report_type,
                "export_format": request.export_format,
                "agents_executed": selected_agents,
                "orchestration_result": orchestrated,
            },
            "timestamp": datetime.utcnow().isoformat(),
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to generate report", error=str(e))
        raise HTTPException(status_code=500, detail=f"Failed to generate report: {str(e)}")


@app.get("/agents/status")
async def get_agent_status():
    """Get status of all agents"""
    if not marko_brain:
        raise HTTPException(
            status_code=503,
            detail="Agent services not initialized",
        )

    try:
        status = marko_brain.agent_manager.get_agent_status()
        return {
            "success": True,
            "agents": status,
            "timestamp": datetime.utcnow().isoformat(),
        }
    except Exception as e:
        logger.exception("Failed to get agent status", error=str(e))
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get agent status: {str(e)}",
        )


@app.get("/analytics/company/{company_id}/strategic-summary", response_model=StrategicAnalyticsPayload)
@app.get("/api/analytics/company/{company_id}/strategic-summary", response_model=StrategicAnalyticsPayload)
async def get_company_strategic_summary(
        company_id: str,
        request: Request,
        date_from: Optional[str] = Query(None, description="Optional inclusive ISO start date, e.g. 2026-01-01"),
        date_to: Optional[str] = Query(None, description="Optional inclusive ISO end date, e.g. 2026-05-12"),
        granularity: Literal["daily", "weekly", "monthly", "quarterly"] = Query("daily"),
        currency: Optional[str] = Query(None, description="Optional ISO currency override for response metadata"),
        timezone: str = Query("UTC", description="IANA timezone label to echo in response metadata"),
        attribution_model: str = Query("first_touch", description="Attribution model label to echo in response metadata"),
):
    """Return a strict strategic analytics summary payload for external agents."""
    try:
        resolved_company_id = _resolve_company_access(request, company_id)
        return build_strategic_summary_payload(
            company_id=resolved_company_id,
            date_from=date_from,
            date_to=date_to,
            granularity=granularity,
            currency=currency,
            timezone_name=timezone,
            attribution_model=attribution_model,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(
            "Failed to build strategic analytics summary",
            company_id=company_id,
            error=str(e),
        )
        raise HTTPException(
            status_code=500,
            detail=f"Failed to build strategic analytics summary: {str(e)}",
        )


@app.get("/agents/analytics/recommendations", response_model=StandardizedRecommendationsResponse)
@app.get("/api/agents/analytics/recommendations", response_model=StandardizedRecommendationsResponse)
async def get_standardized_recommendations(
        request: Request,
        thread_id: Optional[str] = Query(None, description="Optional chat thread identifier"),
):
    """Return standardized recommendation payload for external agent integration."""
    resolved_client_id = _resolve_authenticated_client_id(request)
    recommendations: list[str] = []

    try:
        latest_snapshot = get_client_latest_snapshot(resolved_client_id)
        recommendations_raw = latest_snapshot.get("recommendations") if isinstance(latest_snapshot, dict) else []
        recommendations = [
            str(item) for item in recommendations_raw
        ] if isinstance(recommendations_raw, list) else []
    except Exception as fetch_error:
        logger.warning(
            "Failed to fetch client snapshot for standardized recommendations",
            client_id=resolved_client_id,
            error=str(fetch_error),
        )

    return _build_standardized_recommendations_payload(
        recommendations=recommendations,
        client_id=resolved_client_id,
        thread_id=thread_id,
    )


@app.get("/agents/results")
async def get_agent_results(request: Request, agent_id: Optional[str] = None):
    """
    Get stored agent results.

    Args:
        agent_id: Optional specific agent ID

    Returns:
        Agent results for discussion/review
    """
    if not marko_brain:
        raise HTTPException(
            status_code=503,
            detail="Agent services not initialized",
        )

    try:
        resolved_client_id = _resolve_authenticated_client_id(request)
        recommendations: list[str] = []
        executive_summary: Optional[str] = None

        try:
            results = get_client_agent_results(resolved_client_id, agent_id)
            latest_snapshot = get_client_latest_snapshot(resolved_client_id)
            recommendations_raw = latest_snapshot.get("recommendations") if isinstance(latest_snapshot,
                                                                                       dict) else []
            recommendations = [str(item) for item in recommendations_raw] if isinstance(recommendations_raw,
                                                                                        list) else []
            executive_summary_raw = latest_snapshot.get("executive_summary") if isinstance(latest_snapshot,
                                                                                           dict) else None
            executive_summary = executive_summary_raw if isinstance(executive_summary_raw, str) else None
        except Exception as fetch_error:
            logger.warning(
                "Failed to fetch client-specific results from Supabase, using in-memory fallback",
                client_id=resolved_client_id,
                error=str(fetch_error),
            )
            results = marko_brain.agent_manager.get_agent_results(agent_id)

        return {
            "success": True,
            "agent_id": agent_id,
            "client_id": resolved_client_id or None,
            "results": results,
            "recommendations": recommendations,
            "executive_summary": executive_summary,
            "timestamp": datetime.utcnow().isoformat(),
        }
    except Exception as e:
        logger.exception("Failed to get agent results", error=str(e))
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get agent results: {str(e)}",
        )


@app.get("/agents/history")
async def get_execution_history(limit: int = 10):
    """Get execution history of agents"""
    if not marko_brain:
        raise HTTPException(
            status_code=503,
            detail="Agent services not initialized",
        )

    try:
        history = marko_brain.agent_manager.get_execution_history(limit)
        return {
            "success": True,
            "history": history,
            "count": len(history),
            "timestamp": datetime.utcnow().isoformat(),
        }
    except Exception as e:
        logger.exception("Failed to get agent status", error=str(e))
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get agent status: {str(e)}",
        )


@app.post("/agents/forecast/train")
@app.post("/api/agents/forecast/train")
async def train_forecast_model():
    """
    Train the forecast agent ML model.

    Returns:
        Training results with metrics
    """
    if not marko_brain:
        raise HTTPException(
            status_code=503,
            detail="Agent services not initialized",
        )

    try:
        logger.info("Training forecast model")
        result = marko_brain.agent_manager.train_forecast_agent()

        return {
            "success": True,
            "data": result,
            "message": "Forecast model trained successfully",
            "timestamp": datetime.utcnow().isoformat(),
        }
    except Exception as e:
        logger.exception("Forecast model training failed", error=str(e))
        raise HTTPException(
            status_code=500,
            detail=f"Forecast model training failed: {str(e)}",
        )


@app.post("/agents/forecast/predict")
@app.post("/api/agents/forecast/predict")
async def predict_forecast(payload: dict, request: Request):
    """
    Make a forecast prediction using the trained model.

    Args:
        payload: Campaign parameters for prediction

    Returns:
        Forecast predictions and insights
    """
    if not marko_brain:
        raise HTTPException(
            status_code=503,
            detail="Agent services not initialized",
        )

    try:
        resolved_client_id = _resolve_authenticated_client_id(request)
        request_payload = {**payload, "client_id": resolved_client_id}
        logger.info(
            "Making forecast prediction",
            client_id=resolved_client_id,
            payload_keys=sorted(str(key) for key in request_payload.keys()),
        )

        result = marko_brain.agent_manager.orchestrate(
            intent="forecast",
            agents_to_run=["forecast"],
            payload=request_payload,
        )

        return {
            "success": True,
            "data": result,
            "timestamp": datetime.utcnow().isoformat(),
        }
    except Exception as e:
        logger.exception("Forecast prediction failed", error=str(e))
        raise HTTPException(
            status_code=500,
            detail=f"Forecast prediction failed: {str(e)}",
        )


@app.post("/agents/budget/allocate")
@app.post("/api/agents/budget/allocate")
async def run_budget_allocator(payload: dict, request: Request):
    """Run budget allocator agent with constraints and risk profile."""
    if not marko_brain:
        raise HTTPException(
            status_code=503,
            detail="Agent services not initialized",
        )

    try:
        resolved_client_id = _resolve_authenticated_client_id(request)
        request_payload = {**payload, "client_id": resolved_client_id}
        logger.info(
            "Running budget allocator",
            client_id=resolved_client_id,
            payload_keys=sorted(str(key) for key in request_payload.keys()),
        )
        result = marko_brain.agent_manager.orchestrate(
            intent="budget_allocation",
            agents_to_run=["budget_allocator"],
            payload=request_payload,
        )

        return {
            "success": True,
            "data": result,
            "timestamp": datetime.utcnow().isoformat(),
        }
    except Exception as e:
        logger.exception("Budget allocator execution failed", error=str(e))
        raise HTTPException(
            status_code=500,
            detail=f"Budget allocator execution failed: {str(e)}",
        )


@app.get("/api")
async def api_root():
    return {
        "name": "Analytics & Forecasting Agent API",
        "version": settings.APP_VERSION,
        "status": "running",
        "docs": "/docs",
        "endpoints": {
            "health": "GET /api/health",
            "chat": "POST /api/chat",
            "orchestrate": "POST /api/orchestrate",
            "analyze": "POST /api/analyze",
            "budget_sensitivity": "POST /api/budget-sensitivity",
            "break_even": "POST /api/break-even",
            "ltv_projection": "POST /api/ltv-projection",
            "cfo_mode": "POST /api/cfo-mode",
            "capabilities": "GET /api/capabilities",
            "available_datasets": "GET /api/available-datasets",
            "agents_data_mapping": "GET /api/agents-data-mapping",
            "agent_management": {
                "orchestrate_agents": "POST /agents/orchestrate",
                "agent_status": "GET /agents/status",
                "agent_results": "GET /agents/results",
                "strategic_summary": "GET /api/analytics/company/{company_id}/strategic-summary",
                "standardized_recommendations": "GET /agents/analytics/recommendations",
                "execution_history": "GET /agents/history",
                "forecast_options": "GET /agents/forecast/options",
                "attribution_options": "GET /agents/attribution/options",
                "scenario_options": "GET /agents/scenario/options",
                "budget_options": "GET /agents/budget/options",
                "data_query": "POST /agents/data-query",
                "forecast_train": "POST /agents/forecast/train",
                "forecast_predict": "POST /agents/forecast/predict",
                "budget_allocate": "POST /agents/budget/allocate",
            },
        },
    }


# -----------------------------------------------------------------------------
# Run Locally
# -----------------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "analytics_agent.api.app:app",
        host=settings.API_HOST,
        port=settings.API_PORT,
        reload=settings.DEBUG,
        workers=settings.API_WORKERS,
    )

