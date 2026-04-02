
import {
  Users,
  Database,
  Upload,
  ArrowRight,
  Sparkles,
  Calendar,
  Repeat,
  TrendingUp,
  Clock3,
  Target,
  UserPlus,
  AlertTriangle,
} from 'lucide-react';

export default function CohortWorkspace() {
  const cohortRows = [
    {
      month: 'Jan 2026',
      values: [100, 72, 58, 49, 42, 38],
    },
    {
      month: 'Feb 2026',
      values: [100, 75, 61, 54, 46, 41],
    },
    {
      month: 'Mar 2026',
      values: [100, 79, 67, 60, 54, 48],
    },
    {
      month: 'Apr 2026',
      values: [100, 81, 70, 63, 57, 52],
    },
  ];

  const getCellClass = (value: number) => {
    if (value >= 80) return 'bg-indigo-700 text-white';
    if (value >= 60) return 'bg-indigo-500 text-white';
    if (value >= 40) return 'bg-indigo-200 text-indigo-900';
    return 'bg-gray-100 text-gray-700';
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#f6f7f9]">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white px-8 py-3">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-indigo-600 text-white shadow-[0_12px_32px_rgba(79,70,229,0.28)]">
            <Users className="h-7 w-7" />
          </div>

          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">
              Cohort Agent
            </h1>


          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-6 lg:px-8">
        <div className="mx-auto w-full max-w-5xl space-y-6">
          {/* Main Setup Card */}
          <div className="rounded-[32px] border border-gray-200 bg-white p-8 shadow-sm lg:p-10">
            <div className="mx-auto max-w-2xl text-center">
              <div className="text-[11px] font-semibold uppercase tracking-[0.35em] text-gray-400">
                Cohort Analysis
              </div>

              <h2 className="mt-4 text-4xl font-bold leading-tight text-gray-900">
                Understand Customer Retention Over Time
              </h2>

              <p className="mx-auto mt-4 max-w-2xl text-base leading-8 text-gray-500">
                Group customers by acquisition period, compare their long-term
                retention, and identify which cohorts create the highest value.
              </p>
            </div>

            {/* Dataset Selection */}
            <div className="mt-12 grid gap-5 lg:grid-cols-2">
              <button className="group flex min-h-[180px] flex-col rounded-[28px] border-2 border-indigo-600 bg-indigo-50 p-7 text-left transition-all duration-200 hover:-translate-y-1 hover:bg-indigo-100 hover:shadow-lg">
                <div className="flex items-center justify-between">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-sm">
                    <Database className="h-7 w-7" />
                  </div>

                  <ArrowRight className="h-5 w-5 text-indigo-600 transition-transform duration-200 group-hover:translate-x-1" />
                </div>

                <div className="mt-8">
                  <h3 className="text-2xl font-bold text-gray-900">
                    Use Existing Customer Data
                  </h3>

                  <p className="mt-3 max-w-sm text-sm leading-7 text-gray-600">
                    Load previously connected acquisition, purchase, and
                    retention datasets.
                  </p>
                </div>
              </button>

              <button className="group flex min-h-[180px] flex-col rounded-[28px] border border-gray-200 bg-white p-7 text-left transition-all duration-200 hover:-translate-y-1 hover:border-indigo-300 hover:bg-gray-50 hover:shadow-lg">
                <div className="flex items-center justify-between">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100 text-gray-700 transition group-hover:bg-indigo-100 group-hover:text-indigo-600">
                    <Upload className="h-7 w-7" />
                  </div>

                  <ArrowRight className="h-5 w-5 text-gray-400 transition-all duration-200 group-hover:translate-x-1 group-hover:text-indigo-600" />
                </div>

                <div className="mt-8">
                  <h3 className="text-2xl font-bold text-gray-900">
                    Upload Cohort Dataset
                  </h3>

                  <p className="mt-3 max-w-sm text-sm leading-7 text-gray-600">
                    Upload a CSV with customer signup dates, purchases, repeat
                    activity, and retention history.
                  </p>
                </div>
              </button>
            </div>

            {/* Controls */}
            <div className="mt-12 rounded-[28px] border border-gray-200 bg-[#fafafa] p-6 lg:p-8">
              <div className="grid gap-6 xl:grid-cols-2">
                <div>
                  <label className="mb-3 block text-[11px] font-semibold uppercase tracking-[0.28em] text-gray-400">
                    Cohort Grouping
                  </label>

                  <div className="relative">
                    <Calendar className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />

                    <select className="h-14 w-full rounded-2xl border border-gray-200 bg-white pl-12 pr-4 text-sm font-semibold text-gray-800 outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100">
                      <option>Monthly Acquisition Cohorts</option>
                      <option>Weekly Acquisition Cohorts</option>
                      <option>Quarterly Cohorts</option>
                      <option>Campaign-Based Cohorts</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="mb-3 block text-[11px] font-semibold uppercase tracking-[0.28em] text-gray-400">
                    Metric To Analyze
                  </label>

                  <div className="relative">
                    <Target className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />

                    <select className="h-14 w-full rounded-2xl border border-gray-200 bg-white pl-12 pr-4 text-sm font-semibold text-gray-800 outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100">
                      <option>Retention Rate</option>
                      <option>Customer Lifetime Value</option>
                      <option>Revenue Per User</option>
                      <option>Repeat Purchase Rate</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="mt-8 flex justify-center lg:justify-end">
                <button className="flex h-14 items-center gap-3 rounded-2xl bg-indigo-600 px-8 text-sm font-semibold text-white shadow-[0_14px_30px_rgba(79,70,229,0.25)] transition hover:bg-indigo-700">
                  <Sparkles className="h-5 w-5" />
                  Analyze Cohorts
                </button>
              </div>
            </div>
          </div>

          {/* Retention Matrix */}
          <div className="rounded-[32px] border border-gray-200 bg-white p-8 shadow-sm lg:p-10">
            <div className="text-center">
              <div className="text-[11px] font-semibold uppercase tracking-[0.35em] text-gray-400">
                Cohort Retention Matrix
              </div>

              <h3 className="mt-4 text-3xl font-bold text-gray-900">
                Retention by Acquisition Month
              </h3>
            </div>

            <div className="mt-10 overflow-x-auto rounded-[28px] border border-gray-200 bg-[#fafafa] p-6">
              <div className="min-w-[760px]">
                <div className="grid grid-cols-7 gap-3 text-center text-xs font-semibold uppercase tracking-[0.25em] text-gray-400">
                  <div></div>
                  <div>Month 1</div>
                  <div>Month 2</div>
                  <div>Month 3</div>
                  <div>Month 4</div>
                  <div>Month 5</div>
                  <div>Month 6</div>
                </div>

                {cohortRows.map((row) => (
                  <div
                    key={row.month}
                    className="mt-4 grid grid-cols-7 items-center gap-3"
                  >
                    <div className="text-sm font-semibold text-gray-700">
                      {row.month}
                    </div>

                    {row.values.map((value, index) => (
                      <div
                        key={index}
                        className={`flex h-14 items-center justify-center rounded-2xl text-sm font-bold ${getCellClass(
                          value,
                        )}`}
                      >
                        {value}%
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Summary Cards */}
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="rounded-[30px] border border-indigo-200 bg-indigo-50 p-7 shadow-sm">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-700">
                  <Repeat className="h-6 w-6" />
                </div>

                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-indigo-700">
                    Best Cohort
                  </div>
                  <div className="mt-2 text-3xl font-bold text-gray-900">
                    April 2026
                  </div>
                </div>
              </div>

              <p className="mt-5 text-sm leading-7 text-gray-600">
                This cohort retained 52% of users after 6 months and showed the strongest repeat purchase behavior.
              </p>
            </div>

            <div className="rounded-[30px] border border-emerald-200 bg-emerald-50 p-7 shadow-sm">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                  <TrendingUp className="h-6 w-6" />
                </div>

                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-emerald-700">
                    Avg. Lifetime Value
                  </div>
                  <div className="mt-2 text-4xl font-bold text-gray-900">
                    $2,430
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-[30px] border border-amber-200 bg-amber-50 p-7 shadow-sm">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
                  <Clock3 className="h-6 w-6" />
                </div>

                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-amber-700">
                    Avg. Time To Churn
                  </div>
                  <div className="mt-2 text-4xl font-bold text-gray-900">
                    4.8 Months
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Insight Cards */}
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-[30px] border border-blue-200 bg-blue-50 p-7 shadow-sm">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-100 text-blue-700">
                  <UserPlus className="h-6 w-6" />
                </div>

                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-blue-700">
                    Fastest Growing Cohort
                  </div>
                  <div className="mt-2 text-2xl font-bold text-gray-900">
                    March 2026 Acquisition Group
                  </div>
                </div>
              </div>

              <p className="mt-5 text-sm leading-7 text-gray-700">
                Customers acquired in March generated 28% more revenue per user than the average cohort, driven by stronger repeat purchases.
              </p>
            </div>

            <div className="rounded-[30px] border border-red-200 bg-red-50 p-7 shadow-sm">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-100 text-red-700">
                  <AlertTriangle className="h-6 w-6" />
                </div>

                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-red-700">
                    Retention Risk
                  </div>
                  <div className="mt-2 text-2xl font-bold text-gray-900">
                    January Cohort Underperforming
                  </div>
                </div>
              </div>

              <p className="mt-5 text-sm leading-7 text-red-800">
                The January cohort shows the steepest early churn. Investigate onboarding quality, acquisition channel quality, and first-month engagement.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
