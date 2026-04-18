from contextlib import asynccontextmanager
from datetime import datetime
from io import StringIO
from typing import Any, Literal, Optional
import base64
import json
import os
import re
import uuid
from pathlib import Path

from fastapi import BackgroundTasks, FastAPI, Form, HTTPException, Query, UploadFile, File as FastAPIFile
from fastapi.middleware.cors import CORSMiddleware
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
from pydantic import BaseModel, Field, field_serializer
import pandas as pd
from sqlalchemy.orm import Session

from analytics_agent.analytics_runner import AnalyticsRunner
from analytics_agent.config import settings
from analytics_agent.logging_config import get_logger
from analytics_agent.api.orchestrator import AnalyticsSupervisor
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
)

logger = get_logger(__name__)


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


# -----------------------------------------------------------------------------
# Global services
# -----------------------------------------------------------------------------
analytics_runner: Optional[AnalyticsRunner] = None
marko_brain: Optional[AnalyticsSupervisor] = None
data_query_agent: Optional[DataQueryAgent] = None


# -----------------------------------------------------------------------------
# Application lifespan
# -----------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    global analytics_runner, marko_brain, data_query_agent

    try:
        logger.info("Starting Analytics Agent API")

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

    except Exception as e:
        logger.error(
            "Failed to initialize services",
            error=str(e),
        )
        raise

    yield

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
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# -----------------------------------------------------------------------------
# Health
# -----------------------------------------------------------------------------
@app.get("/api/health", response_model=HealthCheckResponse)
async def health_check():
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "version": settings.APP_VERSION,
        "analytics_ready": analytics_runner is not None,
    }


# -----------------------------------------------------------------------------
# Authentication
# -----------------------------------------------------------------------------
@app.post("/api/auth/google", response_model=GoogleAuthResponse)
async def authenticate_google(payload: GoogleAuthRequest):
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

    return {
        "success": True,
        "client_id": client_id,
        "user": {
            "google_sub": google_sub,
            "email": email,
            "name": name,
            "picture": picture,
            "email_verified": email_verified,
        },
        "timestamp": datetime.utcnow().isoformat(),
    }


# -----------------------------------------------------------------------------
# Simple Gemini Chat
# -----------------------------------------------------------------------------
@app.post("/api/chat", response_model=ChatResponse)
async def chat_with_marko_brain(payload: ChatRequest):
    if not analytics_runner:
        raise HTTPException(status_code=503, detail="Analytics service not ready")

    try:
        client_id = _resolve_client_id(payload.client_id)
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
# Main Orchestrator Endpoint
# -----------------------------------------------------------------------------
@app.post("/api/orchestrate", response_model=OrchestrateResponse)
async def orchestrate_request(payload: ChatRequest):
    if not marko_brain:
        raise HTTPException(status_code=503, detail="Analytics Agent not ready")

    try:
        client_id = _resolve_client_id(payload.client_id)
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
        client_id: str = Query(..., description="Client/session identifier"),
        limit: int = Query(50, ge=1, le=200),
):
    try:
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
        client_id: str = Query(..., description="Client/session identifier"),
):
    try:
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
        client_id: Optional[str] = Query(None, description="Client/session identifier"),
        thread_id: Optional[str] = Query(None, description="Chat thread identifier"),
):
    try:
        resolved_client_id = _resolve_client_id(client_id)
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
            client_id=client_id,
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
async def save_recommendation_outcome(payload: RecommendationLifecycleRecord):
    try:
        record_data = payload.model_dump()
        record_data["client_id"] = _resolve_client_id(record_data.get("client_id"))
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
        file: UploadFile = FastAPIFile(...),
        client_id: Optional[str] = Form(default=None),
        category: Optional[str] = Form(default=None),
        instructions: Optional[str] = Form(default=None),
):
    """Upload a file for an agent and store it in the database."""
    try:
        # Validate file
        FileHandler.validate_file(file)

        # Save file to disk
        file_metadata = await FileHandler.save_file(file, agent_id)
        resolved_client_id = _resolve_client_id(client_id)
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
        client_id: str = Query(..., description="Client/session identifier"),
):
    try:
        resolved_client_id = _resolve_client_id(client_id)
        response = list_training_upload_records(resolved_client_id)
        records = response.data or []

        return {
            "success": True,
            "files": records,
            "timestamp": datetime.utcnow().isoformat(),
        }
    except Exception as e:
        logger.error("Training upload listing failed", error=str(e), client_id=client_id)
        raise HTTPException(status_code=500, detail=f"Failed to load training uploads: {str(e)}")


@app.get("/api/training-uploads/{upload_id}/preview", response_model=TrainingUploadPreviewResponse)
async def preview_training_upload(
        upload_id: int,
        client_id: str = Query(..., description="Client/session identifier"),
):
    try:
        resolved_client_id = _resolve_client_id(client_id)
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
        client_id: str = Query(..., description="Client/session identifier"),
):
    try:
        resolved_client_id = _resolve_client_id(client_id)
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
            FileHandler.delete_file(local_path)

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
async def get_available_datasets(client_id: Optional[str] = Query(default=None)):
    """
    Fetch all available datasets from Supabase.
    Returns metadata about each dataset including name, description, and which agents can use it.
    """
    try:
        from analytics_agent.db.queries import get_dataset_dataframe_with_source

        resolved_client_id = (client_id or "").strip() or None

        datasets = []

        # Campaign Data
        try:
            df, _ = get_dataset_dataframe_with_source("campaigns", limit=1, prefer_remote=not bool(resolved_client_id), client_id=resolved_client_id)
            full_df, _ = get_dataset_dataframe_with_source("campaigns", prefer_remote=not bool(resolved_client_id), client_id=resolved_client_id)
            campaign_dataset = AvailableDataset(
                name="campaigns",
                description="Campaign performance data including spend, impressions, clicks, conversions, and revenue",
                agent_types=["forecast", "scenario", "funnel", "roi_forecaster"],
                row_count=len(full_df),
                columns=df.columns.tolist() if not df.empty else []
            )
            datasets.append(campaign_dataset)
        except Exception as e:
            logger.warning(f"Could not fetch campaign data: {e}")

        # Events Data
        try:
            df, _ = get_dataset_dataframe_with_source("events", limit=1, prefer_remote=not bool(resolved_client_id), client_id=resolved_client_id)
            full_df, _ = get_dataset_dataframe_with_source("events", prefer_remote=not bool(resolved_client_id), client_id=resolved_client_id)
            events_dataset = AvailableDataset(
                name="events",
                description="Customer event data including page views, clicks, and interactions",
                agent_types=["funnel", "attribution", "cohort"],
                row_count=len(full_df),
                columns=df.columns.tolist() if not df.empty else []
            )
            datasets.append(events_dataset)
        except Exception as e:
            logger.warning(f"Could not fetch events data: {e}")

        # Customers Data
        try:
            df, _ = get_dataset_dataframe_with_source("customers", limit=1, prefer_remote=not bool(resolved_client_id), client_id=resolved_client_id)
            full_df, _ = get_dataset_dataframe_with_source("customers", prefer_remote=not bool(resolved_client_id), client_id=resolved_client_id)
            customers_dataset = AvailableDataset(
                name="customers",
                description="Customer demographic and profile information",
                agent_types=["cohort", "attribution"],
                row_count=len(full_df),
                columns=df.columns.tolist() if not df.empty else []
            )
            datasets.append(customers_dataset)
        except Exception as e:
            logger.warning(f"Could not fetch customers data: {e}")

        # Retention Data
        try:
            df, _ = get_dataset_dataframe_with_source("retention", limit=1, prefer_remote=not bool(resolved_client_id), client_id=resolved_client_id)
            full_df, _ = get_dataset_dataframe_with_source("retention", prefer_remote=not bool(resolved_client_id), client_id=resolved_client_id)
            retention_dataset = AvailableDataset(
                name="retention",
                description="Customer retention and churn probability data",
                agent_types=["cohort", "kpi_validator"],
                row_count=len(full_df),
                columns=df.columns.tolist() if not df.empty else []
            )
            datasets.append(retention_dataset)
        except Exception as e:
            logger.warning(f"Could not fetch retention data: {e}")

        # Transactions Data
        try:
            df, _ = get_dataset_dataframe_with_source("transactions", limit=1, prefer_remote=not bool(resolved_client_id), client_id=resolved_client_id)
            full_df, _ = get_dataset_dataframe_with_source("transactions", prefer_remote=not bool(resolved_client_id), client_id=resolved_client_id)
            transactions_dataset = AvailableDataset(
                name="transactions",
                description="Transaction and purchase data including customer ID, amount, and date",
                agent_types=["attribution", "cohort", "revenue_attribution"],
                row_count=len(full_df),
                columns=df.columns.tolist() if not df.empty else []
            )
            datasets.append(transactions_dataset)
        except Exception as e:
            logger.warning(f"Could not fetch transactions data: {e}")

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
async def get_dataset_rows(dataset_name: str, limit: int = 50, client_id: Optional[str] = Query(default=None)):
    dataset = _validate_dataset_name(dataset_name)
    try:
        from analytics_agent.db.queries import get_dataset_dataframe_with_source

        safe_limit = max(1, min(limit, 500))
        resolved_client_id = (client_id or "").strip() or None
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
async def upsert_dataset_rows(dataset_name: str, payload: DatasetRowsUpdateRequest):
    dataset = _validate_dataset_name(dataset_name)
    try:
        from analytics_agent.db.queries import upsert_dataset_rows as _upsert_dataset_rows

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
async def upload_dataset_csv(dataset_name: str, file: UploadFile = FastAPIFile(...)):
    dataset = _validate_dataset_name(dataset_name)

    if not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV uploads are supported for dataset update")

    try:
        from analytics_agent.db.queries import upsert_dataset_rows as _upsert_dataset_rows

        payload = await file.read()
        text = payload.decode("utf-8")
        dataframe = pd.read_csv(StringIO(text))
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
async def run_data_query_agent(request: DataQueryAgentRequest):
    if not data_query_agent:
        raise HTTPException(status_code=503, detail="Data Query agent is not initialized")

    resolved_client_id = (request.client_id or "").strip()
    if not resolved_client_id:
        raise HTTPException(
            status_code=400,
            detail="Client context is required. Please sign in and upload required datasets in Supervisor -> Train Model.",
        )

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
async def get_funnel_options(client_id: Optional[str] = Query(default=None)):
    """Return only funnel filter options that actually exist in current datasets."""
    try:
        from analytics_agent.db.queries import get_funnel_filter_options

        return {
            "success": True,
            "data": get_funnel_filter_options(
                prefer_remote=not bool((client_id or "").strip()),
                client_id=_resolve_client_id(client_id) if client_id else None,
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
async def get_forecast_options(client_id: Optional[str] = Query(default=None)):
    """Return forecast filters from Supabase campaigns data only."""
    try:
        from analytics_agent.db.queries import get_forecast_filter_options

        return {
            "success": True,
            "data": get_forecast_filter_options(
                _resolve_client_id(client_id) if client_id else None
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
async def get_attribution_options(client_id: Optional[str] = Query(default=None)):
    """Return attribution filters and toggles from Supabase campaigns/events/transactions only."""
    try:
        from analytics_agent.db.queries import get_attribution_filter_options

        return {
            "success": True,
            "data": get_attribution_filter_options(
                _resolve_client_id(client_id) if client_id else None
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
async def get_scenario_options(client_id: Optional[str] = Query(default=None)):
    """Return scenario filters from Supabase campaigns data only."""
    try:
        from analytics_agent.db.queries import get_scenario_filter_options

        return {
            "success": True,
            "data": get_scenario_filter_options(
                _resolve_client_id(client_id) if client_id else None
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
async def get_cohort_options(client_id: Optional[str] = Query(default=None)):
    """Return cohort filters and defaults from Supabase customers/retention/transactions."""
    try:
        from analytics_agent.db.queries import get_cohort_filter_options

        return {
            "success": True,
            "data": get_cohort_filter_options(
                _resolve_client_id(client_id) if client_id else None
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
async def get_budget_allocator_options(client_id: Optional[str] = Query(default=None)):
    """Return budget allocator filters and defaults from Supabase campaigns data."""
    try:
        from analytics_agent.db.queries import get_budget_allocator_options as _get_budget_allocator_options

        return {
            "success": True,
            "data": _get_budget_allocator_options(
                _resolve_client_id(client_id) if client_id else None
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
async def orchestrate_agents(request: AgentOrchestrationRequest):
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
        client_id = _resolve_client_id(request.client_id)
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
async def generate_agent_report(request: ReportGenerationRequest):
    """Generate a downloadable report for selected agents using Gemini when available."""
    if not marko_brain:
        raise HTTPException(status_code=503, detail="Agent services not initialized")

    selected_agents = _normalize_report_agents(request.agents)
    if not selected_agents:
        raise HTTPException(status_code=400, detail="Select at least one agent for report generation")

    try:
        client_id = _resolve_client_id(request.client_id)
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


@app.get("/agents/results")
async def get_agent_results(agent_id: Optional[str] = None, client_id: Optional[str] = Query(default=None)):
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
        resolved_client_id = (client_id or "").strip()
        recommendations: list[str] = []
        executive_summary: Optional[str] = None

        if resolved_client_id:
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
        else:
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
        logger.exception("Failed to get execution history", error=str(e))
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get execution history: {str(e)}",
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
async def predict_forecast(payload: dict):
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
        resolved_client_id = _resolve_client_id(payload.get("client_id"))
        request_payload = {**payload, "client_id": resolved_client_id}
        logger.info("Making forecast prediction", payload=request_payload, client_id=resolved_client_id)

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
async def run_budget_allocator(payload: dict):
    """Run budget allocator agent with constraints and risk profile."""
    if not marko_brain:
        raise HTTPException(
            status_code=503,
            detail="Agent services not initialized",
        )

    try:
        resolved_client_id = _resolve_client_id(payload.get("client_id"))
        request_payload = {**payload, "client_id": resolved_client_id}
        logger.info("Running budget allocator", payload=request_payload, client_id=resolved_client_id)
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



