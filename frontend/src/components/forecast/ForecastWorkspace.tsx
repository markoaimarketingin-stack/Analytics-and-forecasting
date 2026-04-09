import { Calendar, Database, Settings2, Sparkles, Target, TrendingUp } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
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
import { getForecastOptions, orchestrateAgents } from '../../services/api';
import type { AgentOrchestrationResult, ForecastAnalysis, ForecastOptions } from '../../types';

interface ForecastFormState {
  horizon_days: number;
  kpi_metric: string;
  channel: string;
  campaign_type: string;
  campaign_id: string;
  spend_change_pct: number;
  ctr_lift_pct: number;
  conversion_lift_pct: number;
  cpc_change_pct: number;
  aov_change_pct: number;
  seasonality_factor: number;
}

interface ForecastWorkspaceProps {
  onRunResult?: (result: AgentOrchestrationResult) => void;
}

export default function ForecastWorkspace({ onRunResult }: ForecastWorkspaceProps) {
  const [form, setForm] = useState<ForecastFormState>({
    horizon_days: 90,
    kpi_metric: 'revenue',
    channel: 'all',
    campaign_type: 'all',
    campaign_id: 'all',
    spend_change_pct: 0,
    ctr_lift_pct: 0,
    conversion_lift_pct: 0,
    cpc_change_pct: 0,
    aov_change_pct: 0,
    seasonality_factor: 1,
  });
  const [options, setOptions] = useState<ForecastOptions | null>(null);
  const [isLoadingOptions, setIsLoadingOptions] = useState(true);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [isAssumptionsOpen, setIsAssumptionsOpen] = useState(false);
  const [result, setResult] = useState<ForecastAnalysis | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const horizonLabel = useMemo(() => {
    if (form.horizon_days <= 30) return '1 Month';
    if (form.horizon_days <= 90) return '3 Months';
    if (form.horizon_days <= 180) return '6 Months';
    return '12 Months';
  }, [form.horizon_days]);

  useEffect(() => {
    let cancelled = false;

    const loadOptions = async () => {
      setIsLoadingOptions(true);
      setOptionsError(null);

      try {
        const response = await getForecastOptions();
        if (!response.success || !response.data) {
          throw new Error(response.detail || 'Unable to load forecast options from Supabase.');
        }

        if (cancelled) return;
        setOptions(response.data);
        setForm((prev) => ({
          ...prev,
          horizon_days: response.data?.defaults.horizon_days || prev.horizon_days,
          kpi_metric: response.data?.defaults.kpi_metric || prev.kpi_metric,
          channel: response.data?.defaults.channel || prev.channel,
          campaign_type: response.data?.defaults.campaign_type || prev.campaign_type,
          campaign_id: response.data?.defaults.campaign_id || prev.campaign_id,
        }));
      } catch (loadError) {
        if (cancelled) return;
        setOptionsError(loadError instanceof Error ? loadError.message : 'Unable to load forecast filters.');
      } finally {
        if (!cancelled) {
          setIsLoadingOptions(false);
        }
      }
    };

    loadOptions();
    return () => {
      cancelled = true;
    };
  }, []);

  const optionsSourceLabel = useMemo(() => {
    const source = options?.sources?.campaigns || '';
    return source.toLowerCase() === 'supabase' ? 'Supabase' : source || '-';
  }, [options]);

  const forecastPoints = result?.forecast_points ?? [];
  const channelForecast = result?.channel_forecast ?? [];

  const kpiSeriesData = useMemo(() => {
    if (!forecastPoints.length) return [];
    const key = form.kpi_metric;
    return forecastPoints.map((point) => ({
      day: point.day,
      kpi:
        key === 'revenue'
          ? point.revenue
          : key === 'profit'
            ? point.profit
            : key === 'roi'
              ? point.roi
              : key === 'spend'
                ? point.spend
                : key === 'clicks'
                  ? point.clicks
                  : key === 'purchases'
                    ? point.purchases
                    : key === 'ctr'
                      ? result?.predicted_ctr ?? 0
                      : key === 'conversion_rate'
                        ? result?.predicted_conversion_rate ?? 0
                        : point.revenue,
    }));
  }, [forecastPoints, form.kpi_metric, result?.predicted_ctr, result?.predicted_conversion_rate]);

  const runForecast = async () => {
    setIsRunning(true);
    setError(null);

    try {
      const response = await orchestrateAgents({
        intent: 'forecast',
        agents: ['forecast'],
        payload: {
          horizon_days: form.horizon_days,
          kpi_metric: form.kpi_metric,
          channel: form.channel,
          campaign_type: form.campaign_type,
          campaign_id: form.campaign_id,
          spend_change_pct: form.spend_change_pct,
          ctr_lift_pct: form.ctr_lift_pct,
          conversion_lift_pct: form.conversion_lift_pct,
          cpc_change_pct: form.cpc_change_pct,
          aov_change_pct: form.aov_change_pct,
          seasonality_factor: form.seasonality_factor,
        },
      });

      if (!response.success || !response.data?.success) {
        throw new Error(response.detail || response.data?.errors?.system || 'Failed to run forecast agent.');
      }

      onRunResult?.(response.data);

      setResult(response.data.forecast_analysis ?? null);
      setWarnings(response.data.warnings ?? []);
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : 'Failed to run forecast agent.');
    } finally {
      setIsRunning(false);
    }
  };

  const updateField = <K extends keyof ForecastFormState>(key: K, value: ForecastFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="workspace-surface workspace-modern">
      <div className="workspace-header-glass workspace-header-glass-modern px-8 py-3">
        <div className="flex items-center gap-4">
          <div className="workspace-agent-icon bg-gradient-to-br from-blue-600 to-indigo-600">
            <TrendingUp className="h-7 w-7" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">Forecast Agent</h1>
          </div>
        </div>
      </div>

      <div className="workspace-content">
        <div className="mx-auto w-full max-w-6xl space-y-6">
          <div className="workspace-panel">
            <div className="mb-4 flex flex-wrap items-center gap-3 text-xs text-gray-500">
              <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1">
                <Database className="h-3.5 w-3.5" /> Source: {optionsSourceLabel}
              </span>
              {options?.row_counts?.campaigns ? (
                <span className="rounded-full bg-gray-100 px-3 py-1">
                  Campaign rows: {formatCount(options.row_counts.campaigns)}
                </span>
              ) : null}
              {options?.date_range?.min && options?.date_range?.max ? (
                <span className="rounded-full bg-gray-100 px-3 py-1">
                  Date range: {options.date_range.min} to {options.date_range.max}
                </span>
              ) : null}
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <label className="text-sm text-gray-600">
                Horizon
                <select
                  value={form.horizon_days}
                  onChange={(event) => updateField('horizon_days', Number(event.target.value))}
                  className="workspace-control"
                >
                  <option value={30}>30 days</option>
                  <option value={60}>60 days</option>
                  <option value={90}>90 days</option>
                  <option value={180}>180 days</option>
                  <option value={365}>365 days</option>
                </select>
              </label>

              <label className="text-sm text-gray-600">
                KPI to Forecast
                <select
                  value={form.kpi_metric}
                  onChange={(event) => updateField('kpi_metric', event.target.value)}
                  className="workspace-control"
                >
                  <option value="revenue">Revenue</option>
                  <option value="profit">Profit</option>
                  <option value="roi">ROI</option>
                  <option value="spend">Spend</option>
                  <option value="clicks">Clicks</option>
                  <option value="purchases">Purchases</option>
                  <option value="impressions">Impressions</option>
                  <option value="ctr">CTR</option>
                  <option value="conversion_rate">Conversion Rate</option>
                </select>
              </label>

              <label className="text-sm text-gray-600">
                Channel
                <select
                  value={form.channel}
                  onChange={(event) => updateField('channel', event.target.value)}
                  className="workspace-control"
                  disabled={isLoadingOptions || !options?.available_filters.channel}
                >
                  <option value="all">All Channels</option>
                  {(options?.channels ?? []).map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </label>

              <label className="text-sm text-gray-600">
                Campaign Type
                <select
                  value={form.campaign_type}
                  onChange={(event) => updateField('campaign_type', event.target.value)}
                  className="workspace-control"
                  disabled={isLoadingOptions || !options?.available_filters.campaign_type}
                >
                  <option value="all">All Campaign Types</option>
                  {(options?.campaign_types ?? []).map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </label>

              <label className="text-sm text-gray-600">
                Campaign ID
                <select
                  value={form.campaign_id}
                  onChange={(event) => updateField('campaign_id', event.target.value)}
                  className="workspace-control"
                  disabled={isLoadingOptions || !options?.available_filters.campaign_id}
                >
                  <option value="all">All Campaigns</option>
                  {(options?.campaign_ids ?? []).map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </label>

              <div className="flex items-end">
                <button
                  type="button"
                  onClick={() => setIsAssumptionsOpen((prev) => !prev)}
                  className="workspace-action-btn w-full bg-gray-900 text-white"
                >
                  <Settings2 className="h-4 w-4" /> {isAssumptionsOpen ? 'Hide Assumptions' : 'Advanced Assumptions'}
                </button>
              </div>

              <div className="flex items-end">
                <button onClick={runForecast} disabled={isRunning} className="workspace-action-btn w-full bg-gradient-to-r from-blue-600 to-indigo-600 disabled:opacity-60">
                  <Sparkles className="h-4 w-4" /> {isRunning ? 'Running...' : 'Run Forecast'}
                </button>
              </div>
            </div>

            {isAssumptionsOpen ? (
              <div className="mt-5 grid gap-4 rounded-2xl border border-gray-200 bg-gray-50 p-4 sm:grid-cols-2 xl:grid-cols-3">
                <RangeInput label="Spend Change (%)" value={form.spend_change_pct} min={-80} max={200} step={1} onChange={(value) => updateField('spend_change_pct', value)} />
                <RangeInput label="CTR Lift (%)" value={form.ctr_lift_pct} min={-50} max={100} step={1} onChange={(value) => updateField('ctr_lift_pct', value)} />
                <RangeInput label="Conversion Lift (%)" value={form.conversion_lift_pct} min={-50} max={100} step={1} onChange={(value) => updateField('conversion_lift_pct', value)} />
                <RangeInput label="CPC Change (%)" value={form.cpc_change_pct} min={-60} max={120} step={1} onChange={(value) => updateField('cpc_change_pct', value)} />
                <RangeInput label="AOV Change (%)" value={form.aov_change_pct} min={-40} max={120} step={1} onChange={(value) => updateField('aov_change_pct', value)} />
                <label className="text-sm text-gray-600">
                  Seasonality Factor
                  <input
                    type="number"
                    min={0.2}
                    max={3}
                    step={0.05}
                    value={form.seasonality_factor}
                    onChange={(event) => updateField('seasonality_factor', Number(event.target.value))}
                    className="workspace-control"
                  />
                </label>
              </div>
            ) : null}

            {error && <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            {optionsError && <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{optionsError}</p>}
            {warnings.length > 0 && <p className="mt-3 text-sm text-amber-700">{warnings.join(' | ')}</p>}
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard title="Forecast Horizon" value={horizonLabel} icon={<Calendar className="h-4 w-4" />} />
            <MetricCard title="Next 30 Day Revenue" value={formatCurrencyCompact(result?.next_30_day_revenue)} icon={<TrendingUp className="h-4 w-4" />} />
            <MetricCard title="Predicted ROI" value={formatPercentCompact(result?.predicted_roi)} icon={<Target className="h-4 w-4" />} />
            <MetricCard title="Predicted Profit" value={formatCurrencyCompact(result?.predicted_profit)} icon={<Sparkles className="h-4 w-4" />} />
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <div className="workspace-panel">
              <h3 className="text-lg font-semibold text-gray-900">KPI Trajectory</h3>
              <p className="mt-1 text-sm text-gray-500">Forecasted {prettyKpiLabel(form.kpi_metric)} over the selected horizon.</p>
              <div className="mt-4 h-[320px] w-full">
                {kpiSeriesData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={kpiSeriesData} margin={{ top: 8, right: 20, left: 8, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="day" tickFormatter={(value) => `D${value}`} />
                      <YAxis tickFormatter={(value) => formatCompactKpi(form.kpi_metric, Number(value))} />
                      <Tooltip formatter={(value: number) => formatKpiValue(form.kpi_metric, Number(value))} labelFormatter={(label) => `Day ${label}`} />
                      <Legend />
                      <Line type="monotone" dataKey="kpi" stroke="#2563eb" strokeWidth={2.5} dot={false} name={prettyKpiLabel(form.kpi_metric)} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyChart text="Run forecast to render KPI trajectory." />
                )}
              </div>
            </div>

            <div className="workspace-panel">
              <h3 className="text-lg font-semibold text-gray-900">Revenue vs Spend</h3>
              <p className="mt-1 text-sm text-gray-500">Cumulative forecast view for budget and expected return.</p>
              <div className="mt-4 h-[320px] w-full">
                {forecastPoints.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={forecastPoints} margin={{ top: 8, right: 20, left: 8, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="day" tickFormatter={(value) => `D${value}`} />
                      <YAxis tickFormatter={(value) => compactCurrency(Number(value))} />
                      <Tooltip formatter={(value: number) => formatCurrency(Number(value))} />
                      <Legend />
                      <Line type="monotone" dataKey="spend" stroke="#64748b" strokeWidth={2} dot={false} name="Spend" />
                      <Line type="monotone" dataKey="revenue" stroke="#0ea5e9" strokeWidth={2.5} dot={false} name="Revenue" />
                      <Line type="monotone" dataKey="profit" stroke="#10b981" strokeWidth={2.5} dot={false} name="Profit" />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyChart text="Run forecast to compare revenue and spend." />
                )}
              </div>
            </div>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <div className="workspace-panel">
              <h3 className="text-lg font-semibold text-gray-900">Channel Forecast Contribution</h3>
              <p className="mt-1 text-sm text-gray-500">Projected revenue and spend split by channel.</p>
              <div className="mt-4 h-[320px] w-full">
                {channelForecast.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={channelForecast} margin={{ top: 8, right: 20, left: 8, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="channel" />
                      <YAxis tickFormatter={(value) => compactCurrency(Number(value))} />
                      <Tooltip formatter={(value: number) => formatCurrency(Number(value))} />
                      <Legend />
                      <Bar dataKey="projected_spend" name="Projected Spend" fill="#94a3b8" radius={[8, 8, 0, 0]} />
                      <Bar dataKey="projected_revenue" name="Projected Revenue" fill="#3b82f6" radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyChart text="Channel split is available after forecast run." />
                )}
              </div>
            </div>

            <div className="workspace-panel">
              <h3 className="text-lg font-semibold text-gray-900">Top Drivers</h3>
              <ul className="mt-4 space-y-2 text-sm text-gray-700">
                {(result?.key_drivers ?? []).length > 0 ? (
                  (result?.key_drivers ?? []).map((driver) => (
                    <li key={driver} className="rounded-xl bg-gray-50 px-3 py-2">{driver}</li>
                  ))
                ) : (
                  <li className="text-gray-500">Run a forecast to view model drivers.</li>
                )}
              </ul>

              <h3 className="mt-6 text-lg font-semibold text-gray-900">Assumptions Used</h3>
              <ul className="mt-3 space-y-2 text-sm text-gray-700">
                {(result?.assumptions ?? []).length > 0 ? (
                  (result?.assumptions ?? []).map((assumption) => (
                    <li key={assumption} className="rounded-xl bg-gray-50 px-3 py-2">{assumption}</li>
                  ))
                ) : (
                  <li className="text-gray-500">Assumptions will appear after execution.</li>
                )}
              </ul>
            </div>
          </div>

          <div className="workspace-panel">
            <h3 className="text-lg font-semibold text-gray-900">Forecast Series Table</h3>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-gray-500">
                  <tr>
                    <th className="px-3 py-2">Day</th>
                    <th className="px-3 py-2">Spend</th>
                    <th className="px-3 py-2">Revenue</th>
                    <th className="px-3 py-2">Profit</th>
                    <th className="px-3 py-2">ROI</th>
                    <th className="px-3 py-2">Clicks</th>
                    <th className="px-3 py-2">Purchases</th>
                  </tr>
                </thead>
                <tbody>
                  {forecastPoints.length > 0 ? (
                    forecastPoints.map((row) => (
                      <tr key={row.day} className="border-t border-gray-100">
                        <td className="px-3 py-2 font-semibold text-gray-900">{Math.round(row.day)}</td>
                        <td className="px-3 py-2">{formatCurrency(row.spend)}</td>
                        <td className="px-3 py-2">{formatCurrency(row.revenue)}</td>
                        <td className="px-3 py-2">{formatCurrency(row.profit)}</td>
                        <td className="px-3 py-2">{formatPercent(row.roi)}</td>
                        <td className="px-3 py-2">{formatCount(row.clicks)}</td>
                        <td className="px-3 py-2">{formatCount(row.purchases)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="px-3 py-4 text-gray-500" colSpan={7}>Run forecast to view the generated time-series points.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function RangeInput({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (value: number) => void }) {
  return (
    <label className="text-sm text-gray-600">
      {label}
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(Number(event.target.value))}
        className="workspace-control"
      />
    </label>
  );
}

function EmptyChart({ text }: { text: string }) {
  return <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-gray-300 text-sm text-gray-500">{text}</div>;
}

function MetricCard({ title, value, icon }: { title: string; value: string; icon: ReactNode }) {
  return (
    <div className="workspace-metric-card">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{icon}{title}</div>
      <div className="break-words text-lg font-bold leading-tight text-gray-900 xl:text-xl">{value}</div>
    </div>
  );
}

function formatCurrency(value?: number): string {
  if (value === undefined || value === null) return '-';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}

function formatCurrencyCompact(value?: number): string {
  if (value === undefined || value === null) return '-';
  const abs = Math.abs(value);
  if (abs < 1_000_000) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

function formatPercent(value?: number): string {
  if (value === undefined || value === null) return '-';
  return `${(value * 100).toFixed(1)}%`;
}

function formatPercentCompact(value?: number): string {
  if (value === undefined || value === null) return '-';
  const asPercent = value * 100;
  const abs = Math.abs(asPercent);
  if (abs < 1000) {
    return `${asPercent.toFixed(1)}%`;
  }
  return `${new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(asPercent)}%`;
}

function formatCount(value?: number): string {
  if (value === undefined || value === null) return '-';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
}

function compactCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

function prettyKpiLabel(metric: string): string {
  const labels: Record<string, string> = {
    revenue: 'Revenue',
    profit: 'Profit',
    roi: 'ROI',
    spend: 'Spend',
    clicks: 'Clicks',
    purchases: 'Purchases',
    impressions: 'Impressions',
    ctr: 'CTR',
    conversion_rate: 'Conversion Rate',
  };
  return labels[metric] || 'KPI';
}

function formatKpiValue(metric: string, value?: number): string {
  if (value === undefined || value === null) return '-';
  if (metric === 'roi' || metric === 'ctr' || metric === 'conversion_rate') {
    return formatPercent(value);
  }
  if (metric === 'revenue' || metric === 'profit' || metric === 'spend') {
    return formatCurrency(value);
  }
  return formatCount(value);
}

function formatCompactKpi(metric: string, value: number): string {
  if (metric === 'roi' || metric === 'ctr' || metric === 'conversion_rate') {
    return `${Math.round(value * 100)}%`;
  }
  if (metric === 'revenue' || metric === 'profit' || metric === 'spend') {
    return compactCurrency(value);
  }
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

