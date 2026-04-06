// ... existing types

export interface File {
  id: number;
  file_name: string;
  file_type: string;
  file_size: number;
  storage_path: string;
  created_at: string; // Assuming ISO date string from backend
}
// Analytics specific types
export interface AnalyticsPayload {
  primary_kpi: string;
  channel_performance: Record<string, ChannelData>;
  conversion_rates: Record<string, number>;
  revenue_data: Record<string, number>;
  cost_structure: Record<string, number>;
  structured_context: Record<string, any>;
  historical_data?: Record<string, any>[];
}

export interface ChannelData {
  spend: number;
  conversions: number;
  revenue: number;
}

export interface AnalyticsResult {
  capabilities: string[];
  primary_kpi: string;
  metrics: Record<string, number>;
  forecast_results: ForecastResults;
  scenarios: ScenarioRow[];
  cohort_results: Record<string, any>;
  funnel_model: FunnelModel;
  attribution_model: AttributionModel;
  confidence_score: number;
  suggestions: Suggestion[];
  warnings: string[];
  reasoning_summary: string;
}

export interface ForecastResults {
  monthly: Array<{
    month: number;
    spend: number;
    revenue: number;
    roas: number;
    profit: number;
    cum_profit: number;
  }>;
  totals: {
    spend: number;
    revenue: number;
    profit: number;
  };
  breakeven_month?: number;
}

export interface ScenarioRow {
  label: string;
  spend: number;
  revenue: number;
  roas: number;
  profit: number;
  confidence: number;
}

export interface FunnelModel {
  impressions: number;
  clicks: number;
  lp_views: number;
  add_to_cart: number;
  purchases: number;
  dropoffs: Record<string, number>;
}

export interface AttributionModel {
  last_click: Record<string, number>;
  multi_touch: Record<string, number>;
  blended: Record<string, number>;
}

export interface Suggestion {
  title: string;
  description: string;
  reasoning: string;
  actions: Record<string, string>;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export interface AnalysisRun {
  id: string;
  timestamp: Date;
  status: 'running' | 'completed' | 'error';
  payload: AnalyticsPayload;
  result?: AnalyticsResult;
  error?: string;
}

export interface ForecastRequestPayload {
  channel: string;
  campaign_type: string;
  spend: number;
  impressions: number;
  ctr: number;
  conversion_rate: number;
  horizon_days: number;
}

export interface ForecastDailyPoint {
  day: number;
  forecast_spend: number;
  forecast_roi: number;
  forecast_revenue: number;
  forecast_profit: number;
}

export interface ForecastDriver {
  feature: string;
  importance: number;
}

export interface RetentionAdjustment {
  available: boolean;
  message?: string;
  average_churn_probability?: number;
  average_retention?: number;
  future_revenue_multiplier?: number;
}

export interface ForecastAgentData {
  predicted_roi: number;
  predicted_revenue: number;
  predicted_profit: number;
  predicted_clicks: number;
  predicted_purchases: number;
  retention_adjustment: RetentionAdjustment;
  daily_forecast: ForecastDailyPoint[];
  top_drivers: ForecastDriver[];
}

export interface ForecastPredictApiResponse {
  success: boolean;
  data?: {
    success: boolean;
    intent: string;
    agent_results?: {
      forecast?: {
        status: string;
        data?: ForecastAgentData;
        error?: string;
      };
    };
    errors?: Record<string, string> | null;
  };
  detail?: string;
}

export interface ForecastTrainApiResponse {
  success: boolean;
  data?: {
    status: string;
    rows: number;
    rmse: number;
    mae: number;
  };
  message?: string;
  detail?: string;
}

export interface AttributionAnalysis {
  best_channel: string;
  worst_channel: string;
  channel_weights: Record<string, number>;
  recommended_shift: {
    from?: string;
    to?: string;
    percent?: number;
  };
  channel_summary: Array<{
    channel: string;
    first_touch_revenue: number;
    last_touch_revenue: number;
    linear_revenue: number;
    blended_revenue: number;
    spend: number;
    blended_roas: number;
  }>;
  model_credit_chart?: Array<{
    channel: string;
    first_touch_revenue: number;
    last_touch_revenue: number;
    linear_revenue: number;
    blended_revenue: number;
    spend: number;
    blended_roas: number;
  }>;
  touchpoint_position_chart?: Array<{
    channel: string;
    first_touch_count: number;
    middle_touch_count: number;
    last_touch_count: number;
  }>;
  budget_scenario_chart?: Array<{
    channel: string;
    current_spend: number;
    projected_spend: number;
    current_revenue: number;
    projected_revenue: number;
  }>;
  diagnostics?: {
    source_info?: Record<string, string>;
    data_points?: Record<string, number>;
    request?: Record<string, string | number>;
  };
  data_source?: string;
}

export interface FunnelAnalysis {
  funnel: {
    impressions: number;
    clicks: number;
    landing_page_views: number;
    add_to_cart: number;
    purchases: number;
  };
  largest_dropoff: string;
  dropoff_percent: number;
  predicted_conversion_uplift_if_fixed: number;
  stage_dropoffs?: Record<string, number>;
  stage_details?: FunnelStageDetail[];
  filters_applied?: Record<string, string>;
  data_source?: string;
  diagnostics?: {
    dropoff_series?: Record<string, number>;
    baseline_conversion_rate?: number;
    estimated_recovered_purchases?: number;
    data_points?: Record<string, number>;
    source_info?: Record<string, string>;
  };
  primary_funnel_chart?: Array<{
    stage: string;
    stage_label: string;
    users: number;
    conversion_from_previous: number;
    dropoff_from_previous: number;
    conversion_from_entry: number;
  }>;
  stage_waterfall_chart?: Array<{
    transition: string;
    transition_label: string;
    lost_users: number;
    lost_users_abs: number;
  }>;
  channel_comparison_chart?: Array<{
    channel: string;
    click_rate: number;
    final_conversion_rate: number;
    purchase_rate: number;
  }>;
  segment_comparison_chart?: Array<{
    segment: string;
    stage: string;
    stage_label: string;
    users: number;
  }>;
  stage_time_chart?: Array<{
    transition: string;
    transition_label: string;
    median_hours: number;
  }>;
  revenue_opportunity_chart?: Array<{
    transition: string;
    transition_label: string;
    estimated_lost_purchases: number;
    estimated_lost_revenue: number;
  }>;
  uplift_scenarios_chart?: Array<{
    improvement_rate: number;
    incremental_purchases: number;
    incremental_revenue: number;
  }>;
}

export interface FunnelStageDetail {
  stage: string;
  value: number;
  dropoff_from_previous_pct: number;
  conversion_from_previous_pct: number;
  conversion_from_entry_pct: number;
}

export interface FunnelOptions {
  channels: string[];
  campaign_types: string[];
  segments: string[];
  event_types: string[];
  event_stages: Array<{ event_type: string; label: string }>;
  time_periods: string[];
  defaults: {
    channel: string;
    campaign_type: string;
    segment: string;
    event_type: string;
    time_period: string;
  };
  available_filters: {
    channel: boolean;
    campaign_type: boolean;
    segment: boolean;
    event_type: boolean;
    time_period: boolean;
  };
  sources: Record<string, string>;
  row_counts: Record<string, number>;
  schema_details?: {
    campaigns?: {
      source: string;
      columns: string[];
      funnel_metrics: string[];
      filter_columns: string[];
    };
    events?: {
      source: string;
      columns: string[];
      event_stage_column: string;
      filter_columns: string[];
    };
    customers?: {
      source: string;
      columns: string[];
      segment_column: string;
      join_key: string;
    };
  };
}

export interface FunnelOptionsApiResponse {
  success: boolean;
  data?: FunnelOptions;
  detail?: string;
}

export interface CohortAnalysis {
  average_ltv: number;
  three_month_retention: number;
  churn_risk: number;
  high_value_segment: string;
  high_churn_segment: string;
  repeat_purchase_rate: number;
  segment_breakdown?: Array<{
    segment: string;
    customers: number;
    average_ltv: number;
    repeat_purchase_rate: number;
    churn_risk: number;
  }>;
  retention_curve?: Array<{
    tenure_months: number;
    retention_rate: number;
    churn_rate: number;
    customers: number;
  }>;
  signup_channel_value?: Array<{
    signup_channel: string;
    customers: number;
    revenue: number;
    average_ltv: number;
  }>;
  diagnostics?: {
    data_points?: Record<string, number>;
    source_info?: Record<string, string>;
    retention_months?: number;
    cohort_period?: string;
  };
  data_source?: string;
}

export interface ForecastAnalysis {
  next_30_day_revenue: number;
  predicted_roi: number;
  predicted_profit: number;
  confidence: number;
  key_drivers: string[];
  assumptions: string[];
}

export interface ScenarioAnalysis {
  best_case: {
    revenue: number;
    roi: number;
  };
  base_case: {
    revenue: number;
    roi: number;
  };
  worst_case: {
    revenue: number;
    roi: number;
  };
}

export interface AgentOrchestrationRequest {
  intent: string;
  agents: string[];
  payload: Record<string, unknown>;
}

export interface AgentOrchestrationResult {
  success: boolean;
  intent: string;
  agents_executed: string[];
  attribution_analysis?: AttributionAnalysis | null;
  funnel_analysis?: FunnelAnalysis | null;
  cohort_analysis?: CohortAnalysis | null;
  forecast_analysis?: ForecastAnalysis | null;
  scenario_analysis?: ScenarioAnalysis | null;
  recommendations?: string[];
  executive_summary?: string;
  confidence_score?: number;
  warnings?: string[];
  errors?: Record<string, string>;
  timestamp: string;
}

export interface AgentOrchestrationApiResponse {
  success: boolean;
  data?: AgentOrchestrationResult;
  timestamp?: string;
  detail?: string;
}

export interface UISuggestionItem {
  id: string;
  title: string;
  description: string;
  prompt: string;
  source: string;
}

