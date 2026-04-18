// ... existing types

export interface File {
  id: number;
  file_name: string;
  file_type: string;
  file_size: number;
  storage_path: string;
  created_at: string; // Assuming ISO date string from backend
  client_id?: string;
  category?: string;
  instructions?: string;
  remote_storage_path?: string;
}

export interface TrainingUploadFile {
  id: number;
  client_id: string;
  agent_id: number;
  file_name: string;
  file_type?: string;
  file_size?: number;
  local_storage_path?: string;
  remote_storage_path: string;
  category: string;
  instructions?: string;
  created_at: string;
}

export interface TrainingUploadListApiResponse {
  success: boolean;
  files: TrainingUploadFile[];
  timestamp: string;
}

export interface TrainingUploadPreviewApiResponse {
  success: boolean;
  file: TrainingUploadFile;
  preview: string;
  timestamp: string;
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

export interface ChatThreadSummary {
  id: string;
  title: string;
  created_at?: string;
  updated_at?: string;
  last_message_at?: string;
  last_message_preview: string;
}

export interface ChatThreadMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

export interface ChatThreadDetail {
  thread: ChatThreadSummary;
  messages: ChatThreadMessage[];
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
    driver_metric?: string;
  };
  summary_metrics?: {
    total_spend?: number;
    attributed_revenue?: number;
    blended_roas?: number;
    blended_roi?: number;
    blended_cac?: number;
    blended_cpa?: number;
    ctr?: number;
    conversion_rate?: number;
    aov?: number;
    cpc?: number;
    cpm?: number;
  };
  channel_summary: Array<{
    channel: string;
    first_touch_revenue: number;
    last_touch_revenue: number;
    linear_revenue: number;
    time_decay_revenue?: number;
    selected_revenue?: number;
    blended_revenue: number;
    spend: number;
    impressions?: number;
    clicks?: number;
    purchases?: number;
    attributed_customers?: number;
    first_touch_customers?: number;
    ctr?: number;
    conversion_rate?: number;
    cpc?: number;
    cpm?: number;
    aov?: number;
    blended_roas: number;
    blended_roi?: number;
    cac?: number;
    cpa?: number;
    revenue_per_customer?: number;
    selected_metric?: string;
    selected_metric_value?: number;
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
    current_roi?: number;
    projected_roi?: number;
    selected_metric?: string;
    selected_metric_value?: number;
  }>;
  efficiency_chart?: Array<{
    channel: string;
    roas: number;
    roi: number;
    cac: number;
    cpa: number;
    cpc: number;
    cpm: number;
  }>;
  conversion_quality_chart?: Array<{
    channel: string;
    ctr: number;
    conversion_rate: number;
    aov: number;
    purchases: number;
  }>;
  filters_applied?: Record<string, unknown>;
  diagnostics?: {
    source_info?: Record<string, string>;
    data_points?: Record<string, number>;
    request?: Record<string, string | number>;
    filters_applied?: Record<string, string>;
  };
  data_source?: string;
}

export interface AttributionOptions {
  channels: string[];
  campaign_types: string[];
  attribution_models: string[];
  metrics: string[];
  defaults: {
    channel: string;
    campaign_type: string;
    attribution_model: string;
    metric: string;
    budget_shift_cap_percent: number;
    start_date?: string;
    end_date?: string;
  };
  available_filters: {
    channel: boolean;
    campaign_type: boolean;
    date_range: boolean;
  };
  sources: Record<string, string>;
  row_counts: Record<string, number>;
  date_range?: {
    min?: string;
    max?: string;
  };
}

export interface AttributionOptionsApiResponse {
  success: boolean;
  data?: AttributionOptions;
  detail?: string;
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
  cohort_curves?: Array<{
    cohort_label: string;
    customers: number;
    avg_tenure_months: number;
    retention_rate: number;
    churn_probability: number;
    avg_revenue_per_customer: number;
  }>;
  cohort_table?: Array<{
    cohort_label: string;
    tenure_months: number;
    customers: number;
    retention_rate: number;
    churn_probability: number;
    avg_revenue_per_customer: number;
    avg_monthly_logins: number;
  }>;
  churn_risk_actions?: Array<{
    priority: string;
    segment: string;
    signup_channel: string;
    contract_type: string;
    customers: number;
    avg_ltv: number;
    churn_risk: number;
    recommended_action: string;
    expected_impact: string;
  }>;
  filters_applied?: Record<string, unknown>;
  diagnostics?: {
    data_points?: Record<string, number>;
    source_info?: Record<string, string>;
    retention_months?: number;
    cohort_period?: string;
    filters_applied?: Record<string, unknown>;
  };
  data_source?: string;
}

export interface CohortOptions {
  segments: string[];
  signup_channels: string[];
  contract_types: string[];
  cohort_periods: string[];
  defaults: {
    cohort_period: string;
    retention_months: number;
    segment: string;
    signup_channel: string;
    contract_type: string;
    signup_start_date?: string;
    signup_end_date?: string;
    min_tenure_months: number;
    churn_probability_min: number;
    top_n: number;
  };
  limits?: {
    max_tenure_months?: number;
    max_top_n?: number;
  };
  available_filters?: {
    segment?: boolean;
    signup_channel?: boolean;
    contract_type?: boolean;
    signup_date?: boolean;
    min_tenure_months?: boolean;
    churn_probability_min?: boolean;
  };
  sources?: Record<string, string>;
  row_counts?: Record<string, number>;
  date_range?: {
    signup_min?: string;
    signup_max?: string;
  };
}

export interface CohortOptionsApiResponse {
  success: boolean;
  data?: CohortOptions;
  detail?: string;
}

export interface ForecastAnalysis {
  next_30_day_revenue: number;
  predicted_roi: number;
  predicted_profit: number;
  predicted_purchases?: number;
  predicted_clicks?: number;
  predicted_impressions?: number;
  predicted_conversion_rate?: number;
  predicted_ctr?: number;
  confidence: number;
  key_drivers: string[];
  assumptions: string[];
  kpi_metric?: string;
  kpi_projection?: number;
  forecast_points?: Array<{
    day: number;
    spend: number;
    revenue: number;
    profit: number;
    roi: number;
    clicks: number;
    purchases: number;
  }>;
  channel_forecast?: Array<{
    channel: string;
    projected_spend: number;
    projected_revenue: number;
    projected_purchases: number;
    projected_roi: number;
  }>;
  baseline_metrics?: {
    spend: number;
    revenue: number;
    roi: number;
    clicks: number;
    purchases: number;
  };
  applied_filters?: Record<string, unknown>;
  diagnostics?: Record<string, unknown>;
  data_source?: string;
}

export interface ForecastOptions {
  channels: string[];
  campaign_types: string[];
  campaign_ids: string[];
  defaults: {
    channel: string;
    campaign_type: string;
    campaign_id: string;
    horizon_days: number;
    kpi_metric: string;
  };
  available_filters: {
    channel: boolean;
    campaign_type: boolean;
    campaign_id: boolean;
  };
  sources: {
    campaigns: string;
  };
  row_counts: {
    campaigns: number;
  };
  date_range?: {
    min?: string;
    max?: string;
  };
}

export interface ForecastOptionsApiResponse {
  success: boolean;
  data?: ForecastOptions;
  detail?: string;
}

export interface ScenarioOptions {
  channels: string[];
  campaign_types: string[];
  campaign_ids: string[];
  kpi_metrics: string[];
  defaults: {
    channel: string;
    campaign_type: string;
    campaign_id: string;
    horizon_days: number;
    kpi_metric: string;
    base_spend_change_pct: number;
    base_ctr_lift_pct: number;
    base_conversion_lift_pct: number;
    base_aov_change_pct: number;
  };
  available_filters: {
    channel: boolean;
    campaign_type: boolean;
    campaign_id: boolean;
  };
  sources: {
    campaigns: string;
  };
  row_counts: {
    campaigns: number;
  };
  date_range?: {
    min?: string;
    max?: string;
  };
}

export interface ScenarioOptionsApiResponse {
  success: boolean;
  data?: ScenarioOptions;
  detail?: string;
}

export interface ScenarioAnalysis {
  best_case: {
    revenue: number;
    roi: number;
    profit?: number;
    spend?: number;
    clicks?: number;
    purchases?: number;
  };
  base_case: {
    revenue: number;
    roi: number;
    profit?: number;
    spend?: number;
    clicks?: number;
    purchases?: number;
  };
  worst_case: {
    revenue: number;
    roi: number;
    profit?: number;
    spend?: number;
    clicks?: number;
    purchases?: number;
  };
  kpi_metric?: string;
  scenario_table?: Array<{
    scenario: string;
    revenue: number;
    roi: number;
    profit: number;
    spend: number;
    clicks: number;
    purchases: number;
  }>;
  projection_curve?: Array<{
    day: number;
    best: number;
    base: number;
    worst: number;
  }>;
  sensitivity_curve?: Array<{
    delta: number;
    revenue: number;
    profit: number;
    roi: number;
  }>;
  channel_scenario?: Array<{
    channel: string;
    best_revenue: number;
    base_revenue: number;
    worst_revenue: number;
  }>;
  baseline_metrics?: {
    spend: number;
    revenue: number;
    roi: number;
    profit: number;
    clicks: number;
    purchases: number;
  };
  assumptions?: string[];
  applied_filters?: Record<string, unknown>;
  diagnostics?: Record<string, unknown>;
  data_source?: string;
}

export interface BudgetAllocationAnalysis {
  objective: string;
  risk_tolerance: string;
  total_budget: number;
  baseline_budget: number;
  expected_kpi_delta: number;
  expected_roi_delta: number;
  confidence_band?: {
    low: number;
    base: number;
    high: number;
  };
  channel_allocations: Array<{
    channel: string;
    baseline_spend: number;
    recommended_spend: number;
    delta_amount: number;
    delta_percent: number;
    expected_revenue: number;
    expected_roi: number;
    score: number;
  }>;
  plans?: Record<string, {
    channel_allocations: Array<Record<string, unknown>>;
    expected_kpi_delta: number;
    expected_roi_delta: number;
    confidence_band: {
      low: number;
      base: number;
      high: number;
    };
    constraint_log: string[];
  }>;
  constraint_log?: string[];
  assumptions?: string[];
  diagnostics?: Record<string, unknown>;
  data_source?: string;
}

export interface BudgetAllocatorOptions {
  channels: string[];
  campaign_types: string[];
  campaign_ids: string[];
  objectives: string[];
  risk_tolerances: string[];
  defaults: {
    channel: string;
    campaign_type: string;
    campaign_id: string;
    objective: string;
    risk_tolerance: string;
    total_budget: number;
    max_shift_pct: number;
    min_channel_pct: number;
    max_channel_pct: number;
  };
  available_filters: {
    channel: boolean;
    campaign_type: boolean;
    campaign_id: boolean;
  };
  sources: {
    campaigns: string;
  };
  row_counts: {
    campaigns: number;
  };
}

export interface BudgetAllocatorOptionsApiResponse {
  success: boolean;
  data?: BudgetAllocatorOptions;
  detail?: string;
}

export interface AgentOrchestrationRequest {
  intent: string;
  agents: string[];
  payload: Record<string, unknown>;
  client_id?: string;
  thread_id?: string;
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
  budget_allocation_analysis?: BudgetAllocationAnalysis | null;
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

export type ReportType = 'executive' | 'detailed';
export type ReportExportFormat = 'pdf' | 'doc';

export interface ReportGenerationRequest {
  report_type: ReportType;
  export_format: ReportExportFormat;
  agents: string[];
  payload?: Record<string, unknown>;
  client_id?: string;
  thread_id?: string;
}

export interface GeneratedReportPayload {
  filename: string;
  mime_type: string;
  content_base64: string;
  report_text: string;
  report_type: ReportType;
  export_format: ReportExportFormat;
  agents_executed: string[];
  orchestration_result?: AgentOrchestrationResult;
}

export interface ReportGenerationApiResponse {
  success: boolean;
  data?: GeneratedReportPayload;
  timestamp?: string;
  detail?: string;
}

export type RecommendationStatus =
  | 'pending'
  | 'accepted'
  | 'in_progress'
  | 'implemented'
  | 'rejected';

export interface RecommendationLifecycleRecord {
  suggestion_id: string;
  client_id?: string;
  thread_id?: string;
  title?: string;
  description?: string;
  prompt?: string;
  source?: string;
  status: RecommendationStatus;
  accepted_at?: string;
  submitted_at?: string;
  owner?: string;
  due_date?: string;
  expected_impact?: string;
  actual_impact?: string;
  outcome_notes?: string;
  last_updated_at?: string;
}

export interface RecommendationLifecycleListApiResponse {
  success: boolean;
  data?: RecommendationLifecycleRecord[];
  detail?: string;
}

export interface RecommendationLifecycleUpsertApiResponse {
  success: boolean;
  data?: RecommendationLifecycleRecord;
  detail?: string;
}

export interface UISuggestionItem {
  id: string;
  title: string;
  description: string;
  prompt: string;
  source: string;
  status: RecommendationStatus;
  acceptedAt?: string;
  submittedAt?: string;
  owner?: string;
  dueDate?: string;
  expectedImpact?: string;
  actualImpact?: string;
  outcomeNotes?: string;
  lastUpdatedAt?: string;
  clientId?: string;
  threadId?: string;
}

