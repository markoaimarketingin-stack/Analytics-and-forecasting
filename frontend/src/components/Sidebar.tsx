import {
  LayoutDashboard,
  TrendingUp,
  PieChart,
  Filter,
  Network,
  Users,
  DatabaseZap,
  Settings,
  ChevronRight,
  X,
  PanelsTopLeft,
  FileBarChart2,
  DollarSign,
  Layers,
} from 'lucide-react';

interface SidebarProps {
  activeSection: string;
  onSectionChange: (section: string) => void;
  isMobileOpen: boolean;
  onMobileClose: () => void;
  accountName: string;
  accountEmail: string;
}

export default function Sidebar({
  activeSection,
  onSectionChange,
  isMobileOpen,
  onMobileClose,
  accountName,
  accountEmail,
}: SidebarProps) {
  const specialistAgents = [
    {
      id: 'preprocessing',
      name: 'Preprocessing Agent',
      icon: Layers,
    },
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
    {
      id: 'budget',
      name: 'Budget Allocator',
      icon: DollarSign,
    },
    {
      id: 'data-query',
      name: 'Data Query Agent',
      icon: DatabaseZap,
    },
  ];

  const accountInitial = (() => {
    const source = (accountName || accountEmail || 'User').trim();
    if (!source) return 'U';
    return source.charAt(0).toUpperCase();
  })();

  return (
    <>
      {isMobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 transition-opacity duration-300 lg:hidden"
          onClick={onMobileClose}
        />
      )}

      <aside
        className={`sidebar-shell fixed left-0 top-0 z-50 flex h-screen w-64 flex-col border-r border-white/10 text-white transition-transform duration-300 lg:translate-x-0 ${
          isMobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-5 pb-5 pt-6">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-transparent">
              <img src="/img.png" alt="Marko AI" className="h-full w-full object-cover" />
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

        <div className="flex-1 overflow-y-auto px-4 pb-4">
          <div className="mb-8">
            <div className="mb-3 px-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-gray-400">
              Orchestrator
            </div>

            <button
              onClick={() => {
                onSectionChange('supervisor');
                onMobileClose();
              }}
              className={`group flex w-full items-center gap-3 rounded-2xl border px-3.5 py-3 text-left transition-all duration-300 ${
                activeSection === 'supervisor'
                  ? 'border-white/20 bg-white/10 text-white shadow-[0_10px_22px_rgba(0,0,0,0.3)]'
                  : 'border-transparent text-gray-300 hover:border-white/10 hover:bg-white/10 hover:text-white'
              }`}
            >
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-xl transition-all ${
                  activeSection === 'supervisor'
                    ? 'bg-white text-black'
                    : 'bg-white/5 text-gray-400 group-hover:bg-white/10 group-hover:text-white'
                }`}
              >
                <LayoutDashboard className="h-4 w-4" />
              </div>

              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">Supervisor</div>
              </div>

              <ChevronRight className="h-4 w-4 text-gray-500 transition-transform group-hover:translate-x-1" />
            </button>
          </div>

          <div className="mb-8">
            <div className="mb-3 px-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-gray-400">
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
                    className={`group flex w-full items-center gap-3 rounded-2xl px-3.5 py-2.5 text-left transition-all duration-300 ${
                      isActive
                        ? 'bg-white/10 text-white shadow-[0_10px_20px_rgba(0,0,0,0.22)]'
                        : 'text-gray-300 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <div
                      className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg transition-all ${
                        isActive
                          ? 'bg-white text-black'
                          : 'bg-white/5 text-gray-400 group-hover:bg-white/10 group-hover:text-white'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
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
            <div className="mb-3 px-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-gray-400">
              Workspace Tools
            </div>

            <div className="space-y-2">
              <button
                onClick={() => {
                  onSectionChange('dashboard');
                  onMobileClose();
                }}
                className="group flex w-full items-center gap-3 rounded-2xl px-3.5 py-2.5 text-left text-gray-300 transition-all duration-300 hover:bg-white/10 hover:text-white"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/5 text-gray-400 transition-all group-hover:bg-white/10 group-hover:text-white">
                  <PanelsTopLeft className="h-4 w-4" />
                </div>

                <div className="flex-1 text-sm font-medium">Dashboard</div>
                <ChevronRight className="h-4 w-4 text-gray-500 transition-transform group-hover:translate-x-1" />
              </button>

              <button
                onClick={() => {
                  onSectionChange('report');
                  onMobileClose();
                }}
                className="group flex w-full items-center gap-3 rounded-2xl px-3.5 py-2.5 text-left text-gray-300 transition-all duration-300 hover:bg-white/10 hover:text-white"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/5 text-gray-400 transition-all group-hover:bg-white/10 group-hover:text-white">
                  <FileBarChart2 className="h-4 w-4" />
                </div>

                <div className="flex-1 text-sm font-medium">Report Maker</div>
                <ChevronRight className="h-4 w-4 text-gray-500 transition-transform group-hover:translate-x-1" />
              </button>

            </div>
          </div>
        </div>

        <div className="border-t border-white/10 px-5 py-3.5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-white text-lg font-bold uppercase leading-none text-black">
                {accountInitial}
              </div>

              <div className="min-w-0">
                <div className="truncate text-[15px] font-semibold text-white">{accountName || 'User'}</div>
                <div className="truncate text-xs text-gray-300">Pro Plan</div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                onSectionChange('settings');
                onMobileClose();
              }}
              className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border transition ${
                activeSection === 'settings'
                  ? 'border-white bg-white text-black'
                  : 'border-white/10 bg-white/5 text-gray-400 hover:border-white/20 hover:bg-white/10 hover:text-white'
              }`}
              aria-label="Open settings"
              title="Settings"
            >
              <Settings className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
