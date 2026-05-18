import { Calendar, Sparkles, Target, TrendingUp } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { orchestrateAgents } from '../../services/api';
import type { AgentOrchestrationResult, ForecastAnalysis } from '../../types';

interface ForecastFormState {
  horizon_days: number;
  channel: string;
  campaign_type: string;
  spend: number;
  impressions: number;
  ctr: number;
  conversion_rate: number;
}

interface ForecastWorkspaceProps {
  onRunResult?: (result: AgentOrchestrationResult) => void;
}

export default function ForecastWorkspace({ onRunResult }: ForecastWorkspaceProps) {
  const [form, setForm] = useState<ForecastFormState>({
    horizon_days: 30,
    channel: 'Google Ads',
    campaign_type: 'Conversion',
    spend: 10000,
    impressions: 50000,
    ctr: 0.12,
    conversion_rate: 0.08,
  });
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

  const runForecast = async () => {
    setIsRunning(true);
    setError(null);

    try {
      const response = await orchestrateAgents({
        intent: 'forecast',
        agents: ['forecast'],
        payload: {
          ...form,
          horizon_days: form.horizon_days,
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
    <div className="workspace-surface">
      <div className="workspace-header-glass px-8 py-3">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-zinc-800 text-white">
            <TrendingUp className="h-7 w-7" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">Forecast Agent</h1>
          </div>
        </div>
      </div>

      <div className="workspace-content">
        <div className="mx-auto w-full max-w-6xl space-y-6">
          <div className="rounded-[28px] border border-zinc-800 bg-zinc-950 p-6 shadow-sm">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <label className="text-sm text-zinc-400">
                Horizon
                <select
                  value={form.horizon_days}
                  onChange={(event) => updateField('horizon_days', Number(event.target.value))}
                  className="mt-1 h-11 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 text-white"
                >
                  <option value={30}>30 days</option>
                  <option value={90}>90 days</option>
                  <option value={180}>180 days</option>
                  <option value={365}>365 days</option>
                </select>
              </label>

              <label className="text-sm text-zinc-400">
                Channel
                <input value={form.channel} onChange={(event) => updateField('channel', event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 text-white" />
              </label>

              <label className="text-sm text-zinc-400">
                Campaign Type
                <input value={form.campaign_type} onChange={(event) => updateField('campaign_type', event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 text-white" />
              </label>

              <label className="text-sm text-zinc-400">
                Spend
                <input type="number" value={form.spend} onChange={(event) => updateField('spend', Number(event.target.value))} className="mt-1 h-11 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 text-white" />
              </label>

              <label className="text-sm text-zinc-400">
                Impressions
                <input type="number" value={form.impressions} onChange={(event) => updateField('impressions', Number(event.target.value))} className="mt-1 h-11 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 text-white" />
              </label>

              <label className="text-sm text-zinc-400">
                CTR
                <input type="number" step="0.001" value={form.ctr} onChange={(event) => updateField('ctr', Number(event.target.value))} className="mt-1 h-11 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 text-white" />
              </label>

              <label className="text-sm text-zinc-400">
                Conversion Rate
                <input type="number" step="0.001" value={form.conversion_rate} onChange={(event) => updateField('conversion_rate', Number(event.target.value))} className="mt-1 h-11 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 text-white" />
              </label>

              <div className="flex items-end">
                <button onClick={runForecast} disabled={isRunning} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-zinc-800 px-4 text-sm font-semibold text-white disabled:opacity-60">
                  <Sparkles className="h-4 w-4" /> {isRunning ? 'Running...' : 'Run Forecast'}
                </button>
              </div>
            </div>

            {error && <p className="mt-4 rounded-xl border border-red-600 bg-red-900/40 px-3 py-2 text-sm text-red-300">{error}</p>}
            {warnings.length > 0 && <p className="mt-3 text-sm text-zinc-400">{warnings.join(' | ')}</p>}
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard title="Forecast Horizon" value={horizonLabel} icon={<Calendar className="h-4 w-4" />} />
            <MetricCard title="Next 30 Day Revenue" value={formatCurrency(result?.next_30_day_revenue)} icon={<TrendingUp className="h-4 w-4" />} />
            <MetricCard title="Predicted ROI" value={formatPercent(result?.predicted_roi)} icon={<Target className="h-4 w-4" />} />
            <MetricCard title="Predicted Profit" value={formatCurrency(result?.predicted_profit)} icon={<Sparkles className="h-4 w-4" />} />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-[28px] border border-zinc-800 bg-zinc-950 p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-white">Top Drivers</h3>
              <ul className="mt-4 space-y-2 text-sm text-zinc-300">
                {(result?.key_drivers ?? []).length > 0 ? (
                  (result?.key_drivers ?? []).map((driver) => (
                    <li key={driver} className="rounded-xl bg-zinc-900 px-3 py-2">{driver}</li>
                  ))
                ) : (
                  <li className="text-zinc-400">Run a forecast to view model drivers.</li>
                )}
              </ul>
            </div>

            <div className="rounded-[28px] border border-zinc-800 bg-zinc-950 p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-white">Assumptions</h3>
              <ul className="mt-4 space-y-2 text-sm text-zinc-300">
                {(result?.assumptions ?? []).length > 0 ? (
                  (result?.assumptions ?? []).map((assumption) => (
                    <li key={assumption} className="rounded-xl bg-zinc-900 px-3 py-2">{assumption}</li>
                  ))
                ) : (
                  <li className="text-zinc-400">Assumptions will appear after execution.</li>
                )}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ title, value, icon }: { title: string; value: string; icon: ReactNode }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 shadow-sm">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">{icon}{title}</div>
      <div className="text-xl font-bold text-white">{value}</div>
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

