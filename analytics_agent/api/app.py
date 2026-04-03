from contextlib import asynccontextmanager
from datetime import datetime
from typing import Optional
import uuid
from pathlib import Path

from fastapi import BackgroundTasks, FastAPI, HTTPException, UploadFile, File as FastAPIFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_serializer
from sqlalchemy.orm import Session

from analytics_agent.analytics_runner import AnalyticsRunner
from analytics_agent.config import settings
from analytics_agent.logging_config import get_logger
from analytics_agent.api.orchestrator import AnalyticsSupervisor
from analytics_agent.db.repo import get_session, init_db
from analytics_agent.db.models import File, Agent
from analytics_agent.api.file_handler import FileHandler
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
    selected_datasets: list[str] = []


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


class FileResponse(BaseModel):
    id: int
    file_name: str
    file_type: str
    file_size: int
    storage_path: str
    created_at: datetime

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

        # Ensure local metadata tables (agents/files/etc.) exist before serving requests.
        init_db()

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
        if not response or not response.strip():
            response = (
                "I am online and ready. I can help with forecasting, scenario planning, "
                "funnel analysis, attribution, cohorts, and budget optimization."
            )

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
        # Log the selected datasets for context
        if payload.selected_datasets:
            logger.info(
                "Orchestrating with selected datasets",
                datasets=payload.selected_datasets,
                message=payload.message,
            )
        
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
# File Management Endpoints
# -----------------------------------------------------------------------------
@app.post("/api/agents/{agent_id}/files", response_model=FileUploadResponse)
async def upload_agent_file(agent_id: int, file: UploadFile = FastAPIFile(...)):
    """Upload a file for an agent and store it in the database."""
    try:
        # Validate file
        FileHandler.validate_file(file)
        
        # Save file to disk
        file_metadata = await FileHandler.save_file(file, agent_id)
        
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
            )
            
            return {
                "success": True,
                "file": FileResponse.from_orm(db_file),
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


@app.get("/api/available-datasets", response_model=AvailableDatasetsResponse)
async def get_available_datasets():
    """
    Fetch all available datasets from Supabase.
    Returns metadata about each dataset including name, description, and which agents can use it.
    """
    try:
        from analytics_agent.db.queries import (
            get_campaign_dataframe,
            get_events_dataframe,
            get_customers_dataframe,
            get_retention_dataframe,
            get_transactions_dataframe,
        )
        
        datasets = []
        
        # Campaign Data
        try:
            df = get_campaign_dataframe(limit=1)
            campaign_dataset = AvailableDataset(
                name="campaigns",
                description="Campaign performance data including spend, impressions, clicks, conversions, and revenue",
                agent_types=["forecast", "scenario", "funnel", "roi_forecaster"],
                row_count=len(get_campaign_dataframe()),
                columns=df.columns.tolist() if not df.empty else []
            )
            datasets.append(campaign_dataset)
        except Exception as e:
            logger.warning(f"Could not fetch campaign data: {e}")
        
        # Events Data
        try:
            df = get_events_dataframe(limit=1)
            events_dataset = AvailableDataset(
                name="events",
                description="Customer event data including page views, clicks, and interactions",
                agent_types=["funnel", "attribution", "cohort"],
                row_count=len(get_events_dataframe()),
                columns=df.columns.tolist() if not df.empty else []
            )
            datasets.append(events_dataset)
        except Exception as e:
            logger.warning(f"Could not fetch events data: {e}")
        
        # Customers Data
        try:
            df = get_customers_dataframe(limit=1)
            customers_dataset = AvailableDataset(
                name="customers",
                description="Customer demographic and profile information",
                agent_types=["cohort", "attribution"],
                row_count=len(get_customers_dataframe()),
                columns=df.columns.tolist() if not df.empty else []
            )
            datasets.append(customers_dataset)
        except Exception as e:
            logger.warning(f"Could not fetch customers data: {e}")
        
        # Retention Data
        try:
            df = get_retention_dataframe(limit=1)
            retention_dataset = AvailableDataset(
                name="retention",
                description="Customer retention and churn probability data",
                agent_types=["cohort", "kpi_validator"],
                row_count=len(get_retention_dataframe()),
                columns=df.columns.tolist() if not df.empty else []
            )
            datasets.append(retention_dataset)
        except Exception as e:
            logger.warning(f"Could not fetch retention data: {e}")
        
        # Transactions Data
        try:
            df = get_transactions_dataframe(limit=1)
            transactions_dataset = AvailableDataset(
                name="transactions",
                description="Transaction and purchase data including customer ID, amount, and date",
                agent_types=["attribution", "cohort", "revenue_attribution"],
                row_count=len(get_transactions_dataframe()),
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


class TrainForecastRequest(BaseModel):
    """Request to train forecast model"""
    pass


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
        result = marko_brain.agent_manager.orchestrate(
            intent=request.intent,
            agents_to_run=request.agents,
            payload=request.payload,
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
async def get_agent_results(agent_id: Optional[str] = None):
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
        results = marko_brain.agent_manager.get_agent_results(agent_id)
        return {
            "success": True,
            "agent_id": agent_id,
            "results": results,
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
        logger.info("Making forecast prediction", payload=payload)
        
        result = marko_brain.agent_manager.orchestrate(
            intent="forecast",
            agents_to_run=["forecast"],
            payload=payload,
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
                "forecast_train": "POST /agents/forecast/train",
                "forecast_predict": "POST /agents/forecast/predict",
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

