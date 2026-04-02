
import {
  Share2,
  Database,
  Upload,
  ArrowRight,
  Sparkles,
  Mail,
  Search,
  Smartphone,
  Globe,
  TrendingUp,
  ShieldCheck,
  AlertTriangle,
  BarChart3,
  PieChart,
} from 'lucide-react';

export default function AttributionWorkspace() {
  const channels = [
    {
      name: 'Paid Search',
      revenue: '$142k',
      percent: '38%',
      icon: Search,
      card: 'border-blue-200 bg-blue-50',
      iconBg: 'bg-blue-100 text-blue-700',
      badge: 'bg-blue-100 text-blue-700',
      description: 'Highest attributed revenue source',
      width: 'w-full',
      bar: 'bg-blue-500',
    },
    {
      name: 'Email',
      revenue: '$89k',
      percent: '24%',
      icon: Mail,
      card: 'border-emerald-200 bg-emerald-50',
      iconBg: 'bg-emerald-100 text-emerald-700',
      badge: 'bg-emerald-100 text-emerald-700',
      description: 'Strongest retention-driven channel',
      width: 'w-[63%]',
      bar: 'bg-emerald-500',
    },
    {
      name: 'Social Ads',
      revenue: '$78k',
      percent: '21%',
      icon: Smartphone,
      card: 'border-violet-200 bg-violet-50',
      iconBg: 'bg-violet-100 text-violet-700',
      badge: 'bg-violet-100 text-violet-700',
      description: 'Drives strong top-of-funnel demand',
      width: 'w-[55%]',
      bar: 'bg-violet-500',
    },
    {
      name: 'Organic',
      revenue: '$63k',
      percent: '17%',
      icon: Globe,
      card: 'border-amber-200 bg-amber-50',
      iconBg: 'bg-amber-100 text-amber-700',
      badge: 'bg-amber-100 text-amber-700',
      description: 'Lowest cost but slower conversion path',
      width: 'w-[44%]',
      bar: 'bg-amber-500',
    },
  ];

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#f6f7f9]">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white px-8 py-3">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-rose-600 text-white shadow-[0_12px_32px_rgba(225,29,72,0.28)]">
            <Share2 className="h-7 w-7" />
          </div>

          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">
              Attribution Agent
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
                Attribution Analysis
              </div>

              <h2 className="mt-4 text-4xl font-bold leading-tight text-gray-900">
                Discover Which Channels Actually Drive Growth
              </h2>

              <p className="mx-auto mt-4 max-w-2xl text-base leading-8 text-gray-500">
                Compare channels, attribution models, and customer touchpoints
                to understand where your revenue is really coming from.
              </p>
            </div>

            {/* Dataset Selection */}
            <div className="mt-12 grid gap-5 lg:grid-cols-2">
              <button className="group flex min-h-[180px] flex-col rounded-[28px] border-2 border-rose-600 bg-rose-50 p-7 text-left transition-all duration-200 hover:-translate-y-1 hover:bg-rose-100 hover:shadow-lg">
                <div className="flex items-center justify-between">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-600 text-white shadow-sm">
                    <Database className="h-7 w-7" />
                  </div>

                  <ArrowRight className="h-5 w-5 text-rose-600 transition-transform duration-200 group-hover:translate-x-1" />
                </div>

                <div className="mt-8">
                  <h3 className="text-2xl font-bold text-gray-900">
                    Use Existing Marketing Data
                  </h3>

                  <p className="mt-3 max-w-sm text-sm leading-7 text-gray-600">
                    Load previously connected campaign, traffic, and revenue
                    history.
                  </p>
                </div>
              </button>

              <button className="group flex min-h-[180px] flex-col rounded-[28px] border border-gray-200 bg-white p-7 text-left transition-all duration-200 hover:-translate-y-1 hover:border-rose-300 hover:bg-gray-50 hover:shadow-lg">
                <div className="flex items-center justify-between">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100 text-gray-700 transition group-hover:bg-rose-100 group-hover:text-rose-600">
                    <Upload className="h-7 w-7" />
                  </div>

                  <ArrowRight className="h-5 w-5 text-gray-400 transition-all duration-200 group-hover:translate-x-1 group-hover:text-rose-600" />
                </div>

                <div className="mt-8">
                  <h3 className="text-2xl font-bold text-gray-900">
                    Upload Attribution Dataset
                  </h3>

                  <p className="mt-3 max-w-sm text-sm leading-7 text-gray-600">
                    Upload campaign and conversion data to analyze channel
                    impact.
                  </p>
                </div>
              </button>
            </div>

            {/* Controls */}
            <div className="mt-12 rounded-[28px] border border-gray-200 bg-[#fafafa] p-6 lg:p-8">
              <div className="grid gap-6 xl:grid-cols-2">
                <div>
                  <label className="mb-3 block text-[11px] font-semibold uppercase tracking-[0.28em] text-gray-400">
                    Attribution Model
                  </label>

                  <select className="h-14 w-full rounded-2xl border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-800 outline-none transition focus:border-rose-500 focus:ring-4 focus:ring-rose-100">
                    <option>Multi-Touch Attribution</option>
                    <option>First Click Attribution</option>
                    <option>Last Click Attribution</option>
                    <option>Linear Attribution</option>
                    <option>Time Decay Attribution</option>
                  </select>
                </div>

                <div>
                  <label className="mb-3 block text-[11px] font-semibold uppercase tracking-[0.28em] text-gray-400">
                    Conversion Goal
                  </label>

                  <select className="h-14 w-full rounded-2xl border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-800 outline-none transition focus:border-rose-500 focus:ring-4 focus:ring-rose-100">
                    <option>Purchase</option>
                    <option>Lead Generation</option>
                    <option>Trial Signup</option>
                    <option>Subscription</option>
                  </select>
                </div>
              </div>

              <div className="mt-8 flex justify-center lg:justify-end">
                <button className="flex h-14 items-center gap-3 rounded-2xl bg-rose-600 px-8 text-sm font-semibold text-white shadow-[0_14px_30px_rgba(225,29,72,0.25)] transition hover:bg-rose-700">
                  <Sparkles className="h-5 w-5" />
                  Analyze Attribution
                </button>
              </div>
            </div>
          </div>

          {/* Channel Cards */}
          <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-4">
            {channels.map((channel) => {
              const Icon = channel.icon;

              return (
                <div
                  key={channel.name}
                  className={`rounded-[30px] border p-7 shadow-sm ${channel.card}`}
                >
                  <div className="flex items-center justify-between">
                    <div
                      className={`flex h-12 w-12 items-center justify-center rounded-2xl ${channel.iconBg}`}
                    >
                      <Icon className="h-6 w-6" />
                    </div>

                    <div
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${channel.badge}`}
                    >
                      {channel.percent}
                    </div>
                  </div>

                  <div className="mt-6 text-lg font-bold text-gray-900">
                    {channel.name}
                  </div>

                  <div className="mt-2 text-4xl font-bold text-gray-900">
                    {channel.revenue}
                  </div>

                  <div className="mt-3 text-sm leading-6 text-gray-600">
                    {channel.description}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Visualization + Insights */}
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-[32px] border border-gray-200 bg-white p-8 shadow-sm">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-100 text-rose-700">
                  <BarChart3 className="h-6 w-6" />
                </div>

                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-gray-400">
                    Revenue Distribution
                  </div>
                  <div className="mt-1 text-2xl font-bold text-gray-900">
                    Relative Channel Impact
                  </div>
                </div>
              </div>

              <div className="mt-10 space-y-6">
                {channels.map((channel) => (
                  <div key={channel.name}>
                    <div className="mb-3 flex items-center justify-between text-sm">
                      <span className="font-semibold text-gray-700">
                        {channel.name}
                      </span>
                      <span className="font-bold text-gray-900">
                        {channel.percent}
                      </span>
                    </div>

                    <div className="h-4 overflow-hidden rounded-full bg-gray-100">
                      <div
                        className={`h-full rounded-full ${channel.bar} ${channel.width}`}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[32px] border border-gray-200 bg-white p-8 shadow-sm">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">
                  <PieChart className="h-6 w-6" />
                </div>

                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-gray-400">
                    Attribution Summary
                  </div>
                  <div className="mt-1 text-2xl font-bold text-gray-900">
                    Key Findings
                  </div>
                </div>
              </div>

              <div className="mt-10 space-y-4">
                <div className="rounded-3xl bg-gray-50 p-5">
                  <div className="text-sm font-semibold text-gray-900">
                    Most Valuable Channel
                  </div>

                  <p className="mt-2 text-sm leading-7 text-gray-600">
                    Paid Search contributes the highest revenue and performs especially well for high-intent users.
                  </p>
                </div>

                <div className="rounded-3xl bg-gray-50 p-5">
                  <div className="text-sm font-semibold text-gray-900">
                    Most Efficient Channel
                  </div>

                  <p className="mt-2 text-sm leading-7 text-gray-600">
                    Email marketing produces the highest return relative to spend and performs best for returning customers.
                  </p>
                </div>

                <div className="rounded-3xl bg-gray-50 p-5">
                  <div className="text-sm font-semibold text-gray-900">
                    Biggest Gap
                  </div>

                  <p className="mt-2 text-sm leading-7 text-gray-600">
                    Social Ads create strong awareness but underperform later in the conversion funnel.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Summary Cards */}
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="rounded-[30px] border border-rose-200 bg-rose-50 p-7 shadow-sm">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-100 text-rose-700">
                  <TrendingUp className="h-6 w-6" />
                </div>

                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-rose-700">
                    Top Revenue Driver
                  </div>
                  <div className="mt-2 text-2xl font-bold text-gray-900">
                    Paid Search
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-[30px] border border-emerald-200 bg-emerald-50 p-7 shadow-sm">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                  <ShieldCheck className="h-6 w-6" />
                </div>

                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-emerald-700">
                    Most Efficient Channel
                  </div>
                  <div className="mt-2 text-2xl font-bold text-gray-900">
                    Email Marketing
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-[30px] border border-amber-200 bg-amber-50 p-7 shadow-sm">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
                  <AlertTriangle className="h-6 w-6" />
                </div>

                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-amber-700">
                    Underperforming Channel
                  </div>
                  <div className="mt-2 text-2xl font-bold text-gray-900">
                    Social Ads
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}