import { useEffect, useMemo, useState } from 'react';
import {
  FileText,
  Sparkles,
  TrendingUp,
  Filter,
  Users,
  Network,
  GitBranch,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { getAgentResults } from '../services/api';
import type {
  AttributionAnalysis,
  CohortAnalysis,
  ForecastAnalysis,
  FunnelAnalysis,
  ScenarioAnalysis,
} from '../types';

interface DashboardProps {
  result: unknown;
  isLoading: boolean;
  clientId?: string;
}

interface DashboardSnapshot {
  attribution_analysis?: AttributionAnalysis | null;
  funnel_analysis?: FunnelAnalysis | null;
  cohort_analysis?: CohortAnalysis | null;
  forecast_analysis?: ForecastAnalysis | null;
  scenario_analysis?: ScenarioAnalysis | null;
  recommendations?: string[];
  executive_summary?: string;
}

interface AgentResultsResponse {
  results?: Record<string, unknown>;
  recommendations?: unknown;
  executive_summary?: unknown;
}

export default function Dashboard({ result, isLoading, clientId }: DashboardProps) {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [loadingLatest, setLoadingLatest] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const fromProp = normalizeSnapshot(result);
    const fromPropHasData = hasSnapshotData(fromProp);
    if (fromProp) {
      setSnapshot(fromProp);
    }

    // Prefer fresh in-memory run result (from supervisor/chat) over cached backend values.
    // Only use backend hydration as fallback when prop payload does not contain agent outputs.
    if (fromPropHasData) {
      return () => {
        mounted = false;
      };
    }

    const hydrate = async () => {
      setLoadingLatest(true);
      setLoadError(null);
      try {
        const rawResponse = await getAgentResults(undefined, clientId);
        if (!mounted) return;

        const response = asRecord(rawResponse) as AgentResultsResponse;
        const results = asRecord(response?.results);

        const latest = normalizeSnapshot({
          attribution_analysis: results?.attribution ?? null,
          funnel_analysis: results?.funnel ?? null,
          cohort_analysis: results?.cohort ?? null,
          forecast_analysis: results?.forecast ?? null,
          scenario_analysis: results?.scenario ?? null,
          recommendations: Array.isArray(response?.recommendations) ? response.recommendations : [],
          executive_summary: typeof response?.executive_summary === 'string' ? response.executive_summary : null,
        });

        if (latest) {
          setSnapshot(latest);
        }
      } catch (error) {
        if (!mounted) return;
        setLoadError(error instanceof Error ? error.message : 'Unable to fetch dashboard results.');
      } finally {
        if (mounted) setLoadingLatest(false);
      }
    };

    hydrate();

    return () => {
      mounted = false;
    };
  }, [result, clientId]);

  const hasData = useMemo(() => {
    return Boolean(
      snapshot?.forecast_analysis ||
      snapshot?.attribution_analysis ||
      snapshot?.funnel_analysis ||
      snapshot?.cohort_analysis ||
      snapshot?.scenario_analysis,
    );
  }, [snapshot]);

  if (isLoading || loadingLatest) {
    return (
      <div className="grid gap-6 lg:grid-cols-2">
        {[1, 2, 3, 4].map((item) => (
          <div key={item} className="h-64 animate-pulse rounded-3xl border border-gray-200 bg-white shadow-sm" />
        ))}
      </div>
    );
  }

  if (!hasData) {
    return (
      <div className="flex min-h-[420px] flex-col items-center justify-center rounded-3xl border border-gray-200 bg-white px-10 py-16 text-center shadow-sm">
          <h2 className="text-2xl font-bold text-gray-900">Dashboard is ready</h2>
          <p className="mt-3 text-gray-600">Run any agent workspace once to populate all dashboard insights.</p>
          {loadError && <p className="mt-4 text-sm text-red-600">{loadError}</p>}
      </div>
    );
  }

  const forecast = snapshot?.forecast_analysis;
  const attribution = snapshot?.attribution_analysis;
  const funnel = snapshot?.funnel_analysis;
  const cohort = snapshot?.cohort_analysis;
  const scenario = snapshot?.scenario_analysis;
  const topAttributionChannels = (attribution?.channel_summary ?? []).slice(0, 5);
  const topCohortSegments = [...(cohort?.segment_breakdown ?? [])]
    .sort((a, b) => (toNumber(b.average_ltv) ?? 0) - (toNumber(a.average_ltv) ?? 0))
    .slice(0, 5);
  const funnelStages = getFunnelStageRows(funnel);
  const recommendations = (snapshot?.recommendations || []).slice(0, 12);
  const forecastPoints = forecast?.forecast_points ?? [];
  const forecastChannels = forecast?.channel_forecast ?? [];

  const scenarioProjection = scenario?.projection_curve ?? [];
  const scenarioSensitivity = scenario?.sensitivity_curve ?? [];
  const scenarioChannel = scenario?.channel_scenario ?? [];
  const scenarioTable = scenario?.scenario_table ?? [];

  const funnelPrimary = funnel?.primary_funnel_chart ?? [];
  const funnelWaterfall = funnel?.stage_waterfall_chart ?? [];

  const cohortRetention = cohort?.retention_curve ?? [];
  const cohortSignup = cohort?.signup_channel_value ?? [];

  const attributionCredit = attribution?.model_credit_chart ?? attribution?.channel_summary ?? [];
  const attributionTouchpoint = attribution?.touchpoint_position_chart ?? [];

  const attributionWeights = Object.entries(attribution?.channel_weights || {})
    .map(([channel, rawWeight]) => [channel, toNumber(rawWeight) ?? 0] as const)
    .sort((a, b) => b[1] - a[1]);

  const bestScenarioRevenue = toNumber(scenario?.best_case?.revenue);
  const baseScenarioRevenue = toNumber(scenario?.base_case?.revenue);
  const worstScenarioRevenue = toNumber(scenario?.worst_case?.revenue);
  const scenarioUpside = bestScenarioRevenue !== null && baseScenarioRevenue !== null
    ? bestScenarioRevenue - baseScenarioRevenue
    : null;
  const scenarioDownside = worstScenarioRevenue !== null && baseScenarioRevenue !== null
    ? baseScenarioRevenue - worstScenarioRevenue
    : null;

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-3xl border border-indigo-100 bg-gradient-to-br from-white via-indigo-50/50 to-sky-50/60 p-6 shadow-sm">
        <div className="absolute -right-12 -top-12 h-44 w-44 rounded-full bg-indigo-200/35 blur-3xl" />
        <div className="absolute -bottom-14 left-16 h-40 w-40 rounded-full bg-cyan-200/30 blur-3xl" />
        <div className="relative z-10">
          <div className="mt-4 flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-blue-600 text-white shadow-[0_10px_24px_rgba(79,70,229,0.32)]">
              <FileText className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <h2 className="text-2xl font-bold tracking-tight text-gray-900">Analytics Dashboard</h2>
              <p className="mt-1 text-sm text-gray-600">Unified overview of Forecast, Scenario, Funnel, Cohort, and Attribution outputs.</p>
            </div>
          </div>
          {loadError && <p className="mt-3 break-words text-sm text-red-600">{loadError}</p>}
        </div>
      </div>

      {snapshot?.executive_summary && (
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Executive Summary</div>
          <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-gray-700">{snapshot.executive_summary}</p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Forecast Revenue" value={formatCurrency(forecast?.next_30_day_revenue)} />
        <StatCard label="Forecast ROI" value={formatPercent(forecast?.predicted_roi)} />
        <StatCard label="Scenario Base Revenue" value={formatCurrency(baseScenarioRevenue)} />
        <StatCard label="Funnel Uplift" value={formatPercent(funnel?.predicted_conversion_uplift_if_fixed)} />
        <StatCard label="Cohort 3M Retention" value={formatPercent(cohort?.three_month_retention)} />
      </div>

      <div className="space-y-6">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            <TrendingUp className="h-4 w-4" /> Forecast Agent
          </div>
          <h3 className="mt-2 text-lg font-bold text-gray-900">Forecast Trajectory</h3>
          <div className="mt-4 h-[310px] w-full">
            {forecastPoints.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={forecastPoints} margin={{ top: 8, right: 20, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="day" tickFormatter={(value) => `D${value}`} />
                  <YAxis tickFormatter={(value) => formatCompactCurrency(Number(value))} />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Legend />
                  <Line type="monotone" dataKey="revenue" stroke="#2563eb" strokeWidth={2.5} dot={false} name="Revenue" />
                  <Line type="monotone" dataKey="spend" stroke="#64748b" strokeWidth={2} dot={false} name="Spend" />
                  <Line type="monotone" dataKey="profit" stroke="#10b981" strokeWidth={2.5} dot={false} name="Profit" />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <ChartEmpty text="Forecast curve is available after a forecast run." />
            )}
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <SimpleRow label="Predicted Clicks" value={formatCount(forecast?.predicted_clicks)} />
            <SimpleRow label="Predicted Purchases" value={formatCount(forecast?.predicted_purchases)} />
            <SimpleRow label="Predicted CTR" value={formatPercent(forecast?.predicted_ctr)} />
            <SimpleRow label="Predicted Conversion" value={formatPercent(forecast?.predicted_conversion_rate)} />
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div>
              <div className="mb-2 text-sm font-semibold text-gray-700">Key Drivers</div>
              <ul className="space-y-2 text-sm text-gray-700">
                {(forecast?.key_drivers ?? []).length > 0 ? (
                  (forecast?.key_drivers ?? []).map((driver) => (
                    <li key={driver} className="rounded-xl bg-gray-50 px-3 py-2 break-words">{driver}</li>
                  ))
                ) : (
                  <li className="text-gray-500">No forecast drivers available.</li>
                )}
              </ul>
            </div>
            <div>
              <div className="mb-2 text-sm font-semibold text-gray-700">Assumptions</div>
              <ul className="space-y-2 text-sm text-gray-700">
                {(forecast?.assumptions ?? []).length > 0 ? (
                  (forecast?.assumptions ?? []).map((assumption) => (
                    <li key={assumption} className="rounded-xl bg-gray-50 px-3 py-2 break-words">{assumption}</li>
                  ))
                ) : (
                  <li className="text-gray-500">No forecast assumptions available.</li>
                )}
              </ul>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            <GitBranch className="h-4 w-4" /> Scenario Agent
          </div>
          <h3 className="mt-2 text-lg font-bold text-gray-900">Best / Base / Worst Outcomes</h3>
          <div className="mt-4 grid gap-3 md:grid-cols-3 text-sm">
            <ScenarioMini title="Best" revenue={scenario?.best_case?.revenue} roi={scenario?.best_case?.roi} />
            <ScenarioMini title="Base" revenue={scenario?.base_case?.revenue} roi={scenario?.base_case?.roi} />
            <ScenarioMini title="Worst" revenue={scenario?.worst_case?.revenue} roi={scenario?.worst_case?.roi} />
          </div>
          <div className="mt-4 h-[230px] w-full">
            {scenarioProjection.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={scenarioProjection} margin={{ top: 8, right: 20, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="day" tickFormatter={(value) => `D${value}`} />
                  <YAxis tickFormatter={(value) => formatCompactCurrency(Number(value))} />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Legend />
                  <Line type="monotone" dataKey="best" stroke="#16a34a" strokeWidth={2.5} dot={false} name="Best" />
                  <Line type="monotone" dataKey="base" stroke="#7c3aed" strokeWidth={2.5} dot={false} name="Base" />
                  <Line type="monotone" dataKey="worst" stroke="#dc2626" strokeWidth={2.5} dot={false} name="Worst" />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <ChartEmpty text="Scenario projection appears after a scenario run." />
            )}
          </div>
          <div className="mt-4 grid gap-2 text-sm md:grid-cols-2">
            <SimpleRow label="Upside vs Base" value={formatCurrency(scenarioUpside)} />
            <SimpleRow label="Downside vs Base" value={formatCurrency(scenarioDownside)} />
          </div>
          {(scenario?.assumptions ?? []).length > 0 && (
            <div className="mt-5">
              <div className="mb-2 text-sm font-semibold text-gray-700">Assumptions</div>
              <ul className="space-y-2 text-sm text-gray-700">
                {(scenario?.assumptions ?? []).map((item) => (
                  <li key={item} className="rounded-xl bg-gray-50 px-3 py-2 break-words">{item}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-6">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            <Filter className="h-4 w-4" /> Funnel Agent
          </div>
          <h3 className="mt-2 text-lg font-bold text-gray-900">Stage Performance and Dropoff</h3>
          <div className="mt-4 h-[300px] w-full">
            {funnelPrimary.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={funnelPrimary} margin={{ top: 8, right: 20, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="stage_label" />
                  <YAxis tickFormatter={(value) => formatCount(value)} />
                  <Tooltip formatter={(value: number) => formatCount(value)} />
                  <Legend />
                  <Bar dataKey="users" fill="#2563eb" name="Users" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <ChartEmpty text="Funnel chart appears after funnel analysis." />
            )}
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800 break-words">
              Largest dropoff: {formatDropoffLabel(funnel?.largest_dropoff)} ({funnel ? `${(toNumber(funnel.dropoff_percent) ?? 0).toFixed(1)}%` : '-'})
            </div>
            <div className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800 break-words">
              Potential uplift if fixed: {formatPercent(funnel?.predicted_conversion_uplift_if_fixed)}
            </div>
          </div>
          {funnelWaterfall.length > 0 && (
            <div className="mt-4 space-y-2 text-sm">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Top Leakage Transitions</div>
              {funnelWaterfall.slice(0, 4).map((item) => (
                <SimpleRow key={item.transition} label={item.transition_label} value={formatCount(item.lost_users_abs)} />
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            <Users className="h-4 w-4" /> Cohort Agent
          </div>
          <h3 className="mt-2 text-lg font-bold text-gray-900">Retention and Segment Quality</h3>
          <div className="mt-4 h-[300px] w-full">
            {cohortRetention.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={cohortRetention} margin={{ top: 8, right: 20, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="tenure_months" tickFormatter={(value) => `${value}m`} />
                  <YAxis tickFormatter={(value) => `${Math.round(Number(value) * 100)}%`} />
                  <Tooltip formatter={(value: number) => formatPercent(value)} />
                  <Legend />
                  <Line type="monotone" dataKey="retention_rate" stroke="#4f46e5" strokeWidth={2.5} dot={false} name="Retention" />
                  <Line type="monotone" dataKey="churn_rate" stroke="#ef4444" strokeWidth={2.5} dot={false} name="Churn" />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <ChartEmpty text="Retention curve appears after cohort analysis." />
            )}
          </div>
          <div className="mt-4 grid gap-3 text-sm md:grid-cols-2">
            <SimpleRow label="Average LTV" value={formatCurrency(cohort?.average_ltv)} />
            <SimpleRow label="3-Month Retention" value={formatPercent(cohort?.three_month_retention)} />
            <SimpleRow label="Repeat Purchase Rate" value={formatPercent(cohort?.repeat_purchase_rate)} />
            <SimpleRow label="High Value Segment" value={cohort?.high_value_segment || '-'} />
          </div>
          {cohortSignup.length > 0 && (
            <div className="mt-4 h-[230px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={cohortSignup} margin={{ top: 8, right: 20, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="signup_channel" />
                  <YAxis tickFormatter={(value) => formatCompactCurrency(Number(value))} />
                  <Tooltip formatter={(value: number, name: string) => (name === 'Revenue' ? formatCurrency(value) : formatCount(value))} />
                  <Legend />
                  <Bar dataKey="revenue" name="Revenue" fill="#6366f1" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="mt-5 space-y-2 text-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Top Segments by LTV</div>
            {topCohortSegments.length > 0 ? (
              topCohortSegments.map((segment) => (
                <div key={segment.segment} className="grid min-w-0 grid-cols-1 gap-1 rounded-xl bg-gray-50 px-3 py-2 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center sm:gap-2">
                  <span className="truncate font-semibold text-gray-800" title={segment.segment}>{segment.segment}</span>
                  <span className="text-gray-600 sm:text-right">{formatCurrency(segment.average_ltv)}</span>
                  <span className="text-gray-500 sm:text-right">{formatPercent(segment.churn_risk)} churn</span>
                </div>
              ))
            ) : (
              <p className="text-gray-500">No segment-level cohort diagnostics available.</p>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
          <Network className="h-4 w-4" /> Attribution Agent
        </div>
        <h3 className="mt-2 text-lg font-bold text-gray-900">Channel Credit and Performance Mix</h3>
        <div className="mt-4 grid gap-2 text-sm md:grid-cols-3">
          <SimpleRow label="Best Channel" value={attribution?.best_channel || '-'} />
          <SimpleRow label="Worst Channel" value={attribution?.worst_channel || '-'} />
          <SimpleRow label="Recommended Shift" value={attribution?.recommended_shift?.percent ? `${attribution.recommended_shift.percent}%` : '-'} />
        </div>
        <div className="mt-4 grid gap-6 xl:grid-cols-2">
          <div className="h-[300px] w-full">
            {attributionCredit.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={attributionCredit} margin={{ top: 8, right: 20, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="channel" />
                  <YAxis tickFormatter={(value) => formatCompactCurrency(Number(value))} />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Legend />
                  <Bar dataKey="first_touch_revenue" name="First Touch" fill="#60a5fa" radius={[8, 8, 0, 0]} />
                  <Bar dataKey="last_touch_revenue" name="Last Touch" fill="#f97316" radius={[8, 8, 0, 0]} />
                  <Bar dataKey="blended_revenue" name="Blended" fill="#10b981" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <ChartEmpty text="Attribution credit chart appears after attribution analysis." />
            )}
          </div>
          <div className="h-[300px] w-full">
            {attributionTouchpoint.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={attributionTouchpoint} margin={{ top: 8, right: 20, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="channel" />
                  <YAxis />
                  <Tooltip formatter={(value: number) => formatCount(value)} />
                  <Legend />
                  <Bar dataKey="first_touch_count" name="First Touch" stackId="touch" fill="#3b82f6" />
                  <Bar dataKey="middle_touch_count" name="Middle Touch" stackId="touch" fill="#f59e0b" />
                  <Bar dataKey="last_touch_count" name="Last Touch" stackId="touch" fill="#22c55e" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <ChartEmpty text="Touchpoint chart appears when journey data is available." />
            )}
          </div>
        </div>
        <div className="mt-5 space-y-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Attribution Weights</div>
          {attributionWeights.length > 0 ? (
            attributionWeights.map(([channel, weight]) => (
              <div key={channel}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="min-w-0 break-words font-semibold text-gray-800">{channel}</span>
                  <span className="text-gray-600">{formatPercent(weight)}</span>
                </div>
                <div className="h-2 rounded-full bg-gray-100">
                  <div className="h-2 rounded-full bg-blue-600" style={{ width: `${Math.min(100, weight * 100)}%` }} />
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-gray-500">No attribution weights available.</p>
          )}
        </div>
        <div className="mt-5 space-y-2 text-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Top Channel Metrics</div>
          {topAttributionChannels.length > 0 ? (
            topAttributionChannels.map((row) => (
              <div key={row.channel} className="grid min-w-0 grid-cols-1 gap-1 rounded-xl bg-gray-50 px-3 py-2 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center sm:gap-2">
                <span className="truncate font-semibold text-gray-800" title={row.channel}>{row.channel}</span>
                <span className="text-gray-600 sm:text-right">{formatCurrency(row.blended_revenue)}</span>
                <span className="text-gray-500 sm:text-right">ROAS {formatDecimal(row.blended_roas)}</span>
              </div>
            ))
          ) : (
            <p className="text-gray-500">No channel summary available.</p>
          )}
        </div>
      </div>

      {forecastChannels.length > 0 && (
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Forecast Channel Contribution</div>
          <div className="mt-4 grid gap-2 text-sm">
            {forecastChannels.slice(0, 8).map((row) => (
              <div key={row.channel} className="grid min-w-0 grid-cols-1 gap-1 rounded-xl bg-gray-50 px-3 py-2 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:items-center sm:gap-2">
                <span className="truncate font-semibold text-gray-800" title={row.channel}>{row.channel}</span>
                <span className="text-gray-600 sm:text-right">Spend {formatCurrency(row.projected_spend)}</span>
                <span className="text-gray-600 sm:text-right">Revenue {formatCurrency(row.projected_revenue)}</span>
                <span className="text-gray-500 sm:text-right">ROI {formatPercent(row.projected_roi)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {scenarioSensitivity.length > 0 && (
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Scenario Sensitivity</div>
          <div className="mt-4 h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={scenarioSensitivity} margin={{ top: 8, right: 20, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="delta" tickFormatter={(value) => `${value}%`} />
                <YAxis yAxisId="left" tickFormatter={(value) => formatCompactCurrency(Number(value))} />
                <YAxis yAxisId="right" orientation="right" tickFormatter={(value) => `${Math.round(Number(value) * 100)}%`} />
                <Tooltip formatter={(value: number, name: string) => (name === 'ROI' ? formatPercent(value) : formatCurrency(value))} />
                <Legend />
                <Line yAxisId="left" type="monotone" dataKey="revenue" stroke="#2563eb" strokeWidth={2.5} dot={false} name="Revenue" />
                <Line yAxisId="left" type="monotone" dataKey="profit" stroke="#10b981" strokeWidth={2.5} dot={false} name="Profit" />
                <Line yAxisId="right" type="monotone" dataKey="roi" stroke="#f97316" strokeWidth={2.2} dot={false} name="ROI" />
              </LineChart>
            </ResponsiveContainer>
          </div>
          {scenarioChannel.length > 0 && scenarioTable.length > 0 && (
            <div className="mt-4 grid gap-4 xl:grid-cols-2">
              <div className="space-y-2 text-sm">
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Scenario by Channel</div>
                {scenarioChannel.slice(0, 6).map((item) => (
                  <SimpleRow key={item.channel} label={item.channel} value={`Base ${formatCurrency(item.base_revenue)}`} />
                ))}
              </div>
              <div className="space-y-2 text-sm">
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Scenario Table</div>
                {scenarioTable.map((item) => (
                  <SimpleRow key={item.scenario} label={item.scenario} value={`${formatCurrency(item.revenue)} | ROI ${formatPercent(item.roi)}`} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
          <Sparkles className="h-4 w-4" /> Recommended Actions
        </div>
        <ul className="mt-3 space-y-2 text-sm text-gray-700">
          {recommendations.length > 0 ? (
            recommendations.map((item) => (
              <li key={item} className="rounded-xl bg-gray-50 px-3 py-2 break-words">{item}</li>
            ))
          ) : (
            <li className="text-gray-500">No recommendations yet.</li>
          )}
        </ul>
      </div>
    </div>
  );
}

function ChartEmpty({ text }: { text: string }) {
  return <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-gray-300 text-sm text-gray-500">{text}</div>;
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 overflow-hidden rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="truncate text-xs font-semibold uppercase tracking-wide text-gray-500" title={label}>{label}</div>
      <div className="mt-2 truncate text-2xl font-bold text-gray-900" title={value}>{value}</div>
    </div>
  );
}

function FunnelRow({ label, value }: { label: string; value?: number }) {
  return <SimpleRow label={label} value={formatCount(value)} />;
}

function SimpleRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-xl bg-gray-50 px-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
      <span className="break-words text-gray-600">{label}</span>
      <span className="break-words font-semibold text-gray-900 sm:text-right">{value}</span>
    </div>
  );
}

function ScenarioMini({ title, revenue, roi }: { title: string; revenue?: number; roi?: number }) {
  return (
    <div className="min-w-0 overflow-hidden rounded-xl border border-gray-200 bg-gray-50 p-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</div>
      <div className="mt-1 truncate text-lg font-bold text-gray-900" title={formatCurrency(revenue)}>{formatCurrency(revenue)}</div>
      <div className="truncate text-xs text-gray-600" title={`ROI ${formatPercent(roi)}`}>ROI {formatPercent(roi)}</div>
    </div>
  );
}

function formatDecimal(value: unknown): string {
  const safe = toNumber(value);
  if (safe === null) return '-';
  return safe.toFixed(2);
}

function formatConfidence(value: unknown): string {
  const safe = toNumber(value);
  if (safe === null) return '-';
  const normalized = safe <= 1 ? safe * 100 : safe;
  return `${normalized.toFixed(1)}%`;
}

function formatCurrency(value?: number): string {
  const safe = toNumber(value);
  if (safe === null) return '-';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(safe);
}

function formatCompactCurrency(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

function formatPercent(value?: number): string {
  const safe = toNumber(value);
  if (safe === null) return '-';
  return `${(safe * 100).toFixed(1)}%`;
}

function formatCount(value?: number): string {
  const safe = toNumber(value);
  if (safe === null) return '-';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(safe);
}

function formatDropoffLabel(value: unknown): string {
  if (typeof value === 'string' && value.trim()) {
    return value.replace(/_/g, ' ');
  }
  return '-';
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function getFunnelStageRows(funnel: FunnelAnalysis | null | undefined): Array<{
  label: string;
  value: number;
  conversionFromEntry: number;
}> {
  if (funnel?.stage_details?.length) {
    return funnel.stage_details.map((item) => ({
      label: formatDropoffLabel(item.stage),
      value: toNumber(item.value) ?? 0,
      conversionFromEntry: toNumber(item.conversion_from_entry_pct) ?? 0,
    }));
  }

  const raw = funnel?.funnel;
  if (!raw) return [];

  const base = toNumber(raw.impressions) ?? 0;
  const rows = [
    { label: 'Impressions', value: toNumber(raw.impressions) ?? 0 },
    { label: 'Clicks', value: toNumber(raw.clicks) ?? 0 },
    { label: 'Landing Page Views', value: toNumber(raw.landing_page_views) ?? 0 },
    { label: 'Add To Cart', value: toNumber(raw.add_to_cart) ?? 0 },
    { label: 'Purchases', value: toNumber(raw.purchases) ?? 0 },
  ];

  return rows.map((row) => ({
    ...row,
    conversionFromEntry: base > 0 ? (row.value / base) * 100 : 0,
  }));
}

function normalizeSnapshot(raw: unknown): DashboardSnapshot | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const rawRecord = raw as Record<string, unknown>;

  const direct = {
    attribution_analysis: (rawRecord.attribution_analysis as AttributionAnalysis | null | undefined) ?? null,
    funnel_analysis: (rawRecord.funnel_analysis as FunnelAnalysis | null | undefined) ?? null,
    cohort_analysis: (rawRecord.cohort_analysis as CohortAnalysis | null | undefined) ?? null,
    forecast_analysis: (rawRecord.forecast_analysis as ForecastAnalysis | null | undefined) ?? null,
    scenario_analysis: (rawRecord.scenario_analysis as ScenarioAnalysis | null | undefined) ?? null,
    recommendations: Array.isArray(rawRecord.recommendations) ? (rawRecord.recommendations.filter((item): item is string => typeof item === 'string')) : [],
    executive_summary: typeof rawRecord.executive_summary === 'string' ? rawRecord.executive_summary : undefined,
  };

  if (
    direct.attribution_analysis ||
    direct.funnel_analysis ||
    direct.cohort_analysis ||
    direct.forecast_analysis ||
    direct.scenario_analysis
  ) {
    return direct;
  }

  if (rawRecord.agent_results && typeof rawRecord.agent_results === 'object') {
    const agentResults = rawRecord.agent_results as Record<string, unknown>;
    return {
      attribution_analysis: (agentResults.attribution as AttributionAnalysis | null | undefined) ?? null,
      funnel_analysis: (agentResults.funnel as FunnelAnalysis | null | undefined) ?? null,
      cohort_analysis: (agentResults.cohort as CohortAnalysis | null | undefined) ?? null,
      forecast_analysis: (agentResults.forecast as ForecastAnalysis | null | undefined) ?? null,
      scenario_analysis: (agentResults.scenario as ScenarioAnalysis | null | undefined) ?? null,
      recommendations: Array.isArray(rawRecord.recommendations) ? (rawRecord.recommendations.filter((item): item is string => typeof item === 'string')) : [],
      executive_summary: typeof rawRecord.executive_summary === 'string' ? rawRecord.executive_summary : undefined,
    };
  }

  return null;
}

function hasSnapshotData(snapshot: DashboardSnapshot | null): boolean {
  if (!snapshot) return false;
  return Boolean(
    snapshot.forecast_analysis ||
    snapshot.scenario_analysis ||
    snapshot.funnel_analysis ||
    snapshot.cohort_analysis ||
    snapshot.attribution_analysis,
  );
}

