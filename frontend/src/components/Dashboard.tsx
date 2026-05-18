import { useEffect, useMemo, useState } from 'react';
import { getAgentResults } from '../services/api';
import type {
  AttributionAnalysis,
  CohortAnalysis,
  ForecastAnalysis,
  FunnelAnalysis,
  ScenarioAnalysis,
} from '../types';

interface DashboardProps {
  result: any;
  isLoading: boolean;
}

interface DashboardSnapshot {
  attribution_analysis?: AttributionAnalysis | null;
  funnel_analysis?: FunnelAnalysis | null;
  cohort_analysis?: CohortAnalysis | null;
  forecast_analysis?: ForecastAnalysis | null;
  scenario_analysis?: ScenarioAnalysis | null;
  recommendations?: string[];
  executive_summary?: string;
}

export default function Dashboard({ result, isLoading }: DashboardProps) {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [loadingLatest, setLoadingLatest] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const fromProp = normalizeSnapshot(result);
    if (fromProp) {
      setSnapshot(fromProp);
    }

    const hydrate = async () => {
      setLoadingLatest(true);
      setLoadError(null);
      try {
        const response = await getAgentResults();
        if (!mounted) return;

        const results = response?.results || {};
        const latest = normalizeSnapshot({
          attribution_analysis: results.attribution || null,
          funnel_analysis: results.funnel || null,
          cohort_analysis: results.cohort || null,
          forecast_analysis: results.forecast || null,
          scenario_analysis: results.scenario || null,
          recommendations: response?.recommendations || [],
          executive_summary: response?.executive_summary || null,
        });

        if (latest) {
          setSnapshot(latest);
        }
      } catch (error) {
        if (!mounted) return;
        setLoadError(error instanceof Error ? error.message : 'Unable to fetch dashboard results.');
      } finally {
        if (mounted) setLoadingLatest(false);
      }
    };

    hydrate();

    return () => {
      mounted = false;
    };
  }, [result]);

  const hasData = useMemo(() => {
    return Boolean(
      snapshot?.forecast_analysis ||
      snapshot?.attribution_analysis ||
      snapshot?.funnel_analysis ||
      snapshot?.cohort_analysis ||
      snapshot?.scenario_analysis,
    );
  }, [snapshot]);

  if (isLoading || loadingLatest) {
    return (
      <div className="grid gap-6 lg:grid-cols-2">
        {[1, 2, 3, 4].map((item) => (
          <div key={item} className="h-64 animate-pulse rounded-3xl border border-zinc-800 bg-zinc-950 shadow-sm" />
        ))}
      </div>
    );
  }

  if (!hasData) {
    return (
      <div className="flex min-h-[420px] flex-col items-center justify-center rounded-3xl border border-zinc-800 bg-zinc-950 px-10 py-16 text-center shadow-sm">
            <h2 className="text-2xl font-bold text-white">Dashboard is ready</h2>
            <p className="mt-3 text-zinc-400">Run any agent workspace once to populate all dashboard insights.</p>
            {loadError && <p className="mt-4 text-sm text-zinc-500">{loadError}</p>}
        </div>
    );
  }

  const forecast = snapshot?.forecast_analysis;
  const attribution = snapshot?.attribution_analysis;
  const funnel = snapshot?.funnel_analysis;
  const cohort = snapshot?.cohort_analysis;
  const scenario = snapshot?.scenario_analysis;

  const attributionWeights = Object.entries(attribution?.channel_weights || {})
    .map(([channel, rawWeight]) => [channel, toNumber(rawWeight) ?? 0] as const)
    .sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Forecast Revenue" value={formatCurrency(forecast?.next_30_day_revenue)} />
        <StatCard label="Predicted ROI" value={formatPercent(forecast?.predicted_roi)} />
        <StatCard label="Predicted Profit" value={formatCurrency(forecast?.predicted_profit)} />
        <StatCard label="Forecast Confidence" value={forecast ? `${forecast.confidence}%` : '-'} />
      </div>

      {snapshot?.executive_summary && (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Executive Summary</div>
          <p className="mt-3 text-sm leading-7 text-zinc-300">{snapshot.executive_summary}</p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Attribution Weights</div>
          <h3 className="mt-2 text-lg font-bold text-white">Channel Credit Distribution</h3>
          <div className="mt-4 space-y-3">
            {attributionWeights.length > 0 ? (
              attributionWeights.map(([channel, weight]) => (
                <div key={channel}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-semibold text-white">{channel}</span>
                    <span className="text-zinc-400">{formatPercent(weight)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-zinc-800">
                    <div className="h-2 rounded-full bg-zinc-600" style={{ width: `${Math.min(100, weight * 100)}%` }} />
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-zinc-400">No attribution weights available.</p>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Funnel Analysis</div>
          <h3 className="mt-2 text-lg font-bold text-white">Stage Performance</h3>
          <div className="mt-4 grid gap-3 text-sm">
            <FunnelRow label="Impressions" value={funnel?.funnel?.impressions} />
            <FunnelRow label="Clicks" value={funnel?.funnel?.clicks} />
            <FunnelRow label="Landing Page Views" value={funnel?.funnel?.landing_page_views} />
            <FunnelRow label="Add To Cart" value={funnel?.funnel?.add_to_cart} />
            <FunnelRow label="Purchases" value={funnel?.funnel?.purchases} />
          </div>
          <div className="mt-4 rounded-xl bg-zinc-900 p-3 text-sm text-zinc-300">
            Largest dropoff: {formatDropoffLabel(funnel?.largest_dropoff)} ({funnel ? `${(toNumber(funnel.dropoff_percent) ?? 0).toFixed(1)}%` : '-'})
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Cohort Insights</div>
          <h3 className="mt-2 text-lg font-bold text-white">Retention and Segment Quality</h3>
          <div className="mt-4 grid gap-3 text-sm">
            <SimpleRow label="Average LTV" value={formatCurrency(cohort?.average_ltv)} />
            <SimpleRow label="3-Month Retention" value={formatPercent(cohort?.three_month_retention)} />
            <SimpleRow label="Repeat Purchase Rate" value={formatPercent(cohort?.repeat_purchase_rate)} />
            <SimpleRow label="High Value Segment" value={cohort?.high_value_segment || '-'} />
            <SimpleRow label="High Churn Segment" value={cohort?.high_churn_segment || '-'} />
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Scenario Outlook</div>
          <h3 className="mt-2 text-lg font-bold text-white">Best / Base / Worst Case</h3>
          <div className="mt-4 grid gap-3 md:grid-cols-3 text-sm">
            <ScenarioMini title="Best" revenue={scenario?.best_case?.revenue} roi={scenario?.best_case?.roi} />
            <ScenarioMini title="Base" revenue={scenario?.base_case?.revenue} roi={scenario?.base_case?.roi} />
            <ScenarioMini title="Worst" revenue={scenario?.worst_case?.revenue} roi={scenario?.worst_case?.roi} />
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 shadow-sm">
        <div className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Recommended Actions</div>
        <ul className="mt-3 space-y-2 text-sm text-zinc-300">
          {(snapshot?.recommendations || []).length > 0 ? (
            (snapshot?.recommendations || []).map((item) => (
              <li key={item} className="rounded-xl bg-zinc-900 px-3 py-2">{item}</li>
            ))
          ) : (
            <li className="text-zinc-400">No recommendations yet.</li>
          )}
        </ul>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-400">{label}</div>
      <div className="mt-2 text-2xl font-bold text-white">{value}</div>
    </div>
  );
}

function FunnelRow({ label, value }: { label: string; value?: number }) {
  return <SimpleRow label={label} value={formatCount(value)} />;
}

function SimpleRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-zinc-900 px-3 py-2">
      <span className="text-zinc-400">{label}</span>
      <span className="font-semibold text-white">{value}</span>
    </div>
  );
}

function ScenarioMini({ title, revenue, roi }: { title: string; revenue?: number; roi?: number }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-400">{title}</div>
      <div className="mt-1 text-lg font-bold text-white">{formatCurrency(revenue)}</div>
      <div className="text-xs text-zinc-400">ROI {formatPercent(roi)}</div>
    </div>
  );
}

function formatCurrency(value?: number): string {
  const safe = toNumber(value);
  if (safe === null) return '-';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(safe);
}

function formatPercent(value?: number): string {
  const safe = toNumber(value);
  if (safe === null) return '-';
  return `${(safe * 100).toFixed(1)}%`;
}

function formatCount(value?: number): string {
  const safe = toNumber(value);
  if (safe === null) return '-';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(safe);
}

function formatDropoffLabel(value: unknown): string {
  if (typeof value === 'string' && value.trim()) {
    return value.replace(/_/g, ' ');
  }
  return '-';
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function normalizeSnapshot(raw: any): DashboardSnapshot | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const direct = {
    attribution_analysis: raw.attribution_analysis ?? null,
    funnel_analysis: raw.funnel_analysis ?? null,
    cohort_analysis: raw.cohort_analysis ?? null,
    forecast_analysis: raw.forecast_analysis ?? null,
    scenario_analysis: raw.scenario_analysis ?? null,
    recommendations: Array.isArray(raw.recommendations) ? raw.recommendations : [],
    executive_summary: typeof raw.executive_summary === 'string' ? raw.executive_summary : undefined,
  };

  if (
    direct.attribution_analysis ||
    direct.funnel_analysis ||
    direct.cohort_analysis ||
    direct.forecast_analysis ||
    direct.scenario_analysis
  ) {
    return direct;
  }

  if (raw.agent_results && typeof raw.agent_results === 'object') {
    return {
      attribution_analysis: raw.agent_results.attribution ?? null,
      funnel_analysis: raw.agent_results.funnel ?? null,
      cohort_analysis: raw.agent_results.cohort ?? null,
      forecast_analysis: raw.agent_results.forecast ?? null,
      scenario_analysis: raw.agent_results.scenario ?? null,
      recommendations: Array.isArray(raw.recommendations) ? raw.recommendations : [],
      executive_summary: typeof raw.executive_summary === 'string' ? raw.executive_summary : undefined,
    };
  }

  return null;
}
