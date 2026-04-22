import { Database, GitBranch, Settings2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
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
import { getAgentResults, getScenarioOptions, orchestrateAgents } from '../../services/api';
import {
  getMissingRequiredDatasets,
  hasRequiredClientDatasets,
  toFriendlyDataRequirementError,
} from '../../services/clientDataRequirements';
import AgentHeaderActions from '../shared/AgentHeaderActions';
import type { AgentOrchestrationResult, ScenarioAnalysis, ScenarioOptions } from '../../types';

interface ScenarioWorkspaceProps {
  clientId?: string;
  onRunResult?: (result: AgentOrchestrationResult) => void;
}

export default function ScenarioWorkspace({ clientId, onRunResult }: ScenarioWorkspaceProps) {
  const [options, setOptions] = useState<ScenarioOptions | null>(null);
  const [isLoadingOptions, setIsLoadingOptions] = useState(true);
  const [optionsError, setOptionsError] = useState<string | null>(null);

  const [horizonDays, setHorizonDays] = useState(90);
  const [kpiMetric, setKpiMetric] = useState('revenue');
  const [channel, setChannel] = useState('all');
  const [campaignType, setCampaignType] = useState('all');
  const [campaignId, setCampaignId] = useState('all');

  const [baseSpendChange, setBaseSpendChange] = useState(0);
  const [baseCtrLift, setBaseCtrLift] = useState(0);
  const [baseConversionLift, setBaseConversionLift] = useState(0);
  const [baseAovChange, setBaseAovChange] = useState(0);
  const [seasonalityFactor, setSeasonalityFactor] = useState(1);
  const [isAssumptionsOpen, setIsAssumptionsOpen] = useState(false);

  const [result, setResult] = useState<ScenarioAnalysis | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!clientId || result) return;
    let cancelled = false;

    const hydrateLastResult = async () => {
      try {
        const raw = await getAgentResults('scenario', clientId);
        if (cancelled) return;

        const response = (raw && typeof raw === 'object') ? (raw as Record<string, unknown>) : {};
        const persisted = response.results;
        const persistedRecord = (persisted && typeof persisted === 'object' && !Array.isArray(persisted))
          ? (persisted as Record<string, unknown>)
          : null;

        const maybeScenario = extractScenarioAnalysis(persistedRecord ?? response.results);
        if (maybeScenario) {
          setResult(maybeScenario);
        }
      } catch {
        // Ignore hydrate failures and keep manual run flow available.
      }
    };

    hydrateLastResult();
    return () => {
      cancelled = true;
    };
  }, [clientId, result]);

  useEffect(() => {
    let cancelled = false;

    const loadOptions = async () => {
      setIsLoadingOptions(true);
      setOptionsError(null);

      try {
        const response = await getScenarioOptions(clientId);
        if (!response.success || !response.data) {
          throw new Error(response.detail || 'Unable to load scenario options from Supabase.');
        }
        if (cancelled) return;

        setOptions(response.data);
        setHorizonDays(response.data.defaults.horizon_days || 90);
        setKpiMetric(response.data.defaults.kpi_metric || 'revenue');
        setChannel(response.data.defaults.channel || 'all');
        setCampaignType(response.data.defaults.campaign_type || 'all');
        setCampaignId(response.data.defaults.campaign_id || 'all');
        setBaseSpendChange(response.data.defaults.base_spend_change_pct || 0);
        setBaseCtrLift(response.data.defaults.base_ctr_lift_pct || 0);
        setBaseConversionLift(response.data.defaults.base_conversion_lift_pct || 0);
        setBaseAovChange(response.data.defaults.base_aov_change_pct || 0);
      } catch (loadError) {
        if (cancelled) return;
        setOptionsError(loadError instanceof Error ? loadError.message : 'Unable to load scenario options.');
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
  }, [clientId]);

  const optionsSourceLabel = useMemo(() => {
    const source = options?.sources?.campaigns || '';
    return source.toLowerCase() === 'supabase' ? 'Supabase' : source || '-';
  }, [options]);
  const hasRequiredClientData = useMemo(
    () => hasRequiredClientDatasets('scenario', options?.sources, clientId),
    [options?.sources, clientId],
  );
  const missingDatasets = useMemo(
    () => getMissingRequiredDatasets('scenario', options?.sources, clientId),
    [options?.sources, clientId],
  );
  const dataRequirementMessage = useMemo(
    () => toFriendlyDataRequirementError('Scenario analysis', 'scenario', '', missingDatasets),
    [missingDatasets],
  );
  const showMissingDataRequirementCard = !isLoadingOptions && Boolean(clientId) && Boolean(options?.sources) && !hasRequiredClientData && !error && !optionsError;

  const projectionCurve = result?.projection_curve ?? [];
  const sensitivityCurve = result?.sensitivity_curve ?? [];
  const channelScenario = result?.channel_scenario ?? [];
  const scenarioTable = result?.scenario_table ?? [];

  const runScenario = async () => {
    if (!hasRequiredClientData) {
      setError(dataRequirementMessage);
      return;
    }

    setIsRunning(true);
    setError(null);

    try {
      const response = await orchestrateAgents({
        intent: 'scenario_forecast',
        agents: ['scenario'],
        client_id: clientId,
        payload: {
          horizon_days: horizonDays,
          kpi_metric: kpiMetric,
          channel,
          campaign_type: campaignType,
          campaign_id: campaignId,
          base_spend_change_pct: baseSpendChange,
          base_ctr_lift_pct: baseCtrLift,
          base_conversion_lift_pct: baseConversionLift,
          base_aov_change_pct: baseAovChange,
          seasonality_factor: seasonalityFactor,
        },
      });

      if (!response.success || !response.data?.success) {
        throw new Error(response.detail || response.data?.errors?.system || 'Failed to run scenario analysis.');
      }

      onRunResult?.(response.data);

      const analysis = extractScenarioAnalysis(response.data);
      if (!analysis) {
        throw new Error('Scenario run completed but no scenario output was returned.');
      }
      setResult(analysis);
    } catch (runError) {
      const rawMessage = runError instanceof Error ? runError.message : 'Failed to run scenario analysis.';
      setError(toFriendlyDataRequirementError('Scenario analysis', 'scenario', rawMessage, missingDatasets));
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="workspace-surface workspace-modern">
      <div className="workspace-header-glass workspace-header-glass-modern px-8 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="workspace-agent-icon">
              <GitBranch className="h-7 w-7" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-gray-900">Scenario Agent</h1>
          </div>
          <AgentHeaderActions clientId={clientId} />
        </div>
      </div>

      <div className="workspace-content">
        <div className="mx-auto w-full max-w-6xl space-y-6">
          <div className="workspace-panel">
            <div className="mb-4 flex flex-wrap items-center gap-3 text-xs text-gray-500">
              <span className="workspace-option-pill">
                <Database className="h-3.5 w-3.5" /> Source: {optionsSourceLabel}
              </span>
              {options?.row_counts?.campaigns ? (
                <span className="workspace-option-pill">
                  Campaign rows: {formatCount(options.row_counts.campaigns)}
                </span>
              ) : null}
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <label className="text-sm text-gray-600">
                Horizon Days
                <select
                  value={horizonDays}
                  onChange={(event) => setHorizonDays(Number(event.target.value))}
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
                KPI
                <select
                  value={kpiMetric}
                  onChange={(event) => setKpiMetric(event.target.value)}
                  className="workspace-control"
                  disabled={isLoadingOptions}
                >
                  {(options?.kpi_metrics ?? ['revenue']).map((item) => (
                    <option key={item} value={item}>{prettyLabel(item)}</option>
                  ))}
                </select>
              </label>

              <label className="text-sm text-gray-600">
                Channel
                <select
                  value={channel}
                  onChange={(event) => setChannel(event.target.value)}
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
                  value={campaignType}
                  onChange={(event) => setCampaignType(event.target.value)}
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
                Campaign
                <select
                  value={campaignId}
                  onChange={(event) => setCampaignId(event.target.value)}
                  className="workspace-control"
                  disabled={isLoadingOptions || !options?.available_filters.campaign_id}
                >
                  <option value="all">All Campaigns</option>
                  {(options?.campaign_ids ?? []).map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-5 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsAssumptionsOpen((prev) => !prev)}
                className="workspace-action-btn bg-gray-900 text-white"
              >
                <Settings2 className="h-4 w-4" /> {isAssumptionsOpen ? 'Hide Assumptions' : 'Advanced Assumptions'}
              </button>
              <button onClick={runScenario} disabled={isRunning || isLoadingOptions || !hasRequiredClientData} className="workspace-action-btn disabled:opacity-60">
                {isRunning ? 'Running...' : 'Generate Scenarios'}
              </button>
            </div>

            {isAssumptionsOpen ? (
              <div className="mt-5 grid gap-4 rounded-2xl border border-gray-200 bg-gray-50 p-4 sm:grid-cols-2 xl:grid-cols-5">
                <SliderField label="Base Spend Change" unit="%" min={-40} max={60} step={1} value={baseSpendChange} onChange={setBaseSpendChange} />
                <SliderField label="Base CTR Lift" unit="%" min={-30} max={50} step={1} value={baseCtrLift} onChange={setBaseCtrLift} />
                <SliderField label="Base Conversion Lift" unit="%" min={-30} max={50} step={1} value={baseConversionLift} onChange={setBaseConversionLift} />
                <SliderField label="Base AOV Change" unit="%" min={-30} max={50} step={1} value={baseAovChange} onChange={setBaseAovChange} />
                <label className="rounded-2xl border border-gray-200 bg-white p-4 text-sm text-gray-700">
                  <div className="mb-2 font-medium text-gray-700">Seasonality Factor</div>
                  <input
                    type="number"
                    min={0.2}
                    max={3}
                    step={0.05}
                    value={seasonalityFactor}
                    onChange={(event) => setSeasonalityFactor(Number(event.target.value))}
                    className="workspace-control mt-0"
                  />
                </label>
              </div>
            ) : null}

            {error && (
              <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
                <p className="text-sm font-semibold text-amber-900">Scenario Unavailable</p>
                <p className="mt-1 text-sm text-amber-800">{error}</p>
              </div>
            )}
            {optionsError && (
              <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
                <p className="text-sm font-semibold text-amber-900">Data Requirement</p>
                <p className="mt-1 text-sm text-amber-800">
                  {toFriendlyDataRequirementError('Scenario analysis', 'scenario', optionsError, missingDatasets)}
                </p>
              </div>
            )}
            {showMissingDataRequirementCard && (
              <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
                <p className="text-sm font-semibold text-amber-900">Data Requirement</p>
                <p className="mt-1 text-sm text-amber-800">{dataRequirementMessage}</p>
              </div>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <ScenarioCard
              title="Best Case"
              metricLabel={prettyLabel(kpiMetric)}
              metric={getScenarioCaseMetric(result?.best_case, kpiMetric)}
              metricKey={kpiMetric}
              tone="green"
            />
            <ScenarioCard
              title="Base Case"
              metricLabel={prettyLabel(kpiMetric)}
              metric={getScenarioCaseMetric(result?.base_case, kpiMetric)}
              metricKey={kpiMetric}
              tone="violet"
            />
            <ScenarioCard
              title="Worst Case"
              metricLabel={prettyLabel(kpiMetric)}
              metric={getScenarioCaseMetric(result?.worst_case, kpiMetric)}
              metricKey={kpiMetric}
              tone="red"
            />
          </div>

          <div className="workspace-panel">
            <h3 className="text-lg font-semibold text-gray-900">Baseline Metrics</h3>
            <div className="mt-4 grid gap-4 md:grid-cols-3 lg:grid-cols-6">
              <MetricCard title="Revenue" value={formatCurrencyCompact(result?.baseline_metrics?.revenue)} />
              <MetricCard title="Spend" value={formatCurrencyCompact(result?.baseline_metrics?.spend)} />
              <MetricCard title="Profit" value={formatCurrencyCompact(result?.baseline_metrics?.profit)} />
              <MetricCard title="ROI" value={formatPercentCompact(result?.baseline_metrics?.roi)} />
              <MetricCard title="Clicks" value={formatCount(result?.baseline_metrics?.clicks)} />
              <MetricCard title="Purchases" value={formatCount(result?.baseline_metrics?.purchases)} />
            </div>
          </div>

          <div className="grid gap-6">
            <div className="workspace-panel">
              <h3 className="text-lg font-semibold text-gray-900">Scenario Projection Curve</h3>
              <p className="mt-1 text-sm text-gray-500">Cumulative projection by scenario across horizon.</p>
              <div className="mt-4 h-[320px] w-full">
                {projectionCurve.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={projectionCurve} margin={{ top: 8, right: 20, left: 8, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="day" tickFormatter={(value) => `D${value}`} />
                      <YAxis tickFormatter={(value) => compactCurrency(Number(value))} />
                      <Tooltip formatter={(value: number) => formatCurrency(Number(value))} labelFormatter={(label) => `Day ${label}`} />
                      <Legend />
                      <Line type="monotone" dataKey="best" stroke="#16a34a" strokeWidth={2.5} dot={false} name="Best" />
                      <Line type="monotone" dataKey="base" stroke="#7c3aed" strokeWidth={2.5} dot={false} name="Base" />
                      <Line type="monotone" dataKey="worst" stroke="#dc2626" strokeWidth={2.5} dot={false} name="Worst" />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyChart text="Run scenario to render projection curve." />
                )}
              </div>
            </div>

            <div className="workspace-panel">
              <h3 className="text-lg font-semibold text-gray-900">Spend Sensitivity</h3>
              <p className="mt-1 text-sm text-gray-500">How KPI changes with spend deltas around your base assumption.</p>
              <div className="mt-4 h-[320px] w-full">
                {sensitivityCurve.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={sensitivityCurve} margin={{ top: 8, right: 20, left: 8, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="delta" tickFormatter={(value) => `${value}%`} />
                      <YAxis yAxisId="left" tickFormatter={(value) => compactCurrency(Number(value))} />
                      <YAxis yAxisId="right" orientation="right" tickFormatter={(value) => `${Math.round(Number(value) * 100)}%`} />
                      <Tooltip formatter={(value: number, name: string) => (name === 'ROI' ? formatPercent(value) : formatCurrency(value))} />
                      <Legend />
                      <Line yAxisId="left" type="monotone" dataKey="revenue" stroke="#2563eb" strokeWidth={2.5} dot={false} name="Revenue" />
                      <Line yAxisId="left" type="monotone" dataKey="profit" stroke="#10b981" strokeWidth={2.5} dot={false} name="Profit" />
                      <Line yAxisId="right" type="monotone" dataKey="roi" stroke="#f97316" strokeWidth={2.2} dot={false} name="ROI" />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyChart text="Run scenario to render sensitivity view." />
                )}
              </div>
            </div>
          </div>

          <div className="workspace-panel">
            <h3 className="text-lg font-semibold text-gray-900">Channel Scenario Comparison</h3>
            <div className="mt-4 h-[340px] w-full">
              {channelScenario.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={channelScenario} margin={{ top: 8, right: 20, left: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="channel" />
                    <YAxis tickFormatter={(value) => compactCurrency(Number(value))} />
                    <Tooltip formatter={(value: number) => formatCurrency(Number(value))} />
                    <Legend />
                    <Bar dataKey="best_revenue" name="Best" fill="#22c55e" radius={[8, 8, 0, 0]} />
                    <Bar dataKey="base_revenue" name="Base" fill="#7c3aed" radius={[8, 8, 0, 0]} />
                    <Bar dataKey="worst_revenue" name="Worst" fill="#ef4444" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyChart text="Run scenario to compare channel outcomes." />
              )}
            </div>
          </div>

          <div className="workspace-panel">
            <h3 className="text-lg font-semibold text-gray-900">Scenario Table</h3>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-gray-500">
                  <tr>
                    <th className="px-3 py-2">Scenario</th>
                    <th className="px-3 py-2">Revenue</th>
                    <th className="px-3 py-2">Spend</th>
                    <th className="px-3 py-2">Profit</th>
                    <th className="px-3 py-2">ROI</th>
                    <th className="px-3 py-2">Clicks</th>
                    <th className="px-3 py-2">Purchases</th>
                  </tr>
                </thead>
                <tbody>
                  {scenarioTable.length > 0 ? (
                    scenarioTable.map((row) => (
                      <tr key={row.scenario} className="border-t border-gray-100">
                        <td className="px-3 py-2 font-semibold text-gray-900">{row.scenario}</td>
                        <td className="px-3 py-2">{formatCurrency(row.revenue)}</td>
                        <td className="px-3 py-2">{formatCurrency(row.spend)}</td>
                        <td className="px-3 py-2">{formatCurrency(row.profit)}</td>
                        <td className="px-3 py-2">{formatPercent(row.roi)}</td>
                        <td className="px-3 py-2">{formatCount(row.clicks)}</td>
                        <td className="px-3 py-2">{formatCount(row.purchases)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="px-3 py-4 text-gray-500" colSpan={7}>Run scenario to generate scenario outputs.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="workspace-panel">
            <h3 className="text-lg font-semibold text-gray-900">Assumptions Used</h3>
            <ul className="mt-4 space-y-2 text-sm text-gray-700">
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
      </div>
    </div>
  );
}

function SliderField({
  label,
  unit,
  min,
  max,
  step,
  value,
  onChange,
}: {
  label: string;
  unit?: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
}) {
  const handleTypedChange = (raw: string) => {
    if (raw.trim() === '') return;
    const parsed = Number(raw);
    if (Number.isNaN(parsed)) return;
    onChange(clampToRange(parsed, min, max));
  };

  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
      <div className="mb-2">
        <label className="text-sm font-medium text-gray-700">{label}</label>
      </div>

      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => handleTypedChange(event.target.value)}
        onBlur={() => onChange(clampToRange(value, min, max))}
        className="workspace-control mt-0"
      />

      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-3 w-full cursor-pointer accent-blue-600"
      />
    </div>
  );
}

function clampToRange(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function ScenarioCard({
  title,
  metricLabel,
  metric,
  metricKey,
  tone,
}: {
  title: string;
  metricLabel: string;
  metric?: number;
  metricKey: string;
  tone: 'green' | 'violet' | 'red';
}) {
  const toneClass: Record<'green' | 'violet' | 'red', string> = {
    green: 'border-gray-200 bg-gray-50',
    violet: 'border-gray-200 bg-gray-50',
    red: 'border-gray-200 bg-gray-50',
  };

  return (
    <div className={`workspace-metric-card border ${toneClass[tone]}`}>
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-600">{title}</div>
      <div className="mt-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{metricLabel}</div>
      <div className="mt-1 break-words text-2xl font-bold leading-tight text-gray-900">
        {formatScenarioMetricValue(metricKey, metric)}
      </div>
    </div>
  );
}

function MetricCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="workspace-metric-card bg-gray-50 p-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</div>
      <div className="mt-2 break-words text-lg font-bold leading-tight text-gray-900">{value}</div>
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
    return formatCurrency(value);
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
  if (abs < 1000) return `${asPercent.toFixed(1)}%`;
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

function prettyLabel(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function EmptyChart({ text }: { text: string }) {
  return <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-gray-300 text-sm text-gray-500">{text}</div>;
}

function getScenarioCaseMetric(
  row: { revenue?: number; roi?: number; profit?: number; spend?: number; clicks?: number; purchases?: number } | undefined,
  metric: string,
): number | undefined {
  if (!row) return undefined;
  const key = (metric || 'revenue').trim().toLowerCase();
  const map: Record<string, number | undefined> = {
    revenue: row.revenue,
    profit: row.profit,
    roi: row.roi,
    spend: row.spend,
    clicks: row.clicks,
    purchases: row.purchases,
  };
  return map[key] ?? row.revenue;
}

function formatScenarioMetricValue(metric: string, value?: number): string {
  if (value === undefined || value === null) return '-';
  const key = (metric || 'revenue').trim().toLowerCase();
  if (key === 'roi' || key === 'ctr' || key === 'conversion_rate') {
    return formatPercentCompact(value);
  }
  if (key === 'revenue' || key === 'profit' || key === 'spend') {
    return formatCurrencyCompact(value);
  }
  return formatCount(value);
}

function extractScenarioAnalysis(payload: unknown): ScenarioAnalysis | null {
  if (!payload || typeof payload !== 'object') return null;
  const obj = payload as Record<string, unknown>;

  const candidates: unknown[] = [
    obj.scenario_analysis,
    (obj.agent_results as Record<string, unknown> | undefined)?.scenario,
    (obj.result as Record<string, unknown> | undefined)?.scenario_analysis,
    (obj.data as Record<string, unknown> | undefined)?.scenario_analysis,
    ((obj.data as Record<string, unknown> | undefined)?.agent_results as Record<string, unknown> | undefined)?.scenario,
    obj,
  ];

  for (const item of candidates) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const rec = item as Record<string, unknown>;
    if (Object.keys(rec).length === 0) continue;
    if (
      rec.best_case !== undefined ||
      rec.scenario_table !== undefined ||
      rec.projection_curve !== undefined
    ) {
      return rec as unknown as ScenarioAnalysis;
    }
  }
  return null;
}

