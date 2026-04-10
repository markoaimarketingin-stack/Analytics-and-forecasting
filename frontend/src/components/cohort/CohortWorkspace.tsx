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
import { getAgentResults, orchestrateAgents } from '../../services/api';
import type { AgentOrchestrationResult, CohortAnalysis } from '../../types';

interface CohortWorkspaceProps {
  clientId?: string;
  onRunResult?: (result: AgentOrchestrationResult) => void;
}

export default function CohortWorkspace({ clientId, onRunResult }: CohortWorkspaceProps) {
  const [cohortPeriod, setCohortPeriod] = useState('month');
  const [retentionMonths, setRetentionMonths] = useState(3);
  const [result, setResult] = useState<CohortAnalysis | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const topSegments = useMemo(
    () => [...segmentBreakdown].sort((a, b) => b.average_ltv - a.average_ltv).slice(0, 6),
    [segmentBreakdown],
  );

  const runCohort = async () => {
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
        },
      });

      if (!response.success || !response.data?.success) {
        throw new Error(response.detail || response.data?.errors?.system || 'Failed to run cohort analysis.');
      }

      onRunResult?.(response.data);

      setResult(response.data.cohort_analysis ?? null);
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : 'Failed to run cohort analysis.');
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="workspace-surface workspace-modern">
      <div className="workspace-header-glass workspace-header-glass-modern px-8 py-3">
        <div className="flex items-center gap-4">
          <div className="workspace-agent-icon bg-gradient-to-br from-indigo-600 to-cyan-600">
            <Users className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Cohort Agent</h1>
        </div>
      </div>

      <div className="workspace-content">
        <div className="mx-auto w-full max-w-6xl space-y-6">
          <div className="workspace-panel">
            <div className="grid gap-4 md:grid-cols-3">
              <label className="text-sm text-gray-600">
                Cohort Period
                <select value={cohortPeriod} onChange={(event) => setCohortPeriod(event.target.value)} className="workspace-control">
                  <option value="week">Weekly</option>
                  <option value="month">Monthly</option>
                  <option value="quarter">Quarterly</option>
                </select>
              </label>

              <label className="text-sm text-gray-600">
                Retention Horizon (months)
                <input
                  type="number"
                  min={1}
                  max={24}
                  value={retentionMonths}
                  onChange={(event) => setRetentionMonths(Number(event.target.value))}
                  className="workspace-control"
                />
              </label>

              <div className="flex items-end">
                <button onClick={runCohort} disabled={isRunning} className="workspace-action-btn w-full bg-gradient-to-r from-indigo-600 to-cyan-600 disabled:opacity-60">
                  <Sparkles className="h-4 w-4" /> {isRunning ? 'Running...' : 'Analyze Cohorts'}
                </button>
              </div>
            </div>

            {error && <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
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

          <div className="grid gap-6 xl:grid-cols-2">
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

