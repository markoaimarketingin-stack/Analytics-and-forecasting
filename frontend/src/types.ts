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
}

export interface CohortAnalysis {
  average_ltv: number;
  three_month_retention: number;
  churn_risk: number;
  high_value_segment: string;
  high_churn_segment: string;
  repeat_purchase_rate: number;
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

