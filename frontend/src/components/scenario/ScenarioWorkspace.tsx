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
    <div className="workspace-surface workspace-modern">
      <div className="workspace-header-glass workspace-header-glass-modern px-8 py-3">
        <div className="flex items-center gap-4">
          <div className="workspace-agent-icon bg-gradient-to-br from-violet-600 to-fuchsia-600">
            <GitBranch className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Scenario Agent</h1>
        </div>
      </div>

      <div className="workspace-content">
        <div className="mx-auto w-full max-w-6xl space-y-6">
          <div className="workspace-panel">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <SliderField label="Horizon Days" unit="days" min={30} max={365} step={30} value={horizonDays} onChange={setHorizonDays} />
              <SliderField label="Spend Change" unit="%" min={-30} max={40} step={1} value={spendChange} onChange={setSpendChange} />
              <SliderField label="Conversion Lift" unit="%" min={-20} max={30} step={1} value={conversionLift} onChange={setConversionLift} />
              <SliderField label="Retention Lift" unit="%" min={-20} max={30} step={1} value={retentionLift} onChange={setRetentionLift} />
            </div>

            <div className="mt-6 flex justify-end">
              <button onClick={runScenario} disabled={isRunning} className="workspace-action-btn bg-gradient-to-r from-violet-600 to-fuchsia-600 disabled:opacity-60">
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

          <div className="workspace-panel">
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
  unit,
  min,
  max,
  step,
  value,
  onChange,
}: {
  label: string;
  unit?: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
}) {
  const currentLabel = unit ? `${value}${unit}` : String(value);

  const handleTypedChange = (raw: string) => {
    if (raw.trim() === '') return;
    const parsed = Number(raw);
    if (Number.isNaN(parsed)) return;
    onChange(clampToRange(parsed, min, max));
  };

  return (
    <div className="rounded-2xl border border-violet-100 bg-violet-50/40 p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <label className="text-sm font-medium text-gray-700">{label}</label>
        <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-violet-700">{currentLabel}</span>
      </div>

      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => handleTypedChange(event.target.value)}
        onBlur={() => onChange(clampToRange(value, min, max))}
        className="workspace-control mt-0"
      />

      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-3 w-full cursor-pointer accent-violet-600"
      />
    </div>
  );
}

function clampToRange(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
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
    <div className={`workspace-metric-card border ${toneClass[tone]}`}>
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-600">{title}</div>
      <div className="mt-2 text-2xl font-bold text-gray-900">{formatCurrency(revenue)}</div>
      <div className="mt-2 text-sm text-gray-700">ROI: {formatPercent(roi)}</div>
    </div>
  );
}

function MetricCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="workspace-metric-card bg-gray-50 p-3">
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
