import { Network, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import { orchestrateAgents } from '../../services/api';
import type { AgentOrchestrationResult, AttributionAnalysis } from '../../types';

interface AttributionWorkspaceProps {
  onRunResult?: (result: AgentOrchestrationResult) => void;
}

export default function AttributionWorkspace({ onRunResult }: AttributionWorkspaceProps) {
  const [attributionModel, setAttributionModel] = useState('linear');
  const [metric, setMetric] = useState('revenue');
  const [result, setResult] = useState<AttributionAnalysis | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const channels = useMemo(() => result?.channel_summary ?? [], [result]);

  const runAttribution = async () => {
    setIsRunning(true);
    setError(null);

    try {
      const response = await orchestrateAgents({
        intent: 'attribution_analysis',
        agents: ['attribution'],
        payload: {
          attribution_model: attributionModel,
          metric,
        },
      });

      if (!response.success || !response.data?.success) {
        throw new Error(response.detail || response.data?.errors?.system || 'Failed to run attribution agent.');
      }

      onRunResult?.(response.data);

      setResult(response.data.attribution_analysis ?? null);
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : 'Failed to run attribution agent.');
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="workspace-surface">
      <div className="workspace-header-glass px-8 py-3">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-rose-600 text-white">
            <Network className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Attribution Agent</h1>
        </div>
      </div>

      <div className="workspace-content">
        <div className="mx-auto w-full max-w-6xl space-y-6">
          <div className="rounded-[28px] border border-gray-200 bg-white p-6 shadow-sm">
            <div className="grid gap-4 md:grid-cols-3">
              <label className="text-sm text-gray-600">
                Attribution Model
                <select value={attributionModel} onChange={(event) => setAttributionModel(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3">
                  <option value="linear">Linear</option>
                  <option value="first_click">First Click</option>
                  <option value="last_click">Last Click</option>
                  <option value="time_decay">Time Decay</option>
                </select>
              </label>

              <label className="text-sm text-gray-600">
                Optimization Metric
                <select value={metric} onChange={(event) => setMetric(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3">
                  <option value="revenue">Revenue</option>
                  <option value="conversions">Conversions</option>
                  <option value="engagement">Engagement</option>
                </select>
              </label>

              <div className="flex items-end">
                <button onClick={runAttribution} disabled={isRunning} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 text-sm font-semibold text-white disabled:opacity-60">
                  <Sparkles className="h-4 w-4" /> {isRunning ? 'Running...' : 'Analyze Attribution'}
                </button>
              </div>
            </div>

            {error && <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <InfoCard title="Best Channel" value={result?.best_channel || '-'} />
            <InfoCard title="Worst Channel" value={result?.worst_channel || '-'} />
            <InfoCard
              title="Recommended Shift"
              value={result?.recommended_shift?.percent ? `${result.recommended_shift.percent}%` : '-'}
              helper={
                result?.recommended_shift?.from && result?.recommended_shift?.to
                  ? `${result.recommended_shift.from} -> ${result.recommended_shift.to}`
                  : 'Run analysis to get budget recommendation.'
              }
            />
          </div>

          <div className="rounded-[28px] border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-gray-900">Channel Attribution Breakdown</h3>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-gray-500">
                  <tr>
                    <th className="px-3 py-2">Channel</th>
                    <th className="px-3 py-2">First Touch</th>
                    <th className="px-3 py-2">Last Touch</th>
                    <th className="px-3 py-2">Linear</th>
                    <th className="px-3 py-2">Blended</th>
                    <th className="px-3 py-2">Weight</th>
                  </tr>
                </thead>
                <tbody>
                  {channels.length > 0 ? (
                    channels.map((row) => (
                      <tr key={row.channel} className="border-t border-gray-100">
                        <td className="px-3 py-2 font-semibold text-gray-900">{row.channel}</td>
                        <td className="px-3 py-2">{formatCurrency(row.first_touch_revenue)}</td>
                        <td className="px-3 py-2">{formatCurrency(row.last_touch_revenue)}</td>
                        <td className="px-3 py-2">{formatCurrency(row.linear_revenue)}</td>
                        <td className="px-3 py-2">{formatCurrency(row.blended_revenue)}</td>
                        <td className="px-3 py-2">{formatPercent(result?.channel_weights?.[row.channel])}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="px-3 py-4 text-gray-500" colSpan={6}>No attribution output yet. Run analysis to populate this table.</td>
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

function InfoCard({ title, value, helper }: { title: string; value: string; helper?: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
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
  return `${(value * 100).toFixed(1)}%`;
}