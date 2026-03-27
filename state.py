from __future__ import annotations
from typing import Dict, List, Optional, Any, TypedDict
from pydantic import BaseModel, Field


class Suggestion(BaseModel):
    title: str
    description: str
    reasoning: str
    actions: Dict[str, str] = Field(default_factory=lambda: {
        "execute": "",
        "ignore": ""
    })


class ScenarioRow(BaseModel):
    label: str
    spend: float
    revenue: float
    roas: float
    profit: float
    confidence: float


class ForecastResults(BaseModel):
    monthly: List[Dict[str, float]] = Field(default_factory=list)
    totals: Dict[str, float] = Field(default_factory=dict)
    breakeven_month: Optional[int] = None
    assumptions: List[str] = Field(default_factory=list)


class FunnelModel(BaseModel):
    impressions: int = 0
    clicks: int = 0
    lp_views: int = 0
    add_to_cart: int = 0
    purchases: int = 0
    dropoffs: Dict[str, float] = Field(default_factory=dict)


class AttributionModel(BaseModel):
    last_click: Dict[str, float] = Field(default_factory=dict)
    multi_touch: Dict[str, float] = Field(default_factory=dict)
    blended: Dict[str, float] = Field(default_factory=dict)


class AnalyticsState(BaseModel):
    # Inputs/context
    structured_context: Dict[str, Any] = Field(default_factory=dict)
    historical_data: List[Dict[str, Any]] = Field(default_factory=list)
    channel_performance: Dict[str, Dict[str, float]] = Field(default_factory=dict)
    conversion_rates: Dict[str, float] = Field(default_factory=dict)
    revenue_data: Dict[str, Any] = Field(default_factory=dict)
    cost_structure: Dict[str, Any] = Field(default_factory=dict)
    primary_kpi: str = ""

    # Outputs
    forecast_results: ForecastResults = Field(default_factory=ForecastResults)
    scenarios: List[ScenarioRow] = Field(default_factory=list)
    cohort_results: Dict[str, Any] = Field(default_factory=dict)
    funnel_model: FunnelModel = Field(default_factory=FunnelModel)
    attribution_model: AttributionModel = Field(default_factory=AttributionModel)
    assumptions: List[Dict[str, Any]] = Field(default_factory=list)
    confidence_score: float = 0.0
    suggestions_list: List[Suggestion] = Field(default_factory=list)
    conversation_history: List[Dict[str, str]] = Field(default_factory=list)

    # Intermediates
    metrics: Dict[str, float] = Field(default_factory=dict)  # CAC, ROAS, LTV/CAC, margin, etc.
    warnings: List[str] = Field(default_factory=list)


# Utility types
class BudgetSensitivityResult(TypedDict):
    budget: float
    roas: float
    revenue: float
    profit: float


class BreakEvenResult(TypedDict):
    min_roas: float
    min_cvr: float
    notes: str


class LTVProjection(BaseModel):
    monthly_revenue: List[float] = Field(default_factory=list)
    total_ltv: float = 0.0
    assumptions: List[str] = Field(default_factory=list)
