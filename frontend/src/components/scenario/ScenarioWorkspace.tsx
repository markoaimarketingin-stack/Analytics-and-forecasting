
import {
  GitBranch,
  Database,
  Upload,
  ArrowRight,
  Sparkles,
  TrendingUp,
  TrendingDown,
  Minus,
  DollarSign,
  Percent,
  Target,
  BarChart3,
} from 'lucide-react';

export default function ScenarioWorkspace() {
  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#f6f7f9]">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white px-8 py-3">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-violet-600 text-white shadow-[0_12px_32px_rgba(124,58,237,0.28)]">
            <GitBranch className="h-7 w-7" />
          </div>

          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">
              Scenario Agent
            </h1>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-6 lg:px-8">
        <div className="mx-auto w-full max-w-5xl space-y-6">
          {/* Setup Card */}
          <div className="rounded-[32px] border border-gray-200 bg-white p-8 shadow-sm lg:p-10">
            <div className="mx-auto max-w-2xl text-center">
              <div className="text-[11px] font-semibold uppercase tracking-[0.35em] text-gray-400">
                Scenario Builder
              </div>

              <h2 className="mt-4 text-4xl font-bold leading-tight text-gray-900">
                Configure Alternate Growth Outcomes
              </h2>

              <p className="mx-auto mt-4 max-w-2xl text-base leading-8 text-gray-500">
                Model how revenue, profitability, and efficiency change under
                different assumptions.
              </p>
            </div>

            {/* Dataset Selection */}
            <div className="mt-12 grid gap-5 lg:grid-cols-2">
              <button className="group flex min-h-[180px] flex-col rounded-[28px] border-2 border-violet-600 bg-violet-50 p-7 text-left transition-all duration-200 hover:-translate-y-1 hover:bg-violet-100 hover:shadow-lg">
                <div className="flex items-center justify-between">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-600 text-white shadow-sm">
                    <Database className="h-7 w-7" />
                  </div>

                  <ArrowRight className="h-5 w-5 text-violet-600 transition-transform duration-200 group-hover:translate-x-1" />
                </div>

                <div className="mt-8">
                  <h3 className="text-2xl font-bold text-gray-900">
                    Use Existing Data
                  </h3>

                  <p className="mt-3 max-w-sm text-sm leading-7 text-gray-600">
                    Build scenarios using historical campaign and revenue data
                    already connected to your workspace.
                  </p>
                </div>
              </button>

              <button className="group flex min-h-[180px] flex-col rounded-[28px] border border-gray-200 bg-white p-7 text-left transition-all duration-200 hover:-translate-y-1 hover:border-violet-300 hover:bg-gray-50 hover:shadow-lg">
                <div className="flex items-center justify-between">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100 text-gray-700 transition group-hover:bg-violet-100 group-hover:text-violet-600">
                    <Upload className="h-7 w-7" />
                  </div>

                  <ArrowRight className="h-5 w-5 text-gray-400 transition-all duration-200 group-hover:translate-x-1 group-hover:text-violet-600" />
                </div>

                <div className="mt-8">
                  <h3 className="text-2xl font-bold text-gray-900">
                    Upload New Dataset
                  </h3>

                  <p className="mt-3 max-w-sm text-sm leading-7 text-gray-600">
                    Upload a CSV or spreadsheet and instantly compare multiple
                    future outcomes.
                  </p>
                </div>
              </button>
            </div>

            {/* Inputs */}
            <div className="mt-12 rounded-[28px] border border-gray-200 bg-[#fafafa] p-6 lg:p-8">
              <div className="grid gap-6 xl:grid-cols-2">
                <div>
                  <label className="mb-3 block text-[11px] font-semibold uppercase tracking-[0.28em] text-gray-400">
                    Scenario Type
                  </label>

                  <select className="h-14 w-full rounded-2xl border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-800 outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-100">
                    <option>Marketing Growth Plan</option>
                    <option>Budget Increase</option>
                    <option>Retention Improvement</option>
                    <option>Conversion Optimization</option>
                    <option>Custom Scenario</option>
                  </select>
                </div>

                <div>
                  <label className="mb-3 block text-[11px] font-semibold uppercase tracking-[0.28em] text-gray-400">
                    Time Horizon
                  </label>

                  <select className="h-14 w-full rounded-2xl border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-800 outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-100">
                    <option>1 Month</option>
                    <option>3 Months</option>
                    <option defaultChecked>6 Months</option>
                    <option>12 Months</option>
                  </select>
                </div>
              </div>

              {/* Sliders */}
              <div className="mt-8 grid gap-5 lg:grid-cols-2">
                <div className="rounded-3xl border border-gray-200 bg-white p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-100 text-blue-700">
                        <DollarSign className="h-5 w-5" />
                      </div>

                      <div>
                        <div className="text-sm font-semibold text-gray-900">
                          Marketing Spend
                        </div>
                        <div className="mt-1 text-xs text-gray-500">
                          Relative to current spend
                        </div>
                      </div>
                    </div>

                    <div className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">
                      +20%
                    </div>
                  </div>

                  <input
                    type="range"
                    min="-50"
                    max="100"
                    defaultValue="20"
                    className="mt-6 w-full accent-violet-600"
                  />
                </div>

                <div className="rounded-3xl border border-gray-200 bg-white p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-green-100 text-green-700">
                        <Percent className="h-5 w-5" />
                      </div>

                      <div>
                        <div className="text-sm font-semibold text-gray-900">
                          Conversion Rate
                        </div>
                        <div className="mt-1 text-xs text-gray-500">
                          Expected increase in conversion
                        </div>
                      </div>
                    </div>

                    <div className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
                      +8%
                    </div>
                  </div>

                  <input
                    type="range"
                    min="-20"
                    max="30"
                    defaultValue="8"
                    className="mt-6 w-full accent-violet-600"
                  />
                </div>

                <div className="rounded-3xl border border-gray-200 bg-white p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
                        <Target className="h-5 w-5" />
                      </div>

                      <div>
                        <div className="text-sm font-semibold text-gray-900">
                          CAC Change
                        </div>
                        <div className="mt-1 text-xs text-gray-500">
                          Customer acquisition cost sensitivity
                        </div>
                      </div>
                    </div>

                    <div className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
                      +5%
                    </div>
                  </div>

                  <input
                    type="range"
                    min="-20"
                    max="40"
                    defaultValue="5"
                    className="mt-6 w-full accent-violet-600"
                  />
                </div>

                <div className="rounded-3xl border border-gray-200 bg-white p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">
                        <BarChart3 className="h-5 w-5" />
                      </div>

                      <div>
                        <div className="text-sm font-semibold text-gray-900">
                          ROAS Improvement
                        </div>
                        <div className="mt-1 text-xs text-gray-500">
                          Expected increase in efficiency
                        </div>
                      </div>
                    </div>

                    <div className="rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-700">
                      +12%
                    </div>
                  </div>

                  <input
                    type="range"
                    min="-20"
                    max="50"
                    defaultValue="12"
                    className="mt-6 w-full accent-violet-600"
                  />
                </div>
              </div>

              <div className="mt-8 flex justify-center lg:justify-end">
                <button className="flex h-14 items-center gap-3 rounded-2xl bg-violet-600 px-8 text-sm font-semibold text-white shadow-[0_14px_30px_rgba(124,58,237,0.25)] transition hover:bg-violet-700">
                  <Sparkles className="h-5 w-5" />
                  Generate Scenarios
                </button>
              </div>
            </div>
          </div>

          {/* Results */}
          <div className="grid gap-6 xl:grid-cols-3">
            <div className="rounded-[30px] border border-green-200 bg-green-50 p-7 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-green-700">
                    Best Case
                  </div>
                  <div className="mt-3 text-4xl font-bold text-gray-900">
                    $240k
                  </div>
                </div>

                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-green-100 text-green-700">
                  <TrendingUp className="h-6 w-6" />
                </div>
              </div>

              <div className="mt-8 space-y-4 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Profit</span>
                  <span className="font-semibold text-gray-900">$112k</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">ROAS</span>
                  <span className="font-semibold text-gray-900">6.2x</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Confidence</span>
                  <span className="font-semibold text-green-700">78%</span>
                </div>
              </div>
            </div>

            <div className="rounded-[30px] border border-violet-200 bg-violet-50 p-7 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-violet-700">
                    Base Case
                  </div>
                  <div className="mt-3 text-4xl font-bold text-gray-900">
                    $180k
                  </div>
                </div>

                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">
                  <Minus className="h-6 w-6" />
                </div>
              </div>

              <div className="mt-8 space-y-4 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Profit</span>
                  <span className="font-semibold text-gray-900">$72k</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">ROAS</span>
                  <span className="font-semibold text-gray-900">4.8x</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Confidence</span>
                  <span className="font-semibold text-violet-700">82%</span>
                </div>
              </div>
            </div>

            <div className="rounded-[30px] border border-red-200 bg-red-50 p-7 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-red-700">
                    Worst Case
                  </div>
                  <div className="mt-3 text-4xl font-bold text-gray-900">
                    $120k
                  </div>
                </div>

                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-100 text-red-700">
                  <TrendingDown className="h-6 w-6" />
                </div>
              </div>

              <div className="mt-8 space-y-4 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Profit</span>
                  <span className="font-semibold text-gray-900">$18k</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">ROAS</span>
                  <span className="font-semibold text-gray-900">2.9x</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Confidence</span>
                  <span className="font-semibold text-red-700">61%</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
