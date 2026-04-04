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

