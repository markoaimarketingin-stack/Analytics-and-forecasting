from __future__ import annotations
from pydantic import BaseModel, Field
from datetime import datetime
from typing import Dict, List, Any, Optional, Literal

from analytics_agent.state import ForecastResults, FunnelModel, AttributionModel, Suggestion, ScenarioRow, BudgetSensitivityResult, BreakEvenResult, LTVProjection


# --- API Input Models ---
class AnalyticsPayloadRequest(BaseModel):
    """
    Represents the input payload for running an analytics analysis.
    Mirrors the AnalyticsState input fields.
    """
    primary_kpi: str = Field(..., description="The main metric to optimize (e.g., revenue, ROAS)")
    channel_performance: Dict[str, Dict[str, float]] = Field(default_factory=dict, description="Spend, conversions, and revenue by channel")
    historical_data: List[Dict[str, Any]] = Field(default_factory=list, description="Historical performance data for cohort analysis")
    conversion_rates: Dict[str, float] = Field(default_factory=dict, description="CTR, LPV rate, ATC rate, CVR, etc.")
    revenue_data: Dict[str, Any] = Field(default_factory=dict, description="AOV (Average Order Value), LTV")
    cost_structure: Dict[str, Any] = Field(default_factory=dict, description="Variable COGS rate")
    structured_context: Dict[str, Any] = Field(default_factory=dict, description="Forecast horizon, growth rate, seasonality, market conditions")


# --- API Output Models ---
class HealthCheckResponse(BaseModel):
    """
    Response model for the health check endpoint.
    """
    status: str
    timestamp: str
    version: str
    analytics_ready: bool


class ErrorResponse(BaseModel):
    """
    Standard error response model.
    """
    success: bool = False
    message: str
    detail: Optional[str] = None
    timestamp: str = Field(default_factory=lambda: datetime.utcnow().isoformat())


class AnalyticsResponse(BaseModel):
    """
    Comprehensive response model for the full analytics analysis.
    Mirrors the structure returned by AnalyticsRunner.run().
    """
    success: bool = True
    run_id: str
    timestamp: str
    data: Dict[str, Any] = Field(..., description="The full analytics results, including metrics, forecasts, scenarios, etc.")


class CapabilitiesResponse(BaseModel):
    """
    Response model for the /api/capabilities endpoint.
    """
    success: bool = True
    capabilities: List[str] = Field(default_factory=list, description="List of available analytics capabilities")


class BudgetSensitivityResponse(BaseModel):
    """
    Response model for budget sensitivity analysis.
    """
    success: bool = True
    timestamp: str
    data: List[BudgetSensitivityResult] = Field(default_factory=list)


class BreakEvenResponse(BaseModel):
    """
    Response model for break-even analysis.
    """
    success: bool = True
    timestamp: str
    data: BreakEvenResult


class LTVProjectionResponse(BaseModel):
    """
    Response model for LTV projection.
    """
    success: bool = True
    timestamp: str
    data: LTVProjection


class CFOReportResponse(BaseModel):
    """
    Response model for CFO mode executive summary.
    """
    success: bool = True
    timestamp: str
    data: Dict[str, str] = Field(..., description="Executive summary and board explanation")


# --- Standardized recommendation schema (Agent Integration Guide V1) ---
class StandardizedRecommendationReasoning(BaseModel):
    triggered_by: str
    metric_name: Literal["CTR", "CPA", "ROAS", "CVR"]
    metric_change: str
    supporting_data: str


class StandardizedRecommendationContext(BaseModel):
    ctr: float = 0.0
    cpa: float = 0.0
    roas: float = 0.0
    cvr: float = 0.0
    trend: Literal["increasing", "decreasing", "stable"] = "stable"


class StandardizedRecommendation(BaseModel):
    source_recommendation_key: str
    recommendation_type: Literal["audience", "budget", "creative", "timing", "seo", "funnel", "other"]
    platform: Literal["meta", "google", "tiktok", "unknown"]
    action: str
    reasoning: StandardizedRecommendationReasoning
    confidence: float
    priority: Literal["high", "medium", "low"]
    context: StandardizedRecommendationContext
    version: int = 1
    agent_specific: Dict[str, Any] = Field(default_factory=dict)


class StandardizedRecommendationsResponse(BaseModel):
    agent_name: str
    recommendations: List[StandardizedRecommendation] = Field(default_factory=list)
