import { Sparkles, Users } from 'lucide-react';
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
import { getAgentResults, getCohortOptions, orchestrateAgents } from '../../services/api';
import {
  getMissingRequiredDatasets,
  hasRequiredClientDatasets,
  toFriendlyDataRequirementError,
} from '../../services/clientDataRequirements';
import AgentHeaderActions from '../shared/AgentHeaderActions';
import type { AgentOrchestrationResult, CohortAnalysis, CohortOptions } from '../../types';

interface CohortWorkspaceProps {
  clientId?: string;
  onRunResult?: (result: AgentOrchestrationResult) => void;
}

export default function CohortWorkspace({ clientId, onRunResult }: CohortWorkspaceProps) {
  const [cohortPeriod, setCohortPeriod] = useState('month');
  const [retentionMonths, setRetentionMonths] = useState(3);
  const [segment, setSegment] = useState('all');
  const [signupChannel, setSignupChannel] = useState('all');
  const [contractType, setContractType] = useState('all');
  const [signupStartDate, setSignupStartDate] = useState('');
  const [signupEndDate, setSignupEndDate] = useState('');
  const [minTenureMonths, setMinTenureMonths] = useState(0);
  const [churnProbabilityMin, setChurnProbabilityMin] = useState(0);
  const [topN, setTopN] = useState(8);
  const [options, setOptions] = useState<CohortOptions | null>(null);
  const [result, setResult] = useState<CohortAnalysis | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isLoadingOptions, setIsLoadingOptions] = useState(false);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const hydrateOptions = async () => {
      setIsLoadingOptions(true);
      setOptionsError(null);
      try {
        const response = await getCohortOptions(clientId);
        if (!response.success || !response.data) {
          throw new Error(response.detail || 'Unable to load cohort options.');
        }
        if (cancelled) return;
        setOptions(response.data);
        setCohortPeriod(response.data.defaults?.cohort_period || 'month');
        setRetentionMonths(response.data.defaults?.retention_months || 3);
        setSegment(response.data.defaults?.segment || 'all');
        setSignupChannel(response.data.defaults?.signup_channel || 'all');
        setContractType(response.data.defaults?.contract_type || 'all');
        setSignupStartDate(response.data.defaults?.signup_start_date || response.data.date_range?.signup_min || '');
        setSignupEndDate(response.data.defaults?.signup_end_date || response.data.date_range?.signup_max || '');
        setMinTenureMonths(response.data.defaults?.min_tenure_months || 0);
        setChurnProbabilityMin(response.data.defaults?.churn_probability_min || 0);
        setTopN(response.data.defaults?.top_n || 8);
      } catch (loadError) {
        if (cancelled) return;
        const rawMessage = loadError instanceof Error ? loadError.message : 'Unable to load cohort options.';
        setOptionsError(toFriendlyDataRequirementError('Cohort analysis', 'cohort', rawMessage));
      } finally {
        if (!cancelled) setIsLoadingOptions(false);
      }
    };

    hydrateOptions();
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  useEffect(() => {
    if (!clientId || result) return;
    let cancelled = false;

    const hydrateLastResult = async () => {
      try {
        const raw = await getAgentResults('cohort', clientId);
        if (cancelled) return;

        const response = (raw && typeof raw === 'object') ? (raw as Record<string, unknown>) : {};
        const persisted = response.results;
        const persistedRecord = (persisted && typeof persisted === 'object' && !Array.isArray(persisted))
          ? (persisted as Record<string, unknown>)
          : null;

        const maybeCohort = persistedRecord?.cohort_analysis ?? persistedRecord;
        if (maybeCohort && typeof maybeCohort === 'object' && Object.keys(maybeCohort as Record<string, unknown>).length > 0) {
          setResult(maybeCohort as CohortAnalysis);
        }
      } catch {
        // Hydration is best-effort; users can still run a fresh cohort analysis.
      }
    };

    hydrateLastResult();
    return () => {
      cancelled = true;
    };
  }, [clientId, result]);

  const retentionCurve = result?.retention_curve ?? [];
  const segmentBreakdown = result?.segment_breakdown ?? [];
  const signupChannelValue = result?.signup_channel_value ?? [];
  const cohortCurves = result?.cohort_curves ?? [];
  const cohortTable = result?.cohort_table ?? [];
  const churnRiskActions = result?.churn_risk_actions ?? [];
  const hasRequiredClientData = useMemo(
    () => hasRequiredClientDatasets('cohort', options?.sources, clientId),
    [options?.sources, clientId],
  );
  const missingDatasets = useMemo(
    () => getMissingRequiredDatasets('cohort', options?.sources, clientId),
    [options?.sources, clientId],
  );
  const dataRequirementMessage = useMemo(
    () => toFriendlyDataRequirementError('Cohort analysis', 'cohort', '', missingDatasets),
    [missingDatasets],
  );
  const showMissingDataRequirementCard = !isLoadingOptions && Boolean(clientId) && Boolean(options?.sources) && !hasRequiredClientData && !error && !optionsError;

  const topSegments = useMemo(
    () => [...segmentBreakdown].sort((a, b) => b.average_ltv - a.average_ltv).slice(0, 6),
    [segmentBreakdown],
  );

  const runCohort = async () => {
    if (!hasRequiredClientData) {
      setError(dataRequirementMessage);
      return;
    }

    setIsRunning(true);
    setError(null);

    try {
      const response = await orchestrateAgents({
        intent: 'cohort_analysis',
        agents: ['cohort'],
        client_id: clientId,
        payload: {
          cohort_period: cohortPeriod,
          retention_months: retentionMonths,
          segment,
          signup_channel: signupChannel,
          contract_type: contractType,
          signup_start_date: signupStartDate || undefined,
          signup_end_date: signupEndDate || undefined,
          min_tenure_months: minTenureMonths,
          churn_probability_min: churnProbabilityMin,
          top_n: topN,
        },
      });

      if (!response.success || !response.data?.success) {
        throw new Error(response.detail || response.data?.errors?.system || 'Failed to run cohort analysis.');
      }

      onRunResult?.(response.data);

      setResult(response.data.cohort_analysis ?? null);
    } catch (runError) {
      const rawMessage = runError instanceof Error ? runError.message : 'Failed to run cohort analysis.';
      setError(toFriendlyDataRequirementError('Cohort analysis', 'cohort', rawMessage, missingDatasets));
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
              <Users className="h-7 w-7" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-gray-900">Cohort Agent</h1>
          </div>
          <AgentHeaderActions clientId={clientId} />
        </div>
      </div>

      <div className="workspace-content">
        <div className="mx-auto w-full max-w-6xl space-y-6">
          <div className="workspace-panel">
            <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-4">
              <label className="text-sm text-gray-600">
                Cohort Period
                <select value={cohortPeriod} onChange={(event) => setCohortPeriod(event.target.value)} className="workspace-control">
                  {(options?.cohort_periods || ['week', 'month', 'quarter']).map((period) => (
                    <option key={period} value={period}>{period.charAt(0).toUpperCase() + period.slice(1)}</option>
                  ))}
                </select>
              </label>

              <label className="text-sm text-gray-600">
                 Horizon (months)
                <input
                  type="number"
                  min={1}
                  max={options?.limits?.max_tenure_months || 24}
                  value={retentionMonths}
                  onChange={(event) => setRetentionMonths(Number(event.target.value))}
                  className="workspace-control"
                />
              </label>

              <label className="text-sm text-gray-600">
                Segment
                <select value={segment} onChange={(event) => setSegment(event.target.value)} className="workspace-control">
                  <option value="all">All segments</option>
                  {(options?.segments || []).map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>

              <label className="text-sm text-gray-600">
                Signup Channel
                <select value={signupChannel} onChange={(event) => setSignupChannel(event.target.value)} className="workspace-control">
                  <option value="all">All channels</option>
                  {(options?.signup_channels || []).map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>

              <label className="text-sm text-gray-600">
                Contract Type
                <select value={contractType} onChange={(event) => setContractType(event.target.value)} className="workspace-control">
                  <option value="all">All contracts</option>
                  {(options?.contract_types || []).map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>

              <label className="text-sm text-gray-600">
                Signup Start Date
                <input type="date" value={signupStartDate} onChange={(event) => setSignupStartDate(event.target.value)} className="workspace-control" />
              </label>

              <label className="text-sm text-gray-600">
                Signup End Date
                <input type="date" value={signupEndDate} onChange={(event) => setSignupEndDate(event.target.value)} className="workspace-control" />
              </label>

              <label className="text-sm text-gray-600">
                Min Tenure (months)
                <input
                  type="number"
                  min={0}
                  max={options?.limits?.max_tenure_months || 24}
                  value={minTenureMonths}
                  onChange={(event) => setMinTenureMonths(Number(event.target.value))}
                  className="workspace-control"
                />
              </label>

              <label className="text-sm text-gray-600">
                Min Churn Probability
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.05}
                  value={churnProbabilityMin}
                  onChange={(event) => setChurnProbabilityMin(Number(event.target.value))}
                  className="workspace-control"
                />
              </label>

              <label className="text-sm text-gray-600">
                Top Cohorts / Actions
                <input
                  type="number"
                  min={3}
                  max={options?.limits?.max_top_n || 20}
                  value={topN}
                  onChange={(event) => setTopN(Number(event.target.value))}
                  className="workspace-control"
                />
              </label>

              <div className="flex items-end">
                <button onClick={runCohort} disabled={isRunning || isLoadingOptions || !hasRequiredClientData} className="workspace-action-btn w-full disabled:opacity-60">
                   {isRunning ? 'Running...' : 'Analyze Cohorts'}
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
                <p className="text-sm font-semibold text-amber-900">Cohort Unavailable</p>
                <p className="mt-1 text-sm text-amber-800">{error}</p>
              </div>
            )}
            {showMissingDataRequirementCard && (
              <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
                <p className="text-sm font-semibold text-amber-900">Data Requirement</p>
                <p className="mt-1 text-sm text-amber-800">{dataRequirementMessage}</p>
              </div>
            )}
            {isLoadingOptions && <p className="mt-3 text-xs text-gray-500">Loading Supabase cohort filters...</p>}
            {result?.data_source && <p className="mt-3 text-xs text-gray-500">Data source: {result.data_source}</p>}
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <MetricCard title="Average LTV" value={formatCurrency(result?.average_ltv)} />
            <MetricCard title="3-Month Retention" value={formatPercent(result?.three_month_retention)} />
            <MetricCard title="Repeat Purchase Rate" value={formatPercent(result?.repeat_purchase_rate)} />
            <MetricCard title="Churn Risk" value={formatPercent(result?.churn_risk)} />
            <MetricCard title="High Value Segment" value={result?.high_value_segment || '-'} />
            <MetricCard title="High Churn Segment" value={result?.high_churn_segment || '-'} />
          </div>

          <div className="grid gap-6">
            <div className="workspace-panel">
              <h3 className="text-lg font-semibold text-gray-900">Retention Curve</h3>
              <p className="mt-1 text-sm text-gray-500">Track retention and churn by customer tenure month.</p>
              <div className="mt-4 h-[320px] w-full">
                {retentionCurve.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={retentionCurve} margin={{ top: 8, right: 20, left: 10, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="tenure_months" tickFormatter={(value) => `${value}m`} />
                      <YAxis tickFormatter={(value) => `${Math.round(Number(value) * 100)}%`} />
                      <Tooltip formatter={(value: number) => formatPercent(value)} />
                      <Legend />
                      <Line type="monotone" dataKey="retention_rate" stroke="#4f46e5" strokeWidth={2} dot={false} name="Retention" />
                      <Line type="monotone" dataKey="churn_rate" stroke="#ef4444" strokeWidth={2} dot={false} name="Churn" />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyChart text="Run cohort analysis to render retention trend." />
                )}
              </div>
            </div>

            <div className="workspace-panel">
              <h3 className="text-lg font-semibold text-gray-900">Top Segments by LTV</h3>
              <p className="mt-1 text-sm text-gray-500">Identify segments with strongest value and lower churn risk.</p>
              <div className="mt-4 h-[320px] w-full">
                {topSegments.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={topSegments} layout="vertical" margin={{ top: 8, right: 20, left: 20, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis type="number" tickFormatter={(value) => compactCurrency(Number(value))} />
                      <YAxis dataKey="segment" type="category" width={120} />
                      <Tooltip formatter={(value: number) => formatCurrency(Number(value))} />
                      <Bar dataKey="average_ltv" name="Average LTV" fill="#14b8a6" radius={[0, 8, 8, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyChart text="No segment-level cohort data available." />
                )}
              </div>
            </div>

            <div className="workspace-panel">
              <h3 className="text-lg font-semibold text-gray-900">Signup Cohort Curve</h3>
              <p className="mt-1 text-sm text-gray-500">Compare retention by signup cohort period.</p>
              <div className="mt-4 h-[320px] w-full">
                {cohortCurves.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={cohortCurves} margin={{ top: 8, right: 20, left: 10, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="cohort_label" />
                      <YAxis yAxisId="left" tickFormatter={(value) => `${Math.round(Number(value) * 100)}%`} />
                      <YAxis yAxisId="right" orientation="right" tickFormatter={(value) => compactCurrency(Number(value))} />
                      <Tooltip formatter={(value: number, name: string) => (name.includes('Revenue') ? formatCurrency(Number(value)) : formatPercent(Number(value)))} />
                      <Legend />
                      <Line yAxisId="left" type="monotone" dataKey="retention_rate" stroke="#4f46e5" strokeWidth={2} dot={false} name="Retention" />
                      <Line yAxisId="left" type="monotone" dataKey="churn_probability" stroke="#ef4444" strokeWidth={2} dot={false} name="Churn Probability" />
                      <Line yAxisId="right" type="monotone" dataKey="avg_revenue_per_customer" stroke="#14b8a6" strokeWidth={2} dot={false} name="Avg Revenue / Customer" />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyChart text="Run cohort analysis to render signup cohort performance." />
                )}
              </div>
            </div>
          </div>

          <div className="workspace-panel">
            <h3 className="text-lg font-semibold text-gray-900">Signup Channel Value</h3>
            <p className="mt-1 text-sm text-gray-500">Compare signup channel contribution in revenue and customer count.</p>
            <div className="mt-4 h-[320px] w-full">
              {signupChannelValue.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={signupChannelValue} margin={{ top: 8, right: 20, left: 10, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="signup_channel" />
                    <YAxis yAxisId="left" tickFormatter={(value) => compactCurrency(Number(value))} />
                    <YAxis yAxisId="right" orientation="right" />
                    <Tooltip formatter={(value: number, name: string) => (name === 'Revenue' ? formatCurrency(Number(value)) : formatCount(Number(value)))} />
                    <Legend />
                    <Bar yAxisId="left" dataKey="revenue" name="Revenue" fill="#6366f1" radius={[8, 8, 0, 0]} />
                    <Bar yAxisId="right" dataKey="customers" name="Customers" fill="#22c55e" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyChart text="No signup-channel value data available." />
              )}
            </div>
          </div>

          <div className="workspace-panel">
            <h3 className="text-lg font-semibold text-gray-900">Segment Insights Table</h3>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-gray-500">
                  <tr>
                    <th className="px-3 py-2">Segment</th>
                    <th className="px-3 py-2">Customers</th>
                    <th className="px-3 py-2">Avg LTV</th>
                    <th className="px-3 py-2">Repeat Rate</th>
                    <th className="px-3 py-2">Churn Risk</th>
                  </tr>
                </thead>
                <tbody>
                  {segmentBreakdown.length > 0 ? (
                    segmentBreakdown.map((row) => (
                      <tr key={row.segment} className="border-t border-gray-100">
                        <td className="px-3 py-2 font-semibold text-gray-900">{row.segment}</td>
                        <td className="px-3 py-2">{formatCount(row.customers)}</td>
                        <td className="px-3 py-2">{formatCurrency(row.average_ltv)}</td>
                        <td className="px-3 py-2">{formatPercent(row.repeat_purchase_rate)}</td>
                        <td className="px-3 py-2">{formatPercent(row.churn_risk)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="px-3 py-4 text-gray-500" colSpan={5}>Run analysis to view segment-level diagnostics.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="workspace-panel">
            <h3 className="text-lg font-semibold text-gray-900">Cohort Detail Table</h3>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-gray-500">
                  <tr>
                    <th className="px-3 py-2">Cohort</th>
                    <th className="px-3 py-2">Tenure</th>
                    <th className="px-3 py-2">Customers</th>
                    <th className="px-3 py-2">Retention</th>
                    <th className="px-3 py-2">Churn</th>
                    <th className="px-3 py-2">Avg Revenue</th>
                    <th className="px-3 py-2">Avg Logins</th>
                  </tr>
                </thead>
                <tbody>
                  {cohortTable.length > 0 ? (
                    cohortTable.slice(0, 80).map((row, index) => (
                      <tr key={`${row.cohort_label}-${row.tenure_months}-${index}`} className="border-t border-gray-100">
                        <td className="px-3 py-2 font-semibold text-gray-900">{row.cohort_label}</td>
                        <td className="px-3 py-2">{row.tenure_months}m</td>
                        <td className="px-3 py-2">{formatCount(row.customers)}</td>
                        <td className="px-3 py-2">{formatPercent(row.retention_rate)}</td>
                        <td className="px-3 py-2">{formatPercent(row.churn_probability)}</td>
                        <td className="px-3 py-2">{formatCurrency(row.avg_revenue_per_customer)}</td>
                        <td className="px-3 py-2">{Number(row.avg_monthly_logins || 0).toFixed(1)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="px-3 py-4 text-gray-500" colSpan={7}>Run analysis to view cohort-level rows.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="workspace-panel">
            <h3 className="text-lg font-semibold text-gray-900">Churn Risk Action Queue</h3>
            <div className="mt-4 grid gap-3">
              {churnRiskActions.length > 0 ? (
                churnRiskActions.map((item, index) => (
                  <div key={`${item.segment}-${index}`} className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-semibold text-gray-900">{item.segment} / {item.signup_channel} / {item.contract_type}</div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-gray-700">{item.priority} priority</div>
                    </div>
                    <div className="mt-1 text-sm text-gray-600">{item.recommended_action}</div>
                    <div className="mt-2 text-xs text-gray-600">
                      Customers: {formatCount(item.customers)} | Churn Risk: {formatPercent(item.churn_risk)} | Avg LTV: {formatCurrency(item.avg_ltv)} | Expected Impact: {item.expected_impact}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-gray-500">Run analysis to generate prioritized retention playbooks.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyChart({ text }: { text: string }) {
  return <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-gray-300 text-sm text-gray-500">{text}</div>;
}

function MetricCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="workspace-metric-card">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</div>
      <div className="mt-2 text-xl font-bold text-gray-900">{value}</div>
    </div>
  );
}

function formatCurrency(value?: number): string {
  if (value === undefined || value === null) return '-';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}

function formatPercent(value?: number): string {
  if (value === undefined || value === null) return '-';
  return `${(value * 100).toFixed(1)}%`;
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

