
import {
  Filter,
  Database,
  Upload,
  ArrowRight,
  Sparkles,
  Users,
  MousePointerClick,
  ShoppingCart,
  CreditCard,
  TrendingDown,
  BarChart3,
  Target,
} from 'lucide-react';
import { useKnowledgeBase } from '../../context/KnowledgeBaseContext';

export default function FunnelWorkspace() {
  const { openKnowledgeModal, openUploadModal } = useKnowledgeBase();
  const FUNNEL_AGENT_ID = 3;
  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#f6f7f9]">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white px-8 py-3">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-emerald-600 text-white shadow-[0_12px_32px_rgba(5,150,105,0.28)]">
            <Filter className="h-7 w-7" />
          </div>

          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">
              Funnel Agent
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
                Funnel Analysis
              </div>

              <h2 className="mt-4 text-4xl font-bold leading-tight text-gray-900">
                Configure Your Conversion Funnel
              </h2>

              <p className="mx-auto mt-4 max-w-2xl text-base leading-8 text-gray-500">
                Analyze the journey from visitor to purchase, identify the
                largest drop-off stage, and estimate the revenue impact of
                optimization.
              </p>
            </div>

            {/* Dataset Cards */}
            <div className="mt-12 grid gap-5 lg:grid-cols-2">
              <button onClick={() => openKnowledgeModal(FUNNEL_AGENT_ID)} className="group flex min-h-[180px] flex-col rounded-[28px] border-2 border-emerald-600 bg-emerald-50 p-7 text-left transition-all duration-200 hover:-translate-y-1 hover:bg-emerald-100 hover:shadow-lg">
                <div className="flex items-center justify-between">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-sm">
                    <Database className="h-7 w-7" />
                  </div>

                  <ArrowRight className="h-5 w-5 text-emerald-600 transition-transform duration-200 group-hover:translate-x-1" />
                </div>

                <div className="mt-8">
                  <h3 className="text-2xl font-bold text-gray-900">
                    Use Existing Data
                  </h3>

                  <p className="mt-3 max-w-sm text-sm leading-7 text-gray-600">
                    Load previously connected funnel, session, conversion, and
                    purchase data.
                  </p>
                </div>
              </button>

              <button onClick={() => openUploadModal(FUNNEL_AGENT_ID)} className="group flex min-h-[180px] flex-col rounded-[28px] border border-gray-200 bg-white p-7 text-left transition-all duration-200 hover:-translate-y-1 hover:border-emerald-300 hover:bg-gray-50 hover:shadow-lg">
                <div className="flex items-center justify-between">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100 text-gray-700 transition group-hover:bg-emerald-100 group-hover:text-emerald-600">
                    <Upload className="h-7 w-7" />
                  </div>

                  <ArrowRight className="h-5 w-5 text-gray-400 transition-all duration-200 group-hover:translate-x-1 group-hover:text-emerald-600" />
                </div>

                <div className="mt-8">
                  <h3 className="text-2xl font-bold text-gray-900">
                    Upload Funnel Data
                  </h3>

                  <p className="mt-3 max-w-sm text-sm leading-7 text-gray-600">
                    Upload a CSV or spreadsheet with visits, clicks, carts, and
                    purchases.
                  </p>
                </div>
              </button>
            </div>

            {/* Controls */}
            <div className="mt-12 rounded-[28px] border border-gray-200 bg-[#fafafa] p-6 lg:p-8">
              <div className="grid gap-6 xl:grid-cols-2">
                <div>
                  <label className="mb-3 block text-[11px] font-semibold uppercase tracking-[0.28em] text-gray-400">
                    Funnel Type
                  </label>

                  <select className="h-14 w-full rounded-2xl border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-800 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100">
                    <option>E-commerce Purchase Funnel</option>
                    <option>SaaS Trial Funnel</option>
                    <option>Lead Generation Funnel</option>
                    <option>Mobile App Funnel</option>
                    <option>Custom Funnel</option>
                  </select>
                </div>

                <div>
                  <label className="mb-3 block text-[11px] font-semibold uppercase tracking-[0.28em] text-gray-400">
                    Segment
                  </label>

                  <select className="h-14 w-full rounded-2xl border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-800 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100">
                    <option>All Users</option>
                    <option>Paid Traffic</option>
                    <option>Organic Traffic</option>
                    <option>Returning Users</option>
                    <option>Mobile Users</option>
                  </select>
                </div>
              </div>

              <div className="mt-8 flex justify-center lg:justify-end">
                <button className="flex h-14 items-center gap-3 rounded-2xl bg-emerald-600 px-8 text-sm font-semibold text-white shadow-[0_14px_30px_rgba(5,150,105,0.25)] transition hover:bg-emerald-700">
                  <Sparkles className="h-5 w-5" />
                  Analyze Funnel
                </button>
              </div>
            </div>
          </div>

          {/* Funnel Visualization */}
          <div className="rounded-[32px] border border-gray-200 bg-white p-8 shadow-sm lg:p-10">
            <div className="text-center">
              <div className="text-[11px] font-semibold uppercase tracking-[0.35em] text-gray-400">
                Funnel Performance
              </div>

              <h3 className="mt-4 text-3xl font-bold text-gray-900">
                User Journey Breakdown
              </h3>
            </div>

            <div className="mt-12 space-y-5">
              {/* Visitors */}
              <div className="rounded-[28px] border border-gray-200 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between gap-6">
                  <div className="flex items-center gap-4">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-100 text-blue-700">
                      <Users className="h-7 w-7" />
                    </div>

                    <div>
                      <div className="text-lg font-semibold text-gray-900">
                        Visitors
                      </div>
                      <div className="mt-1 text-sm text-gray-500">
                        Total users entering the funnel
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-4xl font-bold text-gray-900">
                      120,000
                    </div>
                    <div className="mt-1 text-sm font-medium text-gray-500">
                      100% of traffic
                    </div>
                  </div>
                </div>
              </div>

              {/* Product Views */}
              <div className="rounded-[28px] border border-gray-200 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between gap-6">
                  <div className="flex items-center gap-4">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">
                      <MousePointerClick className="h-7 w-7" />
                    </div>

                    <div>
                      <div className="text-lg font-semibold text-gray-900">
                        Product Page Views
                      </div>
                      <div className="mt-1 text-sm text-gray-500">
                        Users who viewed a product or offer page
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-4xl font-bold text-gray-900">
                      58,400
                    </div>
                    <div className="mt-1 text-sm font-semibold text-red-500">
                      -51.3% drop-off
                    </div>
                  </div>
                </div>

                <div className="mt-5 h-3 overflow-hidden rounded-full bg-gray-100">
                  <div className="h-full w-[49%] rounded-full bg-violet-500" />
                </div>
              </div>

              {/* Add to Cart */}
              <div className="rounded-[28px] border border-amber-200 bg-amber-50 p-6 shadow-sm">
                <div className="flex items-center justify-between gap-6">
                  <div className="flex items-center gap-4">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
                      <ShoppingCart className="h-7 w-7" />
                    </div>

                    <div>
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="text-lg font-semibold text-gray-900">
                          Add To Cart
                        </div>

                        <span className="rounded-full bg-amber-200 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.15em] text-amber-900">
                          Largest Drop-off
                        </span>
                      </div>

                      <div className="mt-1 text-sm text-amber-800">
                        Users who added an item to the cart
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-4xl font-bold text-gray-900">
                      11,700
                    </div>
                    <div className="mt-1 text-sm font-semibold text-amber-700">
                      -79.9% drop-off
                    </div>
                  </div>
                </div>

                <div className="mt-5 h-3 overflow-hidden rounded-full bg-amber-100">
                  <div className="h-full w-[20%] rounded-full bg-amber-500" />
                </div>
              </div>

              {/* Purchases */}
              <div className="rounded-[28px] border border-gray-200 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between gap-6">
                  <div className="flex items-center gap-4">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                      <CreditCard className="h-7 w-7" />
                    </div>

                    <div>
                      <div className="text-lg font-semibold text-gray-900">
                        Purchases
                      </div>
                      <div className="mt-1 text-sm text-gray-500">
                        Completed transactions
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-4xl font-bold text-gray-900">
                      4,250
                    </div>
                    <div className="mt-1 text-sm font-semibold text-red-500">
                      -63.7% drop-off
                    </div>
                  </div>
                </div>

                <div className="mt-5 h-3 overflow-hidden rounded-full bg-gray-100">
                  <div className="h-full w-[8%] rounded-full bg-emerald-500" />
                </div>
              </div>
            </div>
          </div>

          {/* Summary Cards */}
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="rounded-[30px] border border-emerald-200 bg-emerald-50 p-7 shadow-sm">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                  <Target className="h-6 w-6" />
                </div>

                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-emerald-700">
                    Final Conversion
                  </div>
                  <div className="mt-2 text-4xl font-bold text-gray-900">
                    3.54%
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-[30px] border border-amber-200 bg-amber-50 p-7 shadow-sm">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
                  <TrendingDown className="h-6 w-6" />
                </div>

                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-amber-700">
                    Largest Drop-off
                  </div>
                  <div className="mt-2 text-2xl font-bold text-gray-900">
                    Product View → Cart
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-[30px] border border-blue-200 bg-blue-50 p-7 shadow-sm">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-100 text-blue-700">
                  <BarChart3 className="h-6 w-6" />
                </div>

                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-blue-700">
                    Revenue Opportunity
                  </div>
                  <div className="mt-2 text-2xl font-bold text-gray-900">
                    +38% Potential Lift
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
