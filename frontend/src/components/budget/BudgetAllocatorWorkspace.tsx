import { DollarSign, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
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
import {
  getAgentResults,
  getBudgetAllocatorOptions,
  runBudgetAllocator,
} from '../../services/api';
import type {
  AgentOrchestrationResult,
  BudgetAllocationAnalysis,
  BudgetAllocatorOptions,
} from '../../types';

interface BudgetAllocatorWorkspaceProps {
  clientId?: string;
  onRunResult?: (result: AgentOrchestrationResult) => void;
}

export default function BudgetAllocatorWorkspace({ clientId, onRunResult }: BudgetAllocatorWorkspaceProps) {
  const [options, setOptions] = useState<BudgetAllocatorOptions | null>(null);
  const [result, setResult] = useState<BudgetAllocationAnalysis | null>(null);
  const [isLoadingOptions, setIsLoadingOptions] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [objective, setObjective] = useState('profit');
  const [riskTolerance, setRiskTolerance] = useState('balanced');
  const [totalBudget, setTotalBudget] = useState(0);
  const [maxShiftPct, setMaxShiftPct] = useState(20);
  const [minChannelPct, setMinChannelPct] = useState(5);
  const [maxChannelPct, setMaxChannelPct] = useState(60);
  const [channel, setChannel] = useState('all');
  const [campaignType, setCampaignType] = useState('all');
  const [campaignId, setCampaignId] = useState('all');

  useEffect(() => {
    let cancelled = false;

    const loadOptions = async () => {
      setIsLoadingOptions(true);
      try {
        const response = await getBudgetAllocatorOptions();
        if (!response.success || !response.data) {
          throw new Error(response.detail || 'Unable to load budget allocator options.');
        }

        if (cancelled) return;
        setOptions(response.data);
        setObjective(response.data.defaults.objective || 'profit');
        setRiskTolerance(response.data.defaults.risk_tolerance || 'balanced');
        setTotalBudget(Number(response.data.defaults.total_budget || 0));
        setMaxShiftPct(Number(response.data.defaults.max_shift_pct || 20));
        setMinChannelPct(Number(response.data.defaults.min_channel_pct || 5));
        setMaxChannelPct(Number(response.data.defaults.max_channel_pct || 60));
        setChannel(response.data.defaults.channel || 'all');
        setCampaignType(response.data.defaults.campaign_type || 'all');
        setCampaignId(response.data.defaults.campaign_id || 'all');
      } catch (loadError) {
        if (cancelled) return;
        setError(loadError instanceof Error ? loadError.message : 'Unable to load options.');
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

  useEffect(() => {
    if (!clientId || result) return;
    let cancelled = false;

    const hydrateLastResult = async () => {
      try {
        const raw = await getAgentResults('budget_allocator', clientId);
        if (cancelled) return;

        const response = (raw && typeof raw === 'object') ? (raw as Record<string, unknown>) : {};
        const persisted = response.results;
        const persistedRecord = (persisted && typeof persisted === 'object' && !Array.isArray(persisted))
          ? (persisted as Record<string, unknown>)
          : null;

        const maybeBudget = persistedRecord?.budget_allocation_analysis ?? persistedRecord;
        if (maybeBudget && typeof maybeBudget === 'object' && Object.keys(maybeBudget as Record<string, unknown>).length > 0) {
          setResult(maybeBudget as BudgetAllocationAnalysis);
        }
      } catch {
        // Keep manual run available even if hydration fails.
      }
    };

    hydrateLastResult();
    return () => {
      cancelled = true;
    };
  }, [clientId, result]);

  const runAllocation = async () => {
    setIsRunning(true);
    setError(null);

    try {
      const response = await runBudgetAllocator({
        objective,
        risk_tolerance: riskTolerance,
        total_budget: totalBudget,
        max_shift_pct: maxShiftPct,
        min_channel_pct: minChannelPct,
        max_channel_pct: maxChannelPct,
        channel,
        campaign_type: campaignType,
        campaign_id: campaignId,
      });

      if (!response.success || !response.data?.success) {
        throw new Error(response.detail || response.data?.errors?.system || 'Budget allocation failed.');
      }

      onRunResult?.(response.data);
      setResult(response.data.budget_allocation_analysis ?? null);
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : 'Budget allocation failed.');
    } finally {
      setIsRunning(false);
    }
  };

  const allocationRows = result?.channel_allocations ?? [];
  const planOptions = useMemo(() => {
    if (!result?.plans) return [];
    return Object.keys(result.plans);
  }, [result]);

  return (
    <div className="workspace-surface workspace-modern">
      <div className="workspace-header-glass workspace-header-glass-modern px-8 py-4">
        <div className="flex items-center gap-4">
          <div className="workspace-agent-icon">
            <DollarSign className="h-7 w-7" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-gray-900">Budget Allocator Agent</h1>
        </div>
      </div>

      <div className="workspace-content">
        <div className="mx-auto w-full max-w-6xl space-y-6">
          <div className="workspace-panel">
            <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-4">
              <label className="text-sm text-gray-600">
                Objective
                <select value={objective} onChange={(event) => setObjective(event.target.value)} className="workspace-control" disabled={isLoadingOptions}>
                  {(options?.objectives ?? ['profit']).map((item) => (
                    <option key={item} value={item}>{item.replace('_', ' ')}</option>
                  ))}
                </select>
              </label>

              <label className="text-sm text-gray-600">
                Risk Tolerance
                <select value={riskTolerance} onChange={(event) => setRiskTolerance(event.target.value)} className="workspace-control" disabled={isLoadingOptions}>
                  {(options?.risk_tolerances ?? ['balanced']).map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </label>

              <label className="text-sm text-gray-600">
                Total Budget
                <input
                  type="number"
                  min={1}
                  step={100}
                  value={totalBudget}
                  onChange={(event) => setTotalBudget(Number(event.target.value))}
                  className="workspace-control"
                />
              </label>

              <label className="text-sm text-gray-600">
                Max Shift %
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={maxShiftPct}
                  onChange={(event) => setMaxShiftPct(Number(event.target.value))}
                  className="workspace-control"
                />
              </label>

              <label className="text-sm text-gray-600">
                Min Channel %
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={minChannelPct}
                  onChange={(event) => setMinChannelPct(Number(event.target.value))}
                  className="workspace-control"
                />
              </label>

              <label className="text-sm text-gray-600">
                Max Channel %
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={maxChannelPct}
                  onChange={(event) => setMaxChannelPct(Number(event.target.value))}
                  className="workspace-control"
                />
              </label>

              <label className="text-sm text-gray-600">
                Channel
                <select value={channel} onChange={(event) => setChannel(event.target.value)} className="workspace-control" disabled={isLoadingOptions || !options?.available_filters.channel}>
                  <option value="all">All Channels</option>
                  {(options?.channels ?? []).map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </label>

              <label className="text-sm text-gray-600">
                Campaign Type
                <select value={campaignType} onChange={(event) => setCampaignType(event.target.value)} className="workspace-control" disabled={isLoadingOptions || !options?.available_filters.campaign_type}>
                  <option value="all">All Campaign Types</option>
                  {(options?.campaign_types ?? []).map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </label>

              <label className="text-sm text-gray-600 xl:col-span-2">
                Campaign ID
                <select value={campaignId} onChange={(event) => setCampaignId(event.target.value)} className="workspace-control" disabled={isLoadingOptions || !options?.available_filters.campaign_id}>
                  <option value="all">All Campaigns</option>
                  {(options?.campaign_ids ?? []).map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </label>

              <div className="flex items-end xl:col-span-2">
                <button onClick={runAllocation} disabled={isRunning} className="workspace-action-btn w-full bg-gradient-to-r from-blue-600 to-indigo-600 disabled:opacity-60">
                  {isRunning ? 'Allocating...' : 'Generate Budget Plan'}
                </button>
              </div>
            </div>

            {error && <p className="mt-4 rounded-xl border border-gray-300 bg-gray-100 px-3 py-2 text-sm text-gray-700">{error}</p>}
          </div>

          <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
            <MetricCard label="Baseline Budget" value={formatCurrency(result?.baseline_budget)} />
            <MetricCard label="Target Budget" value={formatCurrency(result?.total_budget)} />
            <MetricCard label="Expected KPI Delta" value={formatPercent(result?.expected_kpi_delta)} />
            <MetricCard label="Expected ROI Delta" value={formatPercent(result?.expected_roi_delta)} />
            <MetricCard label="Risk Profile" value={formatRiskLabel(result?.risk_tolerance || riskTolerance)} />
            <MetricCard label="Confidence Band" value={formatConfidenceBandLabel(result?.confidence_band)} />
          </div>

          <div className="workspace-panel">
            <h3 className="text-lg font-semibold text-gray-900">Channel Allocation</h3>
            <div className="mt-4 h-[340px] w-full">
              {allocationRows.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={allocationRows} margin={{ top: 8, right: 20, left: 10, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="channel" />
                    <YAxis tickFormatter={(value) => compactCurrency(Number(value))} />
                    <Tooltip formatter={(value: number) => formatCurrency(Number(value))} />
                    <Legend />
                    <Bar dataKey="baseline_spend" name="Baseline Spend" fill="#94a3b8" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="recommended_spend" name="Recommended Spend" fill="#10b981" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-gray-500">
                  Run budget allocation to visualize baseline vs recommended spend.
                </div>
              )}
            </div>
          </div>

          <div className="workspace-panel">
            <h3 className="text-lg font-semibold text-gray-900">Allocation Table</h3>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-gray-500">
                  <tr>
                    <th className="px-3 py-2">Channel</th>
                    <th className="px-3 py-2">Baseline</th>
                    <th className="px-3 py-2">Recommended</th>
                    <th className="px-3 py-2">Delta</th>
                    <th className="px-3 py-2">Expected Revenue</th>
                    <th className="px-3 py-2">Expected ROI</th>
                  </tr>
                </thead>
                <tbody>
                  {allocationRows.length > 0 ? (
                    allocationRows.map((row) => (
                      <tr key={row.channel} className="border-t border-gray-100">
                        <td className="px-3 py-2 font-semibold text-gray-900">{row.channel}</td>
                        <td className="px-3 py-2">{formatCurrency(row.baseline_spend)}</td>
                        <td className="px-3 py-2">{formatCurrency(row.recommended_spend)}</td>
                        <td className="px-3 py-2">{formatCurrency(row.delta_amount)} ({formatSignedPercent(row.delta_percent)})</td>
                        <td className="px-3 py-2">{formatCurrency(row.expected_revenue)}</td>
                        <td className="px-3 py-2">{formatPercent(row.expected_roi)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="px-3 py-4 text-gray-500" colSpan={6}>No allocation output yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="workspace-panel grid gap-6 lg:grid-cols-2">
            <div>
              <h3 className="text-base font-semibold text-gray-900">Constraint Log</h3>
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-gray-600">
                {(result?.constraint_log ?? []).length > 0
                  ? (result?.constraint_log ?? []).map((item, index) => <li key={`${item}-${index}`}>{item}</li>)
                  : <li>No active constraint warnings for this plan.</li>}
              </ul>
            </div>

            <div>
              <h3 className="text-base font-semibold text-gray-900">Plan Variants</h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {planOptions.length > 0 ? planOptions.map((name) => (
                  <span key={name} className="workspace-option-pill border-gray-300 bg-gray-100 text-gray-700">
                    {name}
                  </span>
                )) : <span className="text-sm text-gray-500">Run allocator to generate conservative / balanced / aggressive plans.</span>}
              </div>
              {result?.confidence_band ? (
                <p className="mt-4 text-sm text-gray-600">
                  Confidence band (KPI delta): {formatPercent(result.confidence_band.low)} to {formatPercent(result.confidence_band.high)}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="workspace-metric-card">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</div>
      <div className="mt-2 text-xl font-bold text-gray-900">{value}</div>
    </div>
  );
}

function compactCurrency(value: number): string {
  if (!Number.isFinite(value)) return '$0';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

function formatCurrency(value: number | undefined): string {
  if (value === undefined || value === null || Number.isNaN(value)) return '-';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}

function formatPercent(value: number | undefined): string {
  if (value === undefined || value === null || Number.isNaN(value)) return '-';
  return `${(value * 100).toFixed(1)}%`;
}

function formatSignedPercent(value: number | undefined): string {
  if (value === undefined || value === null || Number.isNaN(value)) return '-';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

function formatRiskLabel(value: string | undefined): string {
  if (!value) return '-';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatConfidenceBandLabel(value: BudgetAllocationAnalysis['confidence_band']): string {
  if (!value) return '-';
  return `${formatPercent(value.low)} to ${formatPercent(value.high)}`;
}
