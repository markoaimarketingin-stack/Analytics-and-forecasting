from contextlib import asynccontextmanager
from datetime import datetime
from typing import Optional
import uuid

from fastapi import BackgroundTasks, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from analytics_agent.analytics_runner import AnalyticsRunner
from analytics_agent.config import settings
from analytics_agent.logging_config import get_logger
from orchestrator import AnalyticsSupervisor
from models import (
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


class ChatResponse(BaseModel):
    success: bool = True
    message: str
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
    timestamp: str

# -----------------------------------------------------------------------------
# Global services
# -----------------------------------------------------------------------------
analytics_runner: Optional[AnalyticsRunner] = None
marko_brain: Optional[AnalyticsSupervisor] = None


# -----------------------------------------------------------------------------
# Application lifespan
# -----------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    global analytics_runner, marko_brain

    try:
        logger.info("Starting Analytics Agent API")

        analytics_runner = AnalyticsRunner()

        marko_brain = AnalyticsSupervisor(
            analytics_runner=analytics_runner,
            gemini_client=analytics_runner.gemini,
        )

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
# Simple Gemini Chat
# -----------------------------------------------------------------------------
@app.post("/api/chat", response_model=ChatResponse)
async def chat_with_marko_brain(payload: ChatRequest):
    if not analytics_runner:
        raise HTTPException(status_code=503, detail="Analytics service not ready")

    try:
        prompt = f"""
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

User message:
{payload.message}
"""

        response = analytics_runner.gemini.generate(prompt)

        return {
            "success": True,
            "message": response,
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
        result = marko_brain.orchestrate(payload.message)

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
            "timestamp": datetime.utcnow().isoformat(),
        }

    except Exception as e:
        logger.error("Orchestrator endpoint failed", error=str(e))
        raise HTTPException(
            status_code=500,
            detail=f"Failed to orchestrate request: {str(e)}",
        )


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
# API Root
# -----------------------------------------------------------------------------
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

