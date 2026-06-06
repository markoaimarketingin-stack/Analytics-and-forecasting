from __future__ import annotations
from pydantic import BaseModel, ConfigDict, Field
from datetime import datetime
from typing import Dict, List, Any, Optional, Literal

from analytics_agent.state import ForecastResults, FunnelModel, AttributionModel, Suggestion, ScenarioRow, BudgetSensitivityResult, BreakEvenResult, LTVProjection


class StrictBaseModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


# --- API Input Models ---
class AnalyticsPayloadRequest(StrictBaseModel):
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
class HealthCheckResponse(StrictBaseModel):
    status: str
    service: str
    timestamp: str
    version: str
    analytics_ready: bool

class ErrorResponse(StrictBaseModel):
    """
    Standard error response model.
    """
    success: bool = False
    message: str
    detail: Optional[str] = None
    timestamp: str = Field(default_factory=lambda: datetime.utcnow().isoformat())


class AnalyticsResponse(StrictBaseModel):
    """
    Comprehensive response model for the full analytics analysis.
    Mirrors the structure returned by AnalyticsRunner.run().
    """
    success: bool = True
    run_id: str
    timestamp: str
    data: Dict[str, Any] = Field(..., description="The full analytics results, including metrics, forecasts, scenarios, etc.")


class CapabilitiesResponse(StrictBaseModel):
    """
    Response model for the /api/capabilities endpoint.
    """
    success: bool = True
    capabilities: List[str] = Field(default_factory=list, description="List of available analytics capabilities")


class BudgetSensitivityResponse(StrictBaseModel):
    """
    Response model for budget sensitivity analysis.
    """
    success: bool = True
    timestamp: str
    data: List[BudgetSensitivityResult] = Field(default_factory=list)


class BreakEvenResponse(StrictBaseModel):
    """
    Response model for break-even analysis.
    """
    success: bool = True
    timestamp: str
    data: BreakEvenResult


class LTVProjectionResponse(StrictBaseModel):
    """
    Response model for LTV projection.
    """
    success: bool = True
    timestamp: str
    data: LTVProjection


class CFOReportResponse(StrictBaseModel):
    """
    Response model for CFO mode executive summary.
    """
    success: bool = True
    timestamp: str
    data: Dict[str, str] = Field(..., description="Executive summary and board explanation")


# --- Standardized recommendation schema (Agent Integration Guide V1) ---
class StandardizedRecommendationReasoning(StrictBaseModel):
    triggered_by: str
    metric_name: Literal["CTR", "CPA", "ROAS", "CVR"]
    metric_change: str
    supporting_data: str


class StandardizedRecommendationContext(StrictBaseModel):
    ctr: float = 0.0
    cpa: float = 0.0
    roas: float = 0.0
    cvr: float = 0.0
    trend: Literal["increasing", "decreasing", "stable"] = "stable"


class StandardizedRecommendation(StrictBaseModel):
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


class StandardizedRecommendationsResponse(StrictBaseModel):
    agent_name: str
    recommendations: List[StandardizedRecommendation] = Field(default_factory=list)


class StrategicAnalyticsDateRange(StrictBaseModel):
    from_: str = Field(serialization_alias="from")
    to: str


class StrategicAnalyticsDataQuality(StrictBaseModel):
    score: float
    notes: List[str] = Field(default_factory=list)


class StrategicAnalyticsMetadata(StrictBaseModel):
    company_id: str
    date_range: StrategicAnalyticsDateRange
    granularity: Literal["daily", "weekly", "monthly", "quarterly"]
    currency: str
    timezone: str
    attribution_model: str
    source_systems: List[str] = Field(default_factory=list)
    last_updated_at: str
    data_quality: StrategicAnalyticsDataQuality


class StrategicTrafficByChannelRow(StrictBaseModel):
    channel: str
    period_start: str
    period_end: str
    impressions: float = 0.0
    clicks: float = 0.0
    sessions: float = 0.0
    visitors: float = 0.0
    leads: float = 0.0
    mqls: float = 0.0
    sqls: float = 0.0
    opportunities: float = 0.0
    customers: float = 0.0
    ctr: float = 0.0
    cpc: float = 0.0
    cpm: float = 0.0
    visit_to_lead_rate: float = 0.0
    lead_to_mql_rate: float = 0.0
    mql_to_sql_rate: float = 0.0
    sql_to_opportunity_rate: float = 0.0
    opportunity_to_customer_rate: float = 0.0


class StrategicConversionRateByFunnelStageRow(StrictBaseModel):
    segment: str
    channel: str
    stage_name: str
    period_start: str
    period_end: str
    entered_stage: int
    moved_to_next_stage: int
    conversion_rate: float
    drop_off_rate: float
    median_days_to_convert: Optional[float] = None


class StrategicPipelineByChannelRow(StrictBaseModel):
    channel: str
    pipeline_created: float
    qualified_pipeline: float
    opportunity_count: int
    win_rate: float


class StrategicPipelineBySegmentRow(StrictBaseModel):
    segment: str
    pipeline_created: float
    qualified_pipeline: float
    opportunity_count: int
    win_rate: float


class StrategicPipelineByGeoRow(StrictBaseModel):
    geo: str
    pipeline_created: float
    qualified_pipeline: float
    opportunity_count: int
    win_rate: float


class StrategicLostReasonRow(StrictBaseModel):
    reason: str
    count: int


class StrategicPipelineVolumeAndWinRate(StrictBaseModel):
    period_start: str
    period_end: str
    pipeline_created: float
    qualified_pipeline: float
    opportunity_count: int
    won_deals: int
    average_deal_size: float
    win_rate: float
    sales_cycle_days: Optional[float] = None
    pipeline_by_channel: List[StrategicPipelineByChannelRow] = Field(default_factory=list)
    pipeline_by_segment: List[StrategicPipelineBySegmentRow] = Field(default_factory=list)
    pipeline_by_geo: List[StrategicPipelineByGeoRow] = Field(default_factory=list)
    lost_reason_breakdown: List[StrategicLostReasonRow] = Field(default_factory=list)


class StrategicLtvBySegmentRow(StrictBaseModel):
    segment: str
    ltv: Optional[float] = None


class StrategicRevenueAndRetentionCohortRow(StrictBaseModel):
    cohort_month: str
    customers_start: int
    customers_retained_30d: int
    customers_retained_60d: int
    customers_retained_90d: int
    gross_revenue_retention: Optional[float] = None
    net_revenue_retention: Optional[float] = None
    expansion_revenue: Optional[float] = None
    contraction_revenue: Optional[float] = None
    churned_revenue: Optional[float] = None
    repeat_purchase_rate: Optional[float] = None
    ltv: Optional[float] = None
    ltv_by_segment: List[StrategicLtvBySegmentRow] = Field(default_factory=list)


class StrategicCampaignSpendAndCacRow(StrictBaseModel):
    channel: str
    campaign_name: str
    period_start: str
    period_end: str
    spend: float
    attributed_leads: Optional[float] = None
    attributed_mqls: Optional[float] = None
    attributed_sqls: Optional[float] = None
    attributed_opportunities: Optional[float] = None
    attributed_customers: Optional[float] = None
    cost_per_lead: Optional[float] = None
    cost_per_mql: Optional[float] = None
    cost_per_sql: Optional[float] = None
    cost_per_opportunity: Optional[float] = None
    cac: Optional[float] = None
    roas: Optional[float] = None
    payback_period_months: Optional[float] = None


class StrategicPricingPlanMixRow(StrictBaseModel):
    plan_name: str
    period_start: str
    period_end: str
    new_customers: int
    active_customers: int
    plan_revenue: float
    arpu: Optional[float] = None
    trial_to_paid_rate: Optional[float] = None
    upgrade_rate: Optional[float] = None
    downgrade_rate: Optional[float] = None
    churn_rate: Optional[float] = None
    discount_rate: Optional[float] = None
    plan_share_percent: Optional[float] = None


class StrategicKeyEventCompletionRateRow(StrictBaseModel):
    event: str
    completion_rate: float


class StrategicActiveRates(StrictBaseModel):
    day_1: float = 0.0
    day_7: float = 0.0
    day_30: float = 0.0


class StrategicFeatureAdoptionRow(StrictBaseModel):
    feature: str
    adoption_rate: float


class StrategicExpansionTriggerEventRow(StrictBaseModel):
    event: str
    accounts: int


class StrategicProductUsageAndActivationSignals(StrictBaseModel):
    period_start: str
    period_end: str
    signup_count: int
    activated_users: int
    activation_rate: float
    median_time_to_first_value_hours: Optional[float] = None
    key_event_completion_rates: List[StrategicKeyEventCompletionRateRow] = Field(default_factory=list)
    active_rates: StrategicActiveRates
    feature_adoption_by_feature: List[StrategicFeatureAdoptionRow] = Field(default_factory=list)
    seat_utilization: Optional[float] = None
    usage_frequency_per_week: Optional[float] = None
    power_user_rate: Optional[float] = None
    inactive_user_rate: Optional[float] = None
    expansion_trigger_events: List[StrategicExpansionTriggerEventRow] = Field(default_factory=list)


class StrategicAnalyticsPayload(StrictBaseModel):
    analytics_metadata: StrategicAnalyticsMetadata | Dict[str, Any] = Field(default_factory=dict)
    traffic_by_channel: List[StrategicTrafficByChannelRow] = Field(default_factory=list)
    conversion_rates_by_funnel_stage: List[StrategicConversionRateByFunnelStageRow] = Field(default_factory=list)
    pipeline_volume_and_win_rate: StrategicPipelineVolumeAndWinRate | Dict[str, Any] = Field(default_factory=dict)
    revenue_and_retention_cohorts: List[StrategicRevenueAndRetentionCohortRow] = Field(default_factory=list)
    campaign_spend_and_cac: List[StrategicCampaignSpendAndCacRow] = Field(default_factory=list)
    pricing_plan_mix: List[StrategicPricingPlanMixRow] = Field(default_factory=list)
    product_usage_and_activation_signals: StrategicProductUsageAndActivationSignals | Dict[str, Any] = Field(default_factory=dict)

