import { Filter, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import { orchestrateAgents } from '../../services/api';
import type { AgentOrchestrationResult, FunnelAnalysis } from '../../types';

interface FunnelWorkspaceProps {
  onRunResult?: (result: AgentOrchestrationResult) => void;
}

export default function FunnelWorkspace({ onRunResult }: FunnelWorkspaceProps) {
  const [funnelType, setFunnelType] = useState('ecommerce');
  const [segment, setSegment] = useState('all_users');
  const [timePeriod, setTimePeriod] = useState('month');
  const [result, setResult] = useState<FunnelAnalysis | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stageRows = useMemo(() => {
    const funnel = result?.funnel;
    if (!funnel) return [];

    const values = [
      { key: 'impressions', label: 'Impressions', value: funnel.impressions },
      { key: 'clicks', label: 'Clicks', value: funnel.clicks },
      { key: 'landing_page_views', label: 'Landing Page Views', value: funnel.landing_page_views },
      { key: 'add_to_cart', label: 'Add To Cart', value: funnel.add_to_cart },
      { key: 'purchases', label: 'Purchases', value: funnel.purchases },
    ];

    return values.map((stage, index) => {
      if (index === 0) {
        return { ...stage, dropoff: 0 };
      }
      const prev = values[index - 1].value;
      const dropoff = prev > 0 ? ((prev - stage.value) / prev) * 100 : 0;
      return { ...stage, dropoff };
    });
  }, [result]);

  const runFunnel = async () => {
    setIsRunning(true);
    setError(null);

    try {
      const response = await orchestrateAgents({
        intent: 'funnel_analysis',
        agents: ['funnel'],
        payload: {
          funnel_type: funnelType,
          segment,
          time_period: timePeriod,
        },
      });

      if (!response.success || !response.data?.success) {
        throw new Error(response.detail || response.data?.errors?.system || 'Failed to run funnel analysis.');
      }

      onRunResult?.(response.data);

      setResult(response.data.funnel_analysis ?? null);
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : 'Failed to run funnel analysis.');
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="workspace-surface">
      <div className="workspace-header-glass px-8 py-3">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-emerald-600 text-white">
            <Filter className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Funnel Agent</h1>
        </div>
      </div>

      <div className="workspace-content">
        <div className="mx-auto w-full max-w-6xl space-y-6">
          <div className="rounded-[28px] border border-gray-200 bg-white p-6 shadow-sm">
            <div className="grid gap-4 md:grid-cols-4">
              <label className="text-sm text-gray-600">
                Funnel Type
                <select value={funnelType} onChange={(event) => setFunnelType(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3">
                  <option value="ecommerce">E-commerce</option>
                  <option value="lead_gen">Lead Generation</option>
                  <option value="saas">SaaS Trial</option>
                </select>
              </label>

              <label className="text-sm text-gray-600">
                Segment
                <select value={segment} onChange={(event) => setSegment(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3">
                  <option value="all_users">All Users</option>
                  <option value="paid_traffic">Paid Traffic</option>
                  <option value="returning_users">Returning Users</option>
                </select>
              </label>

              <label className="text-sm text-gray-600">
                Time Period
                <select value={timePeriod} onChange={(event) => setTimePeriod(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3">
                  <option value="week">Weekly</option>
                  <option value="month">Monthly</option>
                  <option value="quarter">Quarterly</option>
                </select>
              </label>

              <div className="flex items-end">
                <button onClick={runFunnel} disabled={isRunning} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white disabled:opacity-60">
                  <Sparkles className="h-4 w-4" /> {isRunning ? 'Running...' : 'Analyze Funnel'}
                </button>
              </div>
            </div>

            {error && <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <MetricCard title="Largest Dropoff" value={result?.largest_dropoff?.replace(/_/g, ' ') || '-'} />
            <MetricCard title="Dropoff Percent" value={result ? `${result.dropoff_percent.toFixed(1)}%` : '-'} />
            <MetricCard title="Potential Uplift" value={result ? `${(result.predicted_conversion_uplift_if_fixed * 100).toFixed(1)}%` : '-'} />
          </div>

          <div className="rounded-[28px] border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-gray-900">Funnel Stages</h3>
            <div className="mt-4 space-y-3">
              {stageRows.length > 0 ? (
                stageRows.map((stage) => (
                  <div key={stage.key} className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-semibold text-gray-900">{stage.label}</span>
                      <span className="font-semibold text-gray-700">{formatCount(stage.value)}</span>
                    </div>
                    <div className="mt-1 text-xs text-gray-500">
                      {stage.dropoff > 0 ? `Dropoff from previous stage: ${stage.dropoff.toFixed(1)}%` : 'Entry stage'}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-gray-500">Run funnel analysis to visualize stages and leakage.</p>
              )}
            </div>
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

function formatCount(value?: number): string {
  if (value === undefined || value === null) return '-';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
}
