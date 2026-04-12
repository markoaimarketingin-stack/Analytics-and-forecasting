import { Network, Sparkles } from 'lucide-react';
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
import { getAgentResults, orchestrateAgents } from '../../services/api';
import type { AgentOrchestrationResult, AttributionAnalysis } from '../../types';

interface AttributionWorkspaceProps {
  clientId?: string;
  onRunResult?: (result: AgentOrchestrationResult) => void;
}

export default function AttributionWorkspace({ clientId, onRunResult }: AttributionWorkspaceProps) {
  const [attributionModel, setAttributionModel] = useState('linear');
  const [metric, setMetric] = useState('revenue');
  const [result, setResult] = useState<AttributionAnalysis | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'credit' | 'touchpoints' | 'scenario'>('credit');

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
        // Hydration is best-effort; don't block normal workspace usage.
      }
    };

    hydrateLastResult();
    return () => {
      cancelled = true;
    };
  }, [clientId, result]);

  const channels = useMemo(() => result?.channel_summary ?? [], [result]);
  const modelCreditChart = result?.model_credit_chart ?? channels;
  const touchpointChart = result?.touchpoint_position_chart ?? [];
  const budgetScenarioChart = result?.budget_scenario_chart ?? [];

  const runAttribution = async () => {
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
    <div className="workspace-surface workspace-modern">
      <div className="workspace-header-glass workspace-header-glass-modern px-8 py-3">
        <div className="flex items-center gap-4">
          <div className="workspace-agent-icon bg-gradient-to-br from-rose-600 to-pink-600">
            <Network className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Attribution Agent</h1>
        </div>
      </div>

      <div className="workspace-content">
        <div className="mx-auto w-full max-w-6xl space-y-6">
          <div className="workspace-panel">
            <div className="grid gap-4 md:grid-cols-3">
              <label className="text-sm text-gray-600">
                Attribution Model
                <select value={attributionModel} onChange={(event) => setAttributionModel(event.target.value)} className="workspace-control">
                  <option value="linear">Linear</option>
                  <option value="first_click">First Click</option>
                  <option value="last_click">Last Click</option>
                  <option value="time_decay">Time Decay</option>
                </select>
              </label>

              <label className="text-sm text-gray-600">
                Optimization Metric
                <select value={metric} onChange={(event) => setMetric(event.target.value)} className="workspace-control">
                  <option value="revenue">Revenue</option>
                  <option value="conversions">Conversions</option>
                  <option value="engagement">Engagement</option>
                </select>
              </label>

              <div className="flex items-end">
                <button onClick={runAttribution} disabled={isRunning} className="workspace-action-btn w-full bg-gradient-to-r from-rose-600 to-pink-600 disabled:opacity-60">
                  <Sparkles className="h-4 w-4" /> {isRunning ? 'Running...' : 'Analyze Attribution'}
                </button>
              </div>
            </div>

            {error && <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            {result?.data_source && <p className="mt-3 text-xs text-gray-500">Data source: {result.data_source}</p>}
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

          <div className="workspace-panel">
            <div className="flex flex-wrap gap-2">
              <TabButton label="Model Credit" active={activeTab === 'credit'} onClick={() => setActiveTab('credit')} />
              <TabButton label="Touchpoint Mix" active={activeTab === 'touchpoints'} onClick={() => setActiveTab('touchpoints')} />
              <TabButton label="Budget Scenario" active={activeTab === 'scenario'} onClick={() => setActiveTab('scenario')} />
            </div>

            {activeTab === 'credit' && (
              <div className="mt-4">
                <h3 className="text-lg font-semibold text-gray-900">Attribution Credit by Model</h3>
                <p className="mt-1 text-sm text-gray-500">Compare first-touch, last-touch, linear, and blended channel credit.</p>
                <div className="mt-4 h-[360px] w-full">
                  {modelCreditChart.length > 0 ? (
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
                        <Bar dataKey="blended_revenue" name="Blended" fill="#10b981" radius={[8, 8, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <EmptyChart text="Run attribution analysis to render model credit chart." />
                  )}
                </div>
              </div>
            )}

            {activeTab === 'touchpoints' && (
              <div className="mt-4">
                <h3 className="text-lg font-semibold text-gray-900">Touchpoint Position Mix</h3>
                <p className="mt-1 text-sm text-gray-500">Understand where each channel appears in customer journeys.</p>
                <div className="mt-4 h-[340px] w-full">
                  {touchpointChart.length > 0 ? (
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
                  ) : (
                    <EmptyChart text="Touchpoint mix needs event journey data." />
                  )}
                </div>
              </div>
            )}

            {activeTab === 'scenario' && (
              <div className="mt-4">
                <h3 className="text-lg font-semibold text-gray-900">Budget Shift Scenario</h3>
                <p className="mt-1 text-sm text-gray-500">Compare current vs projected revenue after recommended budget reallocation.</p>
                <div className="mt-4 h-[340px] w-full">
                  {budgetScenarioChart.length > 0 ? (
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
                  ) : (
                    <EmptyChart text="Run analysis to simulate budget scenario impact." />
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="workspace-panel">
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
  return `${(value * 100).toFixed(1)}%`;
}

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`workspace-tab ${
        active
          ? 'border border-rose-500/20 bg-gradient-to-r from-rose-600 to-pink-600 text-white shadow-[0_10px_24px_rgba(225,29,72,0.32)]'
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

