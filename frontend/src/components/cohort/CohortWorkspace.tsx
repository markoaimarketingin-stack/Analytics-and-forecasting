import { Sparkles, Users } from 'lucide-react';
import { useState } from 'react';
import { orchestrateAgents } from '../../services/api';
import type { AgentOrchestrationResult, CohortAnalysis } from '../../types';

interface CohortWorkspaceProps {
  onRunResult?: (result: AgentOrchestrationResult) => void;
}

export default function CohortWorkspace({ onRunResult }: CohortWorkspaceProps) {
  const [cohortPeriod, setCohortPeriod] = useState('month');
  const [retentionMonths, setRetentionMonths] = useState(3);
  const [result, setResult] = useState<CohortAnalysis | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runCohort = async () => {
    setIsRunning(true);
    setError(null);

    try {
      const response = await orchestrateAgents({
        intent: 'cohort_analysis',
        agents: ['cohort'],
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
    <div className="workspace-surface">
      <div className="workspace-header-glass px-8 py-3">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-indigo-600 text-white">
            <Users className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Cohort Agent</h1>
        </div>
      </div>

      <div className="workspace-content">
        <div className="mx-auto w-full max-w-6xl space-y-6">
          <div className="rounded-[28px] border border-gray-200 bg-white p-6 shadow-sm">
            <div className="grid gap-4 md:grid-cols-3">
              <label className="text-sm text-gray-600">
                Cohort Period
                <select value={cohortPeriod} onChange={(event) => setCohortPeriod(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3">
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
                  className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3"
                />
              </label>

              <div className="flex items-end">
                <button onClick={runCohort} disabled={isRunning} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white disabled:opacity-60">
                  <Sparkles className="h-4 w-4" /> {isRunning ? 'Running...' : 'Analyze Cohorts'}
                </button>
              </div>
            </div>

            {error && <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <MetricCard title="Average LTV" value={formatCurrency(result?.average_ltv)} />
            <MetricCard title="3-Month Retention" value={formatPercent(result?.three_month_retention)} />
            <MetricCard title="Repeat Purchase Rate" value={formatPercent(result?.repeat_purchase_rate)} />
            <MetricCard title="Churn Risk" value={formatPercent(result?.churn_risk)} />
            <MetricCard title="High Value Segment" value={result?.high_value_segment || '-'} />
            <MetricCard title="High Churn Segment" value={result?.high_churn_segment || '-'} />
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
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

