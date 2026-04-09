from __future__ import annotations

from typing import Any, Dict, List, Optional, TypedDict

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

    # New agent-layer inputs
    user_request: Dict[str, Any] = Field(default_factory=dict)
    campaign_data: Optional[List[Dict[str, Any]]] = None
    customer_data: Optional[List[Dict[str, Any]]] = None
    customers_data: Optional[List[Dict[str, Any]]] = None
    events_data: Optional[List[Dict[str, Any]]] = None
    transactions_data: Optional[List[Dict[str, Any]]] = None
    retention_data: Optional[List[Dict[str, Any]]] = None

    # New agent-layer outputs
    attribution_analysis: Optional[AttributionAnalysis] = None
    funnel_analysis: Optional[FunnelAnalysis] = None
    cohort_analysis: Optional[CohortAnalysis] = None
    forecast_analysis: Optional[ForecastAnalysis] = None
    scenario_analysis: Optional[ScenarioAnalysis] = None
    recommendations: List[str] = Field(default_factory=list)
    executive_summary: Optional[str] = None

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


class AttributionAnalysis(BaseModel):
    best_channel: str = ""
    worst_channel: str = ""
    channel_weights: Dict[str, float] = Field(default_factory=dict)
    recommended_shift: Dict[str, Any] = Field(default_factory=dict)
    channel_summary: List[Dict[str, Any]] = Field(default_factory=list)
    model_credit_chart: List[Dict[str, Any]] = Field(default_factory=list)
    touchpoint_position_chart: List[Dict[str, Any]] = Field(default_factory=list)
    budget_scenario_chart: List[Dict[str, Any]] = Field(default_factory=list)
    diagnostics: Dict[str, Any] = Field(default_factory=dict)
    data_source: str = ""


class FunnelAnalysis(BaseModel):
    funnel: Dict[str, int] = Field(default_factory=dict)
    largest_dropoff: str = ""
    dropoff_percent: float = 0.0
    predicted_conversion_uplift_if_fixed: float = 0.0
    stage_dropoffs: Dict[str, float] = Field(default_factory=dict)
    stage_details: List[Dict[str, Any]] = Field(default_factory=list)
    filters_applied: Dict[str, Any] = Field(default_factory=dict)
    data_source: str = ""
    diagnostics: Dict[str, Any] = Field(default_factory=dict)
    primary_funnel_chart: List[Dict[str, Any]] = Field(default_factory=list)
    stage_waterfall_chart: List[Dict[str, Any]] = Field(default_factory=list)
    channel_comparison_chart: List[Dict[str, Any]] = Field(default_factory=list)
    segment_comparison_chart: List[Dict[str, Any]] = Field(default_factory=list)
    stage_time_chart: List[Dict[str, Any]] = Field(default_factory=list)
    revenue_opportunity_chart: List[Dict[str, Any]] = Field(default_factory=list)
    uplift_scenarios_chart: List[Dict[str, Any]] = Field(default_factory=list)


class CohortAnalysis(BaseModel):
    average_ltv: float = 0.0
    three_month_retention: float = 0.0
    churn_risk: float = 0.0
    high_value_segment: str = ""
    high_churn_segment: str = ""
    repeat_purchase_rate: float = 0.0
    segment_breakdown: List[Dict[str, Any]] = Field(default_factory=list)
    retention_curve: List[Dict[str, Any]] = Field(default_factory=list)
    signup_channel_value: List[Dict[str, Any]] = Field(default_factory=list)
    diagnostics: Dict[str, Any] = Field(default_factory=dict)
    data_source: str = ""


class ForecastAnalysis(BaseModel):
    next_30_day_revenue: float = 0.0
    predicted_roi: float = 0.0
    predicted_profit: float = 0.0
    predicted_purchases: float = 0.0
    predicted_clicks: float = 0.0
    predicted_impressions: float = 0.0
    predicted_conversion_rate: float = 0.0
    predicted_ctr: float = 0.0
    confidence: int = 0
    key_drivers: List[str] = Field(default_factory=list)
    assumptions: List[str] = Field(default_factory=list)
    kpi_metric: str = "revenue"
    kpi_projection: float = 0.0
    forecast_points: List[Dict[str, Any]] = Field(default_factory=list)
    channel_forecast: List[Dict[str, Any]] = Field(default_factory=list)
    baseline_metrics: Dict[str, float] = Field(default_factory=dict)
    applied_filters: Dict[str, Any] = Field(default_factory=dict)
    diagnostics: Dict[str, Any] = Field(default_factory=dict)
    data_source: str = ""


class ScenarioAnalysis(BaseModel):
    best_case: Dict[str, float] = Field(default_factory=dict)
    base_case: Dict[str, float] = Field(default_factory=dict)
    worst_case: Dict[str, float] = Field(default_factory=dict)
    kpi_metric: str = "revenue"
    scenario_table: List[Dict[str, Any]] = Field(default_factory=list)
    projection_curve: List[Dict[str, Any]] = Field(default_factory=list)
    sensitivity_curve: List[Dict[str, Any]] = Field(default_factory=list)
    channel_scenario: List[Dict[str, Any]] = Field(default_factory=list)
    baseline_metrics: Dict[str, float] = Field(default_factory=dict)
    assumptions: List[str] = Field(default_factory=list)
    applied_filters: Dict[str, Any] = Field(default_factory=dict)
    diagnostics: Dict[str, Any] = Field(default_factory=dict)
    data_source: str = ""


class UserAnalyticsRequest(BaseModel):
    horizon_days: int = 30
    objective: str = "growth"
    focus_channels: List[str] = Field(default_factory=list)
    notes: str = ""


DEFAULT_STATE_TEMPLATE: Dict[str, Any] = {
    "user_request": {},
    "campaign_data": None,
    "customer_data": None,
    "events_data": None,
    "transactions_data": None,
    "retention_data": None,
    "attribution_analysis": None,
    "funnel_analysis": None,
    "cohort_analysis": None,
    "forecast_analysis": None,
    "scenario_analysis": None,
    "recommendations": [],
    "executive_summary": None,
}


def build_default_state() -> "AnalyticsState":
    return AnalyticsState(**DEFAULT_STATE_TEMPLATE)


