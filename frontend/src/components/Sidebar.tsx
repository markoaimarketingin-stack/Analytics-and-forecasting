
import { useState } from 'react';
import {
  LayoutDashboard,
  TrendingUp,
  PieChart,
  Filter,
  Network,
  Users,
  History,
  Settings,
  ChevronRight,
  X,
  PanelsTopLeft,
  FileBarChart2,
  Lightbulb,
} from 'lucide-react';

interface SidebarProps {
  activeSection: string;
  onSectionChange: (section: string) => void;
  isMobileOpen: boolean;
  onMobileClose: () => void;
}

export default function Sidebar({
  activeSection,
  onSectionChange,
  isMobileOpen,
  onMobileClose,
}: SidebarProps) {
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isSuggestionsOpen, setIsSuggestionsOpen] = useState(false);

  const specialistAgents = [
    {
      id: 'forecast',
      name: 'Forecast Agent',
      icon: TrendingUp,
    },
    {
      id: 'scenario',
      name: 'Scenario Agent',
      icon: PieChart,
    },
    {
      id: 'funnel',
      name: 'Funnel Agent',
      icon: Filter,
    },
    {
      id: 'cohort',
      name: 'Cohort Agent',
      icon: Users,
    },
    {
      id: 'attribution',
      name: 'Attribution Agent',
      icon: Network,
    },
  ];

  return (
    <>
      {isMobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={onMobileClose}
        />
      )}

      <aside
        className={`fixed left-0 top-0 z-50 flex h-screen w-64 flex-col border-r border-white/10 bg-black text-white transition-transform duration-300 lg:translate-x-0 ${
          isMobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-6 pb-6 pt-7">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-sm">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="text-black"
              >
                <path
                  d="M3 12H6L8.2 5L11.8 19L14 10H21"
                  stroke="currentColor"
                  strokeWidth="2.1"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>

            <div className="text-xl font-bold tracking-tight text-white">
              Marko AI
            </div>
          </div>

          <button
            onClick={onMobileClose}
            className="rounded-lg p-1 text-gray-400 hover:bg-neutral-900 hover:text-white lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-5">
          <div className="mb-8">
            <div className="mb-4 px-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-[#7d8eb8]">
              Orchestrator
            </div>

            <button
              onClick={() => {
                onSectionChange('dashboard');
                onMobileClose();
              }}
              className={`group flex w-full items-center gap-3 rounded-2xl border px-4 py-4 text-left transition-all duration-200 ${
                activeSection === 'dashboard'
                  ? 'border-white/10 bg-neutral-900 text-white shadow-[0_8px_24px_rgba(37,99,235,0.12)]'
                  : 'border-transparent text-gray-300 hover:border-white/10 hover:bg-neutral-900 hover:text-white'
              }`}
            >
              <div
                className={`flex h-12 w-12 items-center justify-center rounded-xl transition-all ${
                  activeSection === 'dashboard'
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                    : 'bg-white/5 text-gray-400 group-hover:bg-white/10 group-hover:text-white'
                }`}
              >
                <LayoutDashboard className="h-5 w-5" />
              </div>

              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">Supervisor</div>
              </div>

              <ChevronRight className="h-4 w-4 text-gray-500 transition-transform group-hover:translate-x-1" />
            </button>
          </div>

          <div className="mb-8">
            <div className="mb-4 px-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-[#7d8eb8]">
              Specialist Agents
            </div>

            <div className="space-y-2">
              {specialistAgents.map((agent) => {
                const Icon = agent.icon;
                const isActive = activeSection === agent.id;

                return (
                  <button
                    key={agent.id}
                    onClick={() => {
                      onSectionChange(agent.id);
                      onMobileClose();
                    }}
                    className={`group flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition-all duration-200 ${
                      isActive
                        ? 'bg-neutral-900 text-white'
                        : 'text-gray-300 hover:bg-neutral-900 hover:text-white'
                    }`}
                  >
                    <div
                      className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl transition-all ${
                        isActive
                          ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/25'
                          : 'bg-white/5 text-gray-400 group-hover:bg-white/10 group-hover:text-white'
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                    </div>

                    <div className="min-w-0 flex-1 text-sm font-medium">
                      {agent.name}
                    </div>

                    <ChevronRight className="h-4 w-4 flex-shrink-0 text-gray-500 transition-transform group-hover:translate-x-1" />
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mb-8">
            <div className="mb-4 px-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-[#7d8eb8]">
              Workspace Tools
            </div>

            <div className="space-y-2">
              <button
                onClick={() => {
                  onSectionChange('dashboard');
                  onMobileClose();
                }}
                className="group flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-gray-300 transition-all duration-200 hover:bg-neutral-900 hover:text-white"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/5 text-gray-400 transition-all group-hover:bg-white/10 group-hover:text-white">
                  <PanelsTopLeft className="h-5 w-5" />
                </div>

                <div className="flex-1 text-sm font-medium">Dashboard</div>
                <ChevronRight className="h-4 w-4 text-gray-500 transition-transform group-hover:translate-x-1" />
              </button>

              <button
                onClick={() => {
                  onSectionChange('report');
                  onMobileClose();
                }}
                className="group flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-gray-300 transition-all duration-200 hover:bg-neutral-900 hover:text-white"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/5 text-gray-400 transition-all group-hover:bg-white/10 group-hover:text-white">
                  <FileBarChart2 className="h-5 w-5" />
                </div>

                <div className="flex-1 text-sm font-medium">Report Maker</div>
                <ChevronRight className="h-4 w-4 text-gray-500 transition-transform group-hover:translate-x-1" />
              </button>
            </div>
          </div>

          <div>
            <div className="mb-4 px-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-[#7d8eb8]">
              Analysis
            </div>

            <div className="space-y-2">
              <button
                onClick={() => {
                  setIsSuggestionsOpen(true);
                  onMobileClose();
                }}
                className="group flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-gray-300 transition-all duration-200 hover:bg-neutral-900 hover:text-white"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/5 text-gray-400 transition-all group-hover:bg-amber-500 group-hover:text-white group-hover:shadow-lg group-hover:shadow-amber-500/20">
                  <Lightbulb className="h-5 w-5" />
                </div>

                <div className="flex-1 text-sm font-medium">Suggestions</div>

                <ChevronRight className="h-4 w-4 text-gray-500 transition-transform group-hover:translate-x-1" />
              </button>

              <button
                onClick={() => {
                  setIsHistoryOpen(true);
                  onMobileClose();
                }}
                className="group flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-gray-300 transition-all duration-200 hover:bg-neutral-900 hover:text-white"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/5 text-gray-400 transition-all group-hover:bg-blue-600 group-hover:text-white group-hover:shadow-lg group-hover:shadow-blue-600/25">
                  <History className="h-5 w-5" />
                </div>

                <div className="flex-1 text-sm font-medium">Execution History</div>

                <ChevronRight className="h-4 w-4 text-gray-500 transition-transform group-hover:translate-x-1" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      <div
        className={`fixed inset-0 z-[60] bg-black/30 transition-all duration-300 ${
          isSuggestionsOpen
            ? 'pointer-events-auto opacity-100'
            : 'pointer-events-none opacity-0'
        }`}
        onClick={() => setIsSuggestionsOpen(false)}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className={`absolute right-0 top-0 flex h-full w-[420px] flex-col border-l border-gray-200 bg-white text-gray-900 shadow-2xl transition-transform duration-300 ${
            isSuggestionsOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
        >
          <div className="flex items-center justify-between border-b border-gray-200 px-6 py-5">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-amber-600">
                Smart Assistant
              </div>
              <h2 className="mt-1 text-2xl font-bold text-gray-900">
                Suggestions
              </h2>
            </div>

            <button
              onClick={() => setIsSuggestionsOpen(false)}
              className="flex h-10 w-10 items-center justify-center rounded-xl text-gray-500 transition hover:bg-gray-100 hover:text-gray-900"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            <div className="space-y-4">
              <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5">
                <div className="mb-2 text-sm font-semibold text-gray-900">
                  Recommended Next Action
                </div>
                <p className="text-sm leading-6 text-gray-600">
                  Run Funnel Agent before generating the report to identify the highest drop-off stage.
                </p>
              </div>

              {[
                {
                  title: 'Generate 6-Month Revenue Forecast',
                  description:
                    'Use the latest KPIs and growth assumptions to project upcoming performance.',
                },
                {
                  title: 'Analyze Retention Cohorts',
                  description:
                    'Review which customer groups retain best and which are dropping fastest.',
                },
                {
                  title: 'Create Executive Report',
                  description:
                    'Combine all completed analyses into a polished downloadable report.',
                },
              ].map((item) => (
                <button
                  key={item.title}
                  className="w-full rounded-3xl border border-gray-200 bg-white p-5 text-left transition hover:border-amber-200 hover:bg-amber-50"
                >
                  <div className="text-sm font-semibold text-gray-900">
                    {item.title}
                  </div>
                  <div className="mt-2 text-sm leading-6 text-gray-500">
                    {item.description}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div
        className={`fixed inset-0 z-[60] bg-black/30 transition-all duration-300 ${
          isHistoryOpen
            ? 'pointer-events-auto opacity-100'
            : 'pointer-events-none opacity-0'
        }`}
        onClick={() => setIsHistoryOpen(false)}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className={`absolute right-0 top-0 flex h-full w-[420px] flex-col border-l border-gray-200 bg-white text-gray-900 shadow-2xl transition-transform duration-300 ${
            isHistoryOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
        >
          <div className="flex items-center justify-between border-b border-gray-200 px-6 py-5">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-blue-600">
                Analytics Supervisor
              </div>

              <h2 className="mt-1 text-2xl font-bold text-gray-900">
                Execution History
              </h2>
            </div>

            <button
              onClick={() => setIsHistoryOpen(false)}
              className="flex h-10 w-10 items-center justify-center rounded-xl text-gray-500 transition hover:bg-gray-100 hover:text-gray-900"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            <div className="space-y-5">
              <div className="rounded-3xl border border-gray-200 bg-gray-50 p-5">
                <div className="mb-4 text-[11px] font-semibold uppercase tracking-[0.24em] text-gray-400">
                  Latest Execution
                </div>

                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="mt-1 flex h-7 w-7 items-center justify-center rounded-full bg-green-100 text-xs font-bold text-green-600">
                      ✓
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        Forecast Agent executed
                      </div>
                      <div className="mt-1 text-xs text-gray-500">
                        2 minutes ago
                      </div>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="mt-1 flex h-7 w-7 items-center justify-center rounded-full bg-green-100 text-xs font-bold text-green-600">
                      ✓
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        Funnel Agent executed
                      </div>
                      <div className="mt-1 text-xs text-gray-500">
                        2 minutes ago
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
