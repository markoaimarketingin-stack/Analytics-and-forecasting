import { Network, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { getAgentResults, getAttributionOptions, orchestrateAgents } from '../../services/api';
import {
  getMissingRequiredDatasets,
  hasRequiredClientDatasets,
  toFriendlyDataRequirementError,
} from '../../services/clientDataRequirements';
import AgentHeaderActions from '../shared/AgentHeaderActions';
import type {
  AgentOrchestrationResult,
  AttributionAnalysis,
  AttributionOptions,
} from '../../types';

interface AttributionWorkspaceProps {
  clientId?: string;
  onRunResult?: (result: AgentOrchestrationResult) => void;
}

type AttributionTab = 'credit' | 'touchpoints' | 'scenario' | 'efficiency' | 'quality';

const DEFAULT_OPTIONS: AttributionOptions = {
  channels: [],
  campaign_types: [],
  attribution_models: ['linear', 'first_click', 'last_click', 'time_decay'],
  metrics: ['revenue', 'roas', 'roi', 'cac', 'cpa', 'conversions'],
  defaults: {
    channel: 'all',
    campaign_type: 'all',
    attribution_model: 'linear',
    metric: 'revenue',
    budget_shift_cap_percent: 20,
    start_date: '',
    end_date: '',
  },
  available_filters: {
    channel: false,
    campaign_type: false,
    date_range: false,
  },
  sources: {},
  row_counts: {},
};

export default function AttributionWorkspace({ clientId, onRunResult }: AttributionWorkspaceProps) {
  const [options, setOptions] = useState<AttributionOptions>(DEFAULT_OPTIONS);
  const [attributionModel, setAttributionModel] = useState('linear');
  const [metric, setMetric] = useState('revenue');
  const [channel, setChannel] = useState('all');
  const [campaignType, setCampaignType] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [shiftCap, setShiftCap] = useState(20);
  const [result, setResult] = useState<AttributionAnalysis | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isLoadingOptions, setIsLoadingOptions] = useState(false);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<AttributionTab>('credit');

  useEffect(() => {
    let cancelled = false;

    const loadOptions = async () => {
      setIsLoadingOptions(true);
      setOptionsError(null);
      try {
        const response = await getAttributionOptions(clientId);
        if (!response.success || !response.data) {
          throw new Error(response.detail || 'Unable to load attribution options.');
        }
        if (cancelled) return;

        const loaded = response.data;
        setOptions(loaded);
        setAttributionModel(loaded.defaults.attribution_model || 'linear');
        setMetric(loaded.defaults.metric || 'revenue');
        setChannel(loaded.defaults.channel || 'all');
        setCampaignType(loaded.defaults.campaign_type || 'all');
        setShiftCap(Number(loaded.defaults.budget_shift_cap_percent || 20));
        setStartDate(loaded.defaults.start_date || loaded.date_range?.min || '');
        setEndDate(loaded.defaults.end_date || loaded.date_range?.max || '');
      } catch (loadError) {
        if (cancelled) return;
        const rawMessage = loadError instanceof Error ? loadError.message : 'Unable to load attribution options.';
        setOptionsError(toFriendlyDataRequirementError('Attribution analysis', 'attribution', rawMessage));
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

  useEffect(() => {
    if (!clientId || result) return;
    let cancelled = false;

    const hydrateLastResult = async () => {
      try {
        const raw = await getAgentResults('attribution', clientId);
        if (cancelled) return;

        const response = (raw && typeof raw === 'object') ? (raw as Record<string, unknown>) : {};
        const persisted = response.results;
        const persistedRecord = (persisted && typeof persisted === 'object' && !Array.isArray(persisted))
          ? (persisted as Record<string, unknown>)
          : null;

        const maybeAttribution = persistedRecord?.attribution_analysis ?? persistedRecord;
        if (maybeAttribution && typeof maybeAttribution === 'object' && Object.keys(maybeAttribution as Record<string, unknown>).length > 0) {
          setResult(maybeAttribution as AttributionAnalysis);
        }
      } catch {
        // Hydration is best-effort; do nothing.
      }
    };

    hydrateLastResult();
    return () => {
      cancelled = true;
    };
  }, [clientId, result]);

  const channels = useMemo(() => result?.channel_summary ?? [], [result]);
  const summary = result?.summary_metrics;
  const modelCreditChart = result?.model_credit_chart ?? channels;
  const touchpointChart = result?.touchpoint_position_chart ?? [];
  const budgetScenarioChart = result?.budget_scenario_chart ?? [];
  const efficiencyChart = result?.efficiency_chart ?? [];
  const qualityChart = result?.conversion_quality_chart ?? [];
  const hasRequiredClientData = useMemo(
    () => hasRequiredClientDatasets('attribution', options?.sources, clientId),
    [options?.sources, clientId],
  );
  const missingDatasets = useMemo(
    () => getMissingRequiredDatasets('attribution', options?.sources, clientId),
    [options?.sources, clientId],
  );
  const dataRequirementMessage = useMemo(
    () => toFriendlyDataRequirementError('Attribution analysis', 'attribution', '', missingDatasets),
    [missingDatasets],
  );
  const showMissingDataRequirementCard = !isLoadingOptions && Boolean(clientId) && Boolean(options?.sources) && !hasRequiredClientData && !error && !optionsError;

  const runAttribution = async () => {
    if (!hasRequiredClientData) {
      setError(dataRequirementMessage);
      return;
    }

    setIsRunning(true);
    setError(null);

    try {
      const response = await orchestrateAgents({
        intent: 'attribution_analysis',
        agents: ['attribution'],
        client_id: clientId,
        payload: {
          attribution_model: attributionModel,
          metric,
          channel,
          campaign_type: campaignType,
          start_date: startDate || null,
          end_date: endDate || null,
          budget_shift_cap_percent: shiftCap,
        },
      });

      if (!response.success || !response.data?.success) {
        throw new Error(response.detail || response.data?.errors?.system || 'Failed to run attribution agent.');
      }

      onRunResult?.(response.data);
      setResult(response.data.attribution_analysis ?? null);
    } catch (runError) {
      const rawMessage = runError instanceof Error ? runError.message : 'Failed to run attribution agent.';
      setError(toFriendlyDataRequirementError('Attribution analysis', 'attribution', rawMessage, missingDatasets));
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
              <Network className="h-7 w-7" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-gray-900">Attribution Agent</h1>
          </div>
          <AgentHeaderActions clientId={clientId} />
        </div>
      </div>

      <div className="workspace-content">
        <div className="mx-auto w-full max-w-6xl space-y-6">
          <div className="workspace-panel">
            <div className="grid gap-4 md:grid-cols-4">
              <label className="text-sm text-gray-600">
                Attribution Model
                <select value={attributionModel} onChange={(event) => setAttributionModel(event.target.value)} className="workspace-control">
                  {options.attribution_models.map((model) => (
                    <option key={model} value={model}>{toLabel(model)}</option>
                  ))}
                </select>
              </label>

              <label className="text-sm text-gray-600">
                Optimization Metric
                <select value={metric} onChange={(event) => setMetric(event.target.value)} className="workspace-control">
                  {options.metrics.map((item) => (
                    <option key={item} value={item}>{toLabel(item)}</option>
                  ))}
                </select>
              </label>

              <label className="text-sm text-gray-600">
                Channel
                <select value={channel} onChange={(event) => setChannel(event.target.value)} className="workspace-control">
                  <option value="all">All</option>
                  {options.channels.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </label>

              <label className="text-sm text-gray-600">
                Campaign Type
                <select value={campaignType} onChange={(event) => setCampaignType(event.target.value)} className="workspace-control">
                  <option value="all">All</option>
                  {options.campaign_types.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-4">
              <label className="text-sm text-gray-600">
                Start Date
                <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="workspace-control" />
              </label>

              <label className="text-sm text-gray-600">
                End Date
                <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className="workspace-control" />
              </label>

              <label className="text-sm text-gray-600">
                Max Budget Shift (%)
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={shiftCap}
                  onChange={(event) => setShiftCap(Number(event.target.value) || 0)}
                  className="workspace-control"
                />
              </label>

              <div className="flex items-end">
                <button onClick={runAttribution} disabled={isRunning || isLoadingOptions || !hasRequiredClientData} className="workspace-action-btn w-full bg-gradient-to-r from-blue-600 to-indigo-600 disabled:opacity-60">
                   {isRunning ? 'Running...' : 'Analyze Attribution'}
                </button>
              </div>
            </div>

            {optionsError && (
              <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
                <p className="text-sm font-semibold text-amber-900">Data Requirement</p>
                <p className="mt-1 text-sm text-amber-800">{optionsError}</p>
              </div>
            )}
            {error && (
              <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
                <p className="text-sm font-semibold text-amber-900">Attribution Unavailable</p>
                <p className="mt-1 text-sm text-amber-800">{error}</p>
              </div>
            )}
            {showMissingDataRequirementCard && (
              <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
                <p className="text-sm font-semibold text-amber-900">Data Requirement</p>
                <p className="mt-1 text-sm text-amber-800">{dataRequirementMessage}</p>
              </div>
            )}
            {result?.data_source && <p className="mt-3 text-xs text-gray-500">Data source: {result.data_source}</p>}
          </div>

          <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
            <InfoCard title="ROAS" value={formatMetric(summary?.blended_roas, 'ratio')} />
            <InfoCard title="ROI" value={formatMetric(summary?.blended_roi, 'percent')} />
            <InfoCard title="CAC" value={formatMetric(summary?.blended_cac, 'currency')} />
            <InfoCard title="CPA" value={formatMetric(summary?.blended_cpa, 'currency')} />
            <InfoCard title="CTR" value={formatMetric(summary?.ctr, 'percent')} />
            <InfoCard title="CVR" value={formatMetric(summary?.conversion_rate, 'percent')} />
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <InfoCard title="Best Channel" value={result?.best_channel || '-'} />
            <InfoCard title="Worst Channel" value={result?.worst_channel || '-'} />
            <InfoCard
              title="Recommended Shift"
              value={result?.recommended_shift?.percent ? `${result.recommended_shift.percent}%` : '-'}
              helper={
                result?.recommended_shift?.from && result?.recommended_shift?.to
                  ? `${result.recommended_shift.from} -> ${result.recommended_shift.to} (${toLabel(result.recommended_shift.driver_metric || metric)})`
                  : 'Run analysis to get budget recommendation.'
              }
            />
          </div>

          <div className="workspace-panel">
            <div className="flex flex-wrap gap-2">
              <TabButton label="Model Credit" active={activeTab === 'credit'} onClick={() => setActiveTab('credit')} />
              <TabButton label="Touchpoint Mix" active={activeTab === 'touchpoints'} onClick={() => setActiveTab('touchpoints')} />
              <TabButton label="Budget Scenario" active={activeTab === 'scenario'} onClick={() => setActiveTab('scenario')} />
              <TabButton label="Efficiency" active={activeTab === 'efficiency'} onClick={() => setActiveTab('efficiency')} />
              <TabButton label="Conversion Quality" active={activeTab === 'quality'} onClick={() => setActiveTab('quality')} />
            </div>

            {activeTab === 'credit' && (
              <ChartWrap
                title="Attribution Credit by Model"
                description="Compare first-touch, last-touch, linear, time-decay, and blended credit by channel."
                emptyText="Run attribution analysis to render model credit chart."
                hasData={modelCreditChart.length > 0}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={modelCreditChart} margin={{ top: 8, right: 20, left: 10, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="channel" />
                    <YAxis tickFormatter={(value) => compactCurrency(Number(value))} />
                    <Tooltip formatter={(value: number) => formatCurrency(Number(value))} />
                    <Legend />
                    <Bar dataKey="first_touch_revenue" name="First Touch" fill="#60a5fa" radius={[8, 8, 0, 0]} />
                    <Bar dataKey="last_touch_revenue" name="Last Touch" fill="#f97316" radius={[8, 8, 0, 0]} />
                    <Bar dataKey="linear_revenue" name="Linear" fill="#a78bfa" radius={[8, 8, 0, 0]} />
                    <Bar dataKey="time_decay_revenue" name="Time Decay" fill="#38bdf8" radius={[8, 8, 0, 0]} />
                    <Bar dataKey="blended_revenue" name="Blended" fill="#10b981" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartWrap>
            )}

            {activeTab === 'touchpoints' && (
              <ChartWrap
                title="Touchpoint Position Mix"
                description="Understand where each channel appears in customer journeys."
                emptyText="Touchpoint mix needs event journey data."
                hasData={touchpointChart.length > 0}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={touchpointChart} margin={{ top: 8, right: 20, left: 10, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="channel" />
                    <YAxis />
                    <Tooltip formatter={(value: number) => formatCount(Number(value))} />
                    <Legend />
                    <Bar dataKey="first_touch_count" name="First Touch" stackId="touch" fill="#3b82f6" />
                    <Bar dataKey="middle_touch_count" name="Middle Touch" stackId="touch" fill="#f59e0b" />
                    <Bar dataKey="last_touch_count" name="Last Touch" stackId="touch" fill="#22c55e" />
                  </BarChart>
                </ResponsiveContainer>
              </ChartWrap>
            )}

            {activeTab === 'scenario' && (
              <ChartWrap
                title="Budget Shift Scenario"
                description="Compare current vs projected revenue after recommended budget reallocation."
                emptyText="Run analysis to simulate budget scenario impact."
                hasData={budgetScenarioChart.length > 0}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={budgetScenarioChart} margin={{ top: 8, right: 20, left: 10, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="channel" />
                    <YAxis tickFormatter={(value) => compactCurrency(Number(value))} />
                    <Tooltip formatter={(value: number) => formatCurrency(Number(value))} />
                    <Legend />
                    <Bar dataKey="current_revenue" name="Current Revenue" fill="#94a3b8" radius={[8, 8, 0, 0]} />
                    <Bar dataKey="projected_revenue" name="Projected Revenue" fill="#ef4444" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartWrap>
            )}

            {activeTab === 'efficiency' && (
              <ChartWrap
                title="Channel Efficiency"
                description="ROAS, ROI, CAC and CPA by channel using real campaign and attribution outputs."
                emptyText="Run analysis to render efficiency metrics."
                hasData={efficiencyChart.length > 0}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={efficiencyChart} margin={{ top: 8, right: 20, left: 10, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="channel" />
                    <YAxis />
                    <Tooltip formatter={(value: number, name: string) => name.toLowerCase().includes('cac') || name.toLowerCase().includes('cpa') ? formatCurrency(Number(value)) : formatDecimal(Number(value))} />
                    <Legend />
                    <Bar dataKey="roas" name="ROAS" fill="#6366f1" radius={[8, 8, 0, 0]} />
                    <Bar dataKey="roi" name="ROI" fill="#0ea5e9" radius={[8, 8, 0, 0]} />
                    <Bar dataKey="cac" name="CAC" fill="#ef4444" radius={[8, 8, 0, 0]} />
                    <Bar dataKey="cpa" name="CPA" fill="#f59e0b" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartWrap>
            )}

            {activeTab === 'quality' && (
              <ChartWrap
                title="Conversion Quality"
                description="CTR and conversion rate by channel with purchase and AOV context."
                emptyText="Run analysis to render conversion quality metrics."
                hasData={qualityChart.length > 0}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={qualityChart} margin={{ top: 8, right: 20, left: 10, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="channel" />
                    <YAxis tickFormatter={(value) => `${(Number(value) * 100).toFixed(0)}%`} />
                    <Tooltip formatter={(value: number) => `${(Number(value) * 100).toFixed(2)}%`} />
                    <Legend />
                    <Bar dataKey="ctr" name="CTR" fill="#14b8a6" radius={[8, 8, 0, 0]} />
                    <Bar dataKey="conversion_rate" name="Conversion Rate" fill="#8b5cf6" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartWrap>
            )}
          </div>

          <div className="workspace-panel">
            <h3 className="text-lg font-semibold text-gray-900">Channel Attribution Breakdown</h3>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-gray-500">
                  <tr>
                    <th className="px-3 py-2">Channel</th>
                    <th className="px-3 py-2">Blended Rev</th>
                    <th className="px-3 py-2">Spend</th>
                    <th className="px-3 py-2">ROAS</th>
                    <th className="px-3 py-2">ROI</th>
                    <th className="px-3 py-2">CAC</th>
                    <th className="px-3 py-2">CPA</th>
                    <th className="px-3 py-2">CTR</th>
                    <th className="px-3 py-2">CVR</th>
                    <th className="px-3 py-2">Weight</th>
                  </tr>
                </thead>
                <tbody>
                  {channels.length > 0 ? (
                    channels.map((row) => (
                      <tr key={row.channel} className="border-t border-gray-100">
                        <td className="px-3 py-2 font-semibold text-gray-900">{row.channel}</td>
                        <td className="px-3 py-2">{formatCurrency(row.blended_revenue)}</td>
                        <td className="px-3 py-2">{formatCurrency(row.spend)}</td>
                        <td className="px-3 py-2">{formatDecimal(row.blended_roas)}</td>
                        <td className="px-3 py-2">{formatPercent(row.blended_roi)}</td>
                        <td className="px-3 py-2">{formatCurrency(row.cac)}</td>
                        <td className="px-3 py-2">{formatCurrency(row.cpa)}</td>
                        <td className="px-3 py-2">{formatPercent(row.ctr)}</td>
                        <td className="px-3 py-2">{formatPercent(row.conversion_rate)}</td>
                        <td className="px-3 py-2">{formatPercent(result?.channel_weights?.[row.channel])}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="px-3 py-4 text-gray-500" colSpan={10}>No attribution output yet. Run analysis to populate this table.</td>
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

function ChartWrap({
  title,
  description,
  hasData,
  emptyText,
  children,
}: {
  title: string;
  description: string;
  hasData: boolean;
  emptyText: string;
  children: ReactNode;
}) {
  return (
    <div className="mt-4">
      <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
      <p className="mt-1 text-sm text-gray-500">{description}</p>
      <div className="mt-4 h-[360px] w-full">
        {hasData ? children : <EmptyChart text={emptyText} />}
      </div>
    </div>
  );
}

function InfoCard({ title, value, helper }: { title: string; value: string; helper?: string }) {
  return (
    <div className="workspace-metric-card">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</div>
      <div className="mt-2 text-xl font-bold text-gray-900">{value}</div>
      {helper && <div className="mt-2 text-xs text-gray-500">{helper}</div>}
    </div>
  );
}

function formatCurrency(value?: number): string {
  if (value === undefined || value === null) return '-';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}

function formatPercent(value?: number): string {
  if (value === undefined || value === null) return '-';
  return `${(value * 100).toFixed(2)}%`;
}

function formatDecimal(value?: number): string {
  if (value === undefined || value === null) return '-';
  return Number(value).toFixed(2);
}

function toLabel(value: string): string {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`workspace-tab ${
        active
          ? 'border border-gray-900 bg-gray-900 text-white shadow-[0_10px_24px_rgba(15,23,42,0.24)]'
          : 'border border-gray-200 bg-gray-100/80 text-gray-700 hover:bg-white'
      }`}
    >
      {label}
    </button>
  );
}

function EmptyChart({ text }: { text: string }) {
  return <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-gray-300 text-sm text-gray-500">{text}</div>;
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

function formatMetric(value: number | undefined, mode: 'currency' | 'percent' | 'ratio'): string {
  if (value === undefined || value === null) return '-';
  if (mode === 'currency') return formatCurrency(value);
  if (mode === 'percent') return formatPercent(value);
  return formatDecimal(value);
}
