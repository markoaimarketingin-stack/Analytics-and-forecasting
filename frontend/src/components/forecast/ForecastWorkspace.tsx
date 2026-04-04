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

export default function ForecastWorkspace() {
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
              <button className="group flex min-h-[180px] flex-col rounded-[28px] border-2 border-blue-600 bg-blue-50 p-7 text-left transition-all duration-200 hover:-translate-y-1 hover:bg-blue-100 hover:shadow-lg">
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

              <button className="group flex min-h-[180px] flex-col rounded-[28px] border border-gray-200 bg-white p-7 text-left transition-all duration-200 hover:-translate-y-1 hover:border-blue-300 hover:bg-gray-50 hover:shadow-lg">
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

                    <select className="h-14 w-full rounded-2xl border border-gray-200 bg-white pl-12 pr-4 text-sm font-semibold text-gray-800 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100">
                      <option>Revenue</option>
                      <option>ROAS</option>
                      <option>Profit</option>
                      <option>CAC</option>
                      <option>Conversion Rate</option>
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

                    <select className="h-14 w-full rounded-2xl border border-gray-200 bg-white pl-12 pr-4 text-sm font-semibold text-gray-800 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100">
                      <option>1 Month</option>
                      <option>3 Months</option>
                      <option defaultChecked>6 Months</option>
                      <option>12 Months</option>
                      <option>24 Months</option>
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
                      defaultValue={10}
                      className="w-full border-0 bg-transparent text-lg font-semibold text-gray-900 outline-none"
                    />

                    <span className="text-sm font-semibold text-gray-500">%</span>
                  </div>
                </div>
              </div>

              <div className="mt-8 flex justify-center lg:justify-end">
                <button className="flex h-14 items-center gap-3 rounded-2xl bg-blue-600 px-8 text-sm font-semibold text-white shadow-[0_14px_30px_rgba(37,99,235,0.25)] transition hover:bg-blue-700">
                  <Sparkles className="h-5 w-5" />
                  Generate Forecast
                </button>
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
                    Revenue Forecast
                  </h3>
                </div>

                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-100 text-blue-700">
                  <BarChart3 className="h-6 w-6" />
                </div>
              </div>

              <div className="mt-10">
                <div className="text-5xl font-bold tracking-tight text-gray-900">
                  $180k
                </div>

                <div className="mt-3 inline-flex rounded-full bg-green-100 px-4 py-2 text-sm font-semibold text-green-700">
                  +18% over next 6 months
                </div>
              </div>

              <div className="mt-10 h-36 rounded-3xl bg-gradient-to-br from-blue-50 via-white to-blue-100 p-6">
                <div className="flex h-full items-end gap-3">
                  <div className="w-1/6 rounded-t-2xl bg-blue-200" style={{ height: '38%' }} />
                  <div className="w-1/6 rounded-t-2xl bg-blue-300" style={{ height: '52%' }} />
                  <div className="w-1/6 rounded-t-2xl bg-blue-400" style={{ height: '64%' }} />
                  <div className="w-1/6 rounded-t-2xl bg-blue-500" style={{ height: '76%' }} />
                  <div className="w-1/6 rounded-t-2xl bg-blue-500" style={{ height: '88%' }} />
                  <div className="w-1/6 rounded-t-2xl bg-blue-600" style={{ height: '100%' }} />
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
                  82%
                </div>

                <div className="mb-2 rounded-full bg-green-100 px-4 py-2 text-sm font-semibold text-green-700">
                  High Confidence
                </div>
              </div>

              <div className="mt-8 h-3 overflow-hidden rounded-full bg-gray-100">
                <div className="h-full w-[82%] rounded-full bg-blue-600" />
              </div>

              <div className="mt-8 space-y-4 rounded-3xl bg-gray-50 p-5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Historical Data Coverage</span>
                  <span className="font-semibold text-gray-900">12 Months</span>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Trend Stability</span>
                  <span className="font-semibold text-green-600">Strong</span>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Seasonality Confidence</span>
                  <span className="font-semibold text-gray-900">78%</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
