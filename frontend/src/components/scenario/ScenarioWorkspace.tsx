import { GitBranch, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { orchestrateAgents } from '../../services/api';
import type { AgentOrchestrationResult, ForecastAnalysis, ScenarioAnalysis } from '../../types';

interface ScenarioWorkspaceProps {
  onRunResult?: (result: AgentOrchestrationResult) => void;
}

export default function ScenarioWorkspace({ onRunResult }: ScenarioWorkspaceProps) {
  const [horizonDays, setHorizonDays] = useState(30);
  const [spendChange, setSpendChange] = useState(10);
  const [conversionLift, setConversionLift] = useState(8);
  const [retentionLift, setRetentionLift] = useState(5);
  const [result, setResult] = useState<ScenarioAnalysis | null>(null);
  const [forecast, setForecast] = useState<ForecastAnalysis | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runScenario = async () => {
    setIsRunning(true);
    setError(null);

    try {
      const response = await orchestrateAgents({
        intent: 'scenario_forecast',
        agents: ['forecast', 'scenario'],
        payload: {
          horizon_days: horizonDays,
          adjustments: {
            spend_change: spendChange / 100,
            conversion_change: conversionLift / 100,
            retention_change: retentionLift / 100,
          },
        },
      });

      if (!response.success || !response.data?.success) {
        throw new Error(response.detail || response.data?.errors?.system || 'Failed to run scenario analysis.');
      }

      onRunResult?.(response.data);

      setResult(response.data.scenario_analysis ?? null);
      setForecast(response.data.forecast_analysis ?? null);
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : 'Failed to run scenario analysis.');
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="workspace-surface">
      <div className="workspace-header-glass px-8 py-3">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-violet-600 text-white">
            <GitBranch className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Scenario Agent</h1>
        </div>
      </div>

      <div className="workspace-content">
        <div className="mx-auto w-full max-w-6xl space-y-6">
          <div className="rounded-[28px] border border-gray-200 bg-white p-6 shadow-sm">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <SliderField label={`Horizon Days (${horizonDays})`} min={30} max={365} step={30} value={horizonDays} onChange={setHorizonDays} />
              <SliderField label={`Spend Change (${spendChange}%)`} min={-30} max={40} step={1} value={spendChange} onChange={setSpendChange} />
              <SliderField label={`Conversion Lift (${conversionLift}%)`} min={-20} max={30} step={1} value={conversionLift} onChange={setConversionLift} />
              <SliderField label={`Retention Lift (${retentionLift}%)`} min={-20} max={30} step={1} value={retentionLift} onChange={setRetentionLift} />
            </div>

            <div className="mt-6 flex justify-end">
              <button onClick={runScenario} disabled={isRunning} className="flex h-11 items-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white disabled:opacity-60">
                <Sparkles className="h-4 w-4" /> {isRunning ? 'Running...' : 'Generate Scenarios'}
              </button>
            </div>

            {error && <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <ScenarioCard title="Best Case" revenue={result?.best_case?.revenue} roi={result?.best_case?.roi} tone="green" />
            <ScenarioCard title="Base Case" revenue={result?.base_case?.revenue} roi={result?.base_case?.roi} tone="violet" />
            <ScenarioCard title="Worst Case" revenue={result?.worst_case?.revenue} roi={result?.worst_case?.roi} tone="red" />
          </div>

          <div className="rounded-[28px] border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-gray-900">Forecast Baseline Used for Scenarios</h3>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <MetricCard title="Baseline Revenue" value={formatCurrency(forecast?.next_30_day_revenue)} />
              <MetricCard title="Baseline ROI" value={formatPercent(forecast?.predicted_roi)} />
              <MetricCard title="Baseline Profit" value={formatCurrency(forecast?.predicted_profit)} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SliderField({
  label,
  min,
  max,
  step,
  value,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="text-sm text-gray-600">
      {label}
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} className="mt-3 w-full accent-violet-600" />
    </label>
  );
}

function ScenarioCard({
  title,
  revenue,
  roi,
  tone,
}: {
  title: string;
  revenue?: number;
  roi?: number;
  tone: 'green' | 'violet' | 'red';
}) {
  const toneClass: Record<'green' | 'violet' | 'red', string> = {
    green: 'border-green-200 bg-green-50',
    violet: 'border-violet-200 bg-violet-50',
    red: 'border-red-200 bg-red-50',
  };

  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${toneClass[tone]}`}>
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-600">{title}</div>
      <div className="mt-2 text-2xl font-bold text-gray-900">{formatCurrency(revenue)}</div>
      <div className="mt-2 text-sm text-gray-700">ROI: {formatPercent(roi)}</div>
    </div>
  );
}

function MetricCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</div>
      <div className="mt-2 text-lg font-bold text-gray-900">{value}</div>
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

