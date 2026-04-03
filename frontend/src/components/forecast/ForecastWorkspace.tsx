import {
  TrendingUp,
  Upload,
  Database,
  Target,
  Calendar,
  Sparkles,
  ShieldCheck,
  BarChart3,
  ArrowRight,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useKnowledgeBase } from '../../context/KnowledgeBaseContext';
import { predictForecast, trainForecastModel } from '../../services/api';
import type {
  ForecastAgentData,
  ForecastRequestPayload,
} from '../../types';

export default function ForecastWorkspace() {
  const { openKnowledgeModal, openUploadModal } = useKnowledgeBase();
  const FORECAST_AGENT_ID = 1;

  const [form, setForm] = useState<ForecastRequestPayload>({
    channel: 'Google Ads',
    campaign_type: 'Conversion',
    spend: 10000,
    impressions: 50000,
    ctr: 0.12,
    conversion_rate: 0.08,
    horizon_days: 30,
  });
  const [kpi, setKpi] = useState('Revenue');
  const [expectedGrowth, setExpectedGrowth] = useState(10);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isTraining, setIsTraining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forecastResult, setForecastResult] = useState<ForecastAgentData | null>(null);
  const [lastTrainMessage, setLastTrainMessage] = useState<string | null>(null);

  const horizonLabel = useMemo(() => {
    if (form.horizon_days <= 30) return '1 Month';
    if (form.horizon_days <= 90) return '3 Months';
    if (form.horizon_days <= 180) return '6 Months';
    if (form.horizon_days <= 365) return '12 Months';
    return '24 Months';
  }, [form.horizon_days]);

  const confidenceScore = useMemo(() => {
    if (!forecastResult) return 0;
    const drivers = forecastResult.top_drivers?.length ?? 0;
    const retentionBoost = forecastResult.retention_adjustment?.available ? 8 : 0;
    const baseline = 64;
    return Math.min(95, baseline + drivers * 3 + retentionBoost);
  }, [forecastResult]);

  const projectedHeadline = useMemo(() => {
    if (!forecastResult) return '$0';
    if (kpi === 'Profit') return `$${Math.round(forecastResult.predicted_profit).toLocaleString()}`;
    if (kpi === 'ROAS') return `${(forecastResult.predicted_roi + 1).toFixed(2)}x`;
    if (kpi === 'Conversion Rate') return `${(form.conversion_rate * 100).toFixed(2)}%`;
    return `$${Math.round(forecastResult.predicted_revenue).toLocaleString()}`;
  }, [forecastResult, kpi, form.conversion_rate]);

  const trendText = useMemo(() => {
    if (!forecastResult) return `+${expectedGrowth}% over ${horizonLabel.toLowerCase()}`;
    return `ROI ${(forecastResult.predicted_roi * 100).toFixed(1)}% over ${horizonLabel.toLowerCase()}`;
  }, [expectedGrowth, forecastResult, horizonLabel]);

  const chartBars = useMemo(() => {
    if (!forecastResult?.daily_forecast?.length) {
      return [38, 52, 64, 76, 88, 100];
    }
    const points = forecastResult.daily_forecast;
    const slices = [0, 0.2, 0.4, 0.6, 0.8, 1].map((ratio) => {
      const index = Math.min(points.length - 1, Math.floor(ratio * (points.length - 1)));
      return points[index].forecast_revenue;
    });
    const max = Math.max(...slices, 1);
    return slices.map((value) => Math.max(15, Math.round((value / max) * 100)));
  }, [forecastResult]);

  const handleTrainModel = async () => {
    setIsTraining(true);
    setError(null);
    setLastTrainMessage(null);
    try {
      const response = await trainForecastModel();
      if (!response.success) {
        throw new Error(response.detail || 'Forecast training failed');
      }
      const metrics = response.data;
      setLastTrainMessage(
        metrics
          ? `Model trained (${metrics.rows} rows, RMSE ${metrics.rmse}, MAE ${metrics.mae}).`
          : response.message || 'Model trained successfully.',
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to train forecast model');
    } finally {
      setIsTraining(false);
    }
  };

  const runForecast = async (retryOnUntrained = true) => {
    const response = await predictForecast(form);
    if (!response.success || !response.data) {
      throw new Error(response.detail || 'Forecast prediction failed');
    }

    const forecastNode = response.data.agent_results?.forecast;
    if (!forecastNode) {
      throw new Error('Forecast response is missing forecast result node');
    }

    if (forecastNode.status !== 'success' || !forecastNode.data) {
      const nodeError = forecastNode.error || response.data.errors?.forecast;
      const message = nodeError || 'Forecast agent returned an error';

      if (retryOnUntrained && message.toLowerCase().includes('not trained')) {
        await handleTrainModel();
        return runForecast(false);
      }

      throw new Error(message);
    }

    return forecastNode.data;
  };

  const handleGenerateForecast = async () => {
    setIsGenerating(true);
    setError(null);
    try {
      const data = await runForecast(true);
      setForecastResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate forecast');
    } finally {
      setIsGenerating(false);
    }
  };

  const updateField = <K extends keyof ForecastRequestPayload>(key: K, value: ForecastRequestPayload[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#f6f7f9]">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white px-8 py-3">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-blue-600 text-white shadow-[0_12px_32px_rgba(79,70,229,0.28)]">
            <TrendingUp className="h-7 w-7" />
          </div>

          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">
              Forecast Agent
            </h1>

          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-6 lg:px-8">
        <div className="mx-auto w-full max-w-5xl space-y-6">
          {/* Main Configuration Card */}
          <div className="rounded-[32px] border border-gray-200 bg-white p-8 shadow-sm lg:p-10">
            {/* Intro */}
            <div className="mx-auto max-w-2xl text-center">
              <div className="text-[11px] font-semibold uppercase tracking-[0.35em] text-gray-400">
                Forecast Setup
              </div>

              <h2 className="mt-4 text-4xl font-bold leading-tight text-gray-900">
                Configure Your Forecast
              </h2>

              <p className="mx-auto mt-4 max-w-xl text-base leading-8 text-gray-500">
                Select a dataset source, choose the KPI you want to project,
                and define your forecast assumptions.
              </p>
            </div>

            {/* Dataset Selection */}
            <div className="mt-12 grid gap-5 lg:grid-cols-2">
              <button onClick={() => openKnowledgeModal(FORECAST_AGENT_ID)} className="group flex min-h-[180px] flex-col rounded-[28px] border-2 border-blue-600 bg-blue-50 p-7 text-left transition-all duration-200 hover:-translate-y-1 hover:bg-blue-100 hover:shadow-lg">
                <div className="flex items-center justify-between">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-sm">
                    <Database className="h-7 w-7" />
                  </div>

                  <ArrowRight className="h-5 w-5 text-blue-600 transition-transform duration-200 group-hover:translate-x-1" />
                </div>

                <div className="mt-8">
                  <h3 className="text-2xl font-bold text-gray-900">
                    Use Existing Data
                  </h3>

                  <p className="mt-3 max-w-sm text-sm leading-7 text-gray-600">
                    Select from your connected knowledge base, previous uploads,
                    or saved forecast datasets.
                  </p>
                </div>
              </button>

              <button onClick={() => openUploadModal(FORECAST_AGENT_ID)} className="group flex min-h-[180px] flex-col rounded-[28px] border border-gray-200 bg-white p-7 text-left transition-all duration-200 hover:-translate-y-1 hover:border-blue-300 hover:bg-gray-50 hover:shadow-lg">
                <div className="flex items-center justify-between">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100 text-gray-700 transition group-hover:bg-blue-100 group-hover:text-blue-600">
                    <Upload className="h-7 w-7" />
                  </div>

                  <ArrowRight className="h-5 w-5 text-gray-400 transition-all duration-200 group-hover:translate-x-1 group-hover:text-blue-600" />
                </div>

                <div className="mt-8">
                  <h3 className="text-2xl font-bold text-gray-900">
                    Upload New Data
                  </h3>

                  <p className="mt-3 max-w-sm text-sm leading-7 text-gray-600">
                    Upload a CSV, Excel sheet, or historical performance file to
                    generate a new forecast.
                  </p>
                </div>
              </button>
            </div>

            {/* Inputs */}
            <div className="mt-12 rounded-[28px] border border-gray-200 bg-[#fafafa] p-6 lg:p-8">
              <div className="grid gap-6 xl:grid-cols-3">
                {/* KPI */}
                <div>
                  <label className="mb-3 block text-[11px] font-semibold uppercase tracking-[0.28em] text-gray-400">
                    KPI To Forecast
                  </label>

                  <div className="relative">
                    <Target className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />

                    <select
                      value={kpi}
                      onChange={(e) => setKpi(e.target.value)}
                      className="h-14 w-full rounded-2xl border border-gray-200 bg-white pl-12 pr-4 text-sm font-semibold text-gray-800 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                    >
                      <option value="Revenue">Revenue</option>
                      <option value="ROAS">ROAS</option>
                      <option value="Profit">Profit</option>
                      <option value="CAC">CAC</option>
                      <option value="Conversion Rate">Conversion Rate</option>
                    </select>
                  </div>
                </div>

                {/* Horizon */}
                <div>
                  <label className="mb-3 block text-[11px] font-semibold uppercase tracking-[0.28em] text-gray-400">
                    Forecast Horizon
                  </label>

                  <div className="relative">
                    <Calendar className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />

                    <select
                      value={form.horizon_days}
                      onChange={(e) => updateField('horizon_days', Number(e.target.value))}
                      className="h-14 w-full rounded-2xl border border-gray-200 bg-white pl-12 pr-4 text-sm font-semibold text-gray-800 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                    >
                      <option value={30}>1 Month</option>
                      <option value={90}>3 Months</option>
                      <option value={180}>6 Months</option>
                      <option value={365}>12 Months</option>
                      <option value={730}>24 Months</option>
                    </select>
                  </div>
                </div>

                {/* Growth */}
                <div>
                  <label className="mb-3 block text-[11px] font-semibold uppercase tracking-[0.28em] text-gray-400">
                    Expected Growth
                  </label>

                  <div className="flex h-14 items-center rounded-2xl border border-gray-200 bg-white px-4 transition focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-100">
                    <input
                      type="number"
                      value={expectedGrowth}
                      onChange={(e) => setExpectedGrowth(Number(e.target.value || 0))}
                      className="w-full border-0 bg-transparent text-lg font-semibold text-gray-900 outline-none"
                    />

                    <span className="text-sm font-semibold text-gray-500">%</span>
                  </div>
                </div>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <input
                  value={form.channel}
                  onChange={(e) => updateField('channel', e.target.value)}
                  className="h-12 rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  placeholder="Channel (e.g. Google Ads)"
                />
                <input
                  value={form.campaign_type}
                  onChange={(e) => updateField('campaign_type', e.target.value)}
                  className="h-12 rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  placeholder="Campaign Type"
                />
                <input
                  type="number"
                  value={form.spend}
                  onChange={(e) => updateField('spend', Number(e.target.value || 0))}
                  className="h-12 rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  placeholder="Spend"
                />
                <input
                  type="number"
                  value={form.impressions}
                  onChange={(e) => updateField('impressions', Number(e.target.value || 0))}
                  className="h-12 rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  placeholder="Impressions"
                />
                <input
                  type="number"
                  step="0.001"
                  value={form.ctr}
                  onChange={(e) => updateField('ctr', Number(e.target.value || 0))}
                  className="h-12 rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  placeholder="CTR (e.g. 0.05)"
                />
                <input
                  type="number"
                  step="0.001"
                  value={form.conversion_rate}
                  onChange={(e) => updateField('conversion_rate', Number(e.target.value || 0))}
                  className="h-12 rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  placeholder="Conversion Rate (e.g. 0.03)"
                />
              </div>

              {(error || lastTrainMessage) && (
                <div className="mt-6 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm">
                  {error && <p className="font-medium text-red-600">{error}</p>}
                  {!error && lastTrainMessage && <p className="font-medium text-green-600">{lastTrainMessage}</p>}
                </div>
              )}

              <div className="mt-8 flex justify-center lg:justify-end">
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    onClick={handleTrainModel}
                    disabled={isTraining || isGenerating}
                    className="flex h-14 items-center gap-3 rounded-2xl border border-blue-200 bg-white px-6 text-sm font-semibold text-blue-700 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isTraining ? 'Training...' : 'Train Model'}
                  </button>
                  <button
                    onClick={handleGenerateForecast}
                    disabled={isGenerating || isTraining}
                    className="flex h-14 items-center gap-3 rounded-2xl bg-blue-600 px-8 text-sm font-semibold text-white shadow-[0_14px_30px_rgba(37,99,235,0.25)] transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Sparkles className="h-5 w-5" />
                    {isGenerating ? 'Generating...' : 'Generate Forecast'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Forecast Output */}
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-[30px] border border-gray-200 bg-white p-7 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-gray-400">
                    Projected KPI
                  </div>

                  <h3 className="mt-3 text-2xl font-bold text-gray-900">
                    {kpi} Forecast
                  </h3>
                </div>

                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-100 text-blue-700">
                  <BarChart3 className="h-6 w-6" />
                </div>
              </div>

              <div className="mt-10">
                <div className="text-5xl font-bold tracking-tight text-gray-900">
                  {projectedHeadline}
                </div>

                <div className="mt-3 inline-flex rounded-full bg-green-100 px-4 py-2 text-sm font-semibold text-green-700">
                  {trendText}
                </div>
              </div>

              <div className="mt-10 h-36 rounded-3xl bg-gradient-to-br from-blue-50 via-white to-blue-100 p-6">
                <div className="flex h-full items-end gap-3">
                  <div className="w-1/6 rounded-t-2xl bg-blue-200" style={{ height: `${chartBars[0]}%` }} />
                  <div className="w-1/6 rounded-t-2xl bg-blue-300" style={{ height: `${chartBars[1]}%` }} />
                  <div className="w-1/6 rounded-t-2xl bg-blue-400" style={{ height: `${chartBars[2]}%` }} />
                  <div className="w-1/6 rounded-t-2xl bg-blue-500" style={{ height: `${chartBars[3]}%` }} />
                  <div className="w-1/6 rounded-t-2xl bg-blue-500" style={{ height: `${chartBars[4]}%` }} />
                  <div className="w-1/6 rounded-t-2xl bg-blue-600" style={{ height: `${chartBars[5]}%` }} />
                </div>
              </div>
            </div>

            <div className="rounded-[30px] border border-gray-200 bg-white p-7 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-gray-400">
                    Confidence Score
                  </div>

                  <h3 className="mt-3 text-2xl font-bold text-gray-900">
                    Forecast Reliability
                  </h3>
                </div>

                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-green-100 text-green-700">
                  <ShieldCheck className="h-6 w-6" />
                </div>
              </div>

              <div className="mt-10 flex items-end gap-4">
                <div className="text-6xl font-bold leading-none text-gray-900">
                  {confidenceScore}%
                </div>

                <div className="mb-2 rounded-full bg-green-100 px-4 py-2 text-sm font-semibold text-green-700">
                  {confidenceScore >= 80 ? 'High Confidence' : confidenceScore >= 65 ? 'Moderate Confidence' : 'Low Confidence'}
                </div>
              </div>

              <div className="mt-8 h-3 overflow-hidden rounded-full bg-gray-100">
                <div className="h-full rounded-full bg-blue-600" style={{ width: `${confidenceScore}%` }} />
              </div>

              <div className="mt-8 space-y-4 rounded-3xl bg-gray-50 p-5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Historical Data Coverage</span>
                  <span className="font-semibold text-gray-900">{horizonLabel}</span>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Trend Stability</span>
                  <span className="font-semibold text-green-600">
                    {forecastResult ? (forecastResult.predicted_roi > 0 ? 'Strong' : 'Volatile') : 'Pending'}
                  </span>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Seasonality Confidence</span>
                  <span className="font-semibold text-gray-900">
                    {forecastResult?.retention_adjustment?.future_revenue_multiplier
                      ? `${Math.round((forecastResult.retention_adjustment.future_revenue_multiplier - 1) * 100)}% boost`
                      : 'N/A'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
