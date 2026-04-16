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
  DollarSign,
  Lightbulb,
  Play,
} from 'lucide-react';
import type { ChatThreadSummary, UISuggestionItem } from '../types';

interface SidebarProps {
  activeSection: string;
  onSectionChange: (section: string) => void;
  isMobileOpen: boolean;
  onMobileClose: () => void;
  suggestions: UISuggestionItem[];
  onExecuteSuggestion: (suggestion: UISuggestionItem) => void;
  onUpdateSuggestion: (suggestionId: string, updates: Partial<UISuggestionItem>) => void;
  onRemoveSuggestion: (suggestionId: string) => void;
  chatThreads: ChatThreadSummary[];
  isHistoryLoading: boolean;
  activeThreadId: string | null;
  onOpenHistoryThread: (threadId: string) => void;
  accountName: string;
  accountEmail: string;
  onLogout: () => void;
}

export default function Sidebar({
  activeSection,
  onSectionChange,
  isMobileOpen,
  onMobileClose,
  suggestions,
  onExecuteSuggestion,
  onUpdateSuggestion,
  onRemoveSuggestion,
  chatThreads,
  isHistoryLoading,
  activeThreadId,
  onOpenHistoryThread,
  accountName,
  accountEmail,
  onLogout,
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
    {
      id: 'budget',
      name: 'Budget Allocator',
      icon: DollarSign,
    },
  ];

  const formatRelativeTime = (value?: string) => {
    if (!value) return 'Just now';

    const when = new Date(value).getTime();
    if (Number.isNaN(when)) return 'Just now';

    const deltaMs = Date.now() - when;
    const minutes = Math.max(1, Math.floor(deltaMs / (1000 * 60)));
    if (minutes < 60) return `${minutes}m ago`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;

    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;

    return new Date(value).toLocaleDateString();
  };

  const accountInitial = (() => {
    const source = (accountName || accountEmail || 'User').trim();
    if (!source) return 'U';
    return source.charAt(0).toUpperCase();
  })();

  const inferPriority = (item: UISuggestionItem): 'HIGH' | 'MEDIUM' | 'LOW' => {
    const text = `${item.title} ${item.description} ${item.prompt || ''}`.toLowerCase();
    const highSignals = [
      'urgent', 'critical', 'immediately', 'dropoff', 'churn', 'failure', 'loss', 'decline',
      'decrease', 'spike', 'error', 'risk', 'budget', 'profit', 'roas', 'roi'
    ];
    const mediumSignals = [
      'optimize', 'improve', 'refresh', 'experiment', 'test', 'enhance', 'opportunity', 'boost'
    ];

    if (highSignals.some((signal) => text.includes(signal))) return 'HIGH';
    if (mediumSignals.some((signal) => text.includes(signal))) return 'MEDIUM';
    return 'LOW';
  };

  const priorityBadgeClass = (priority: 'HIGH' | 'MEDIUM' | 'LOW') => {
    if (priority === 'HIGH') return 'border-gray-400 bg-white text-black';
    if (priority === 'MEDIUM') return 'border-gray-300 bg-white text-gray-900';
    return 'border-gray-300 bg-gray-50 text-gray-700';
  };

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
              className={`group flex w-full items-center gap-3 rounded-2xl border px-3.5 py-3 text-left transition-all duration-200 ${
                activeSection === 'supervisor'
                  ? 'border-white/20 bg-neutral-900 text-white'
                  : 'border-transparent text-gray-300 hover:border-white/10 hover:bg-neutral-900 hover:text-white'
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
                    className={`group flex w-full items-center gap-3 rounded-2xl px-3.5 py-2.5 text-left transition-all duration-200 ${
                      isActive
                        ? 'bg-neutral-900 text-white'
                        : 'text-gray-300 hover:bg-neutral-900 hover:text-white'
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
                className="group flex w-full items-center gap-3 rounded-2xl px-3.5 py-2.5 text-left text-gray-300 transition-all duration-200 hover:bg-neutral-900 hover:text-white"
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
                className="group flex w-full items-center gap-3 rounded-2xl px-3.5 py-2.5 text-left text-gray-300 transition-all duration-200 hover:bg-neutral-900 hover:text-white"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/5 text-gray-400 transition-all group-hover:bg-white/10 group-hover:text-white">
                  <FileBarChart2 className="h-4 w-4" />
                </div>

                <div className="flex-1 text-sm font-medium">Report Maker</div>
                <ChevronRight className="h-4 w-4 text-gray-500 transition-transform group-hover:translate-x-1" />
              </button>

            </div>
          </div>

          <div>
            <div className="mb-3 px-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-gray-400">
              Analysis
            </div>

            <div className="space-y-2">
              <button
                onClick={() => {
                  setIsSuggestionsOpen(true);
                  onMobileClose();
                }}
                className="group flex w-full items-center gap-3 rounded-2xl px-3.5 py-2.5 text-left text-gray-300 transition-all duration-200 hover:bg-neutral-900 hover:text-white"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/5 text-gray-400 transition-all group-hover:bg-white/10 group-hover:text-white">
                  <Lightbulb className="h-4 w-4" />
                </div>

                <div className="flex-1 text-sm font-medium">Suggestions</div>

                <ChevronRight className="h-4 w-4 text-gray-500 transition-transform group-hover:translate-x-1" />
              </button>

              <button
                onClick={() => {
                  setIsHistoryOpen(true);
                  onMobileClose();
                }}
                className="group flex w-full items-center gap-3 rounded-2xl px-3.5 py-2.5 text-left text-gray-300 transition-all duration-200 hover:bg-neutral-900 hover:text-white"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/5 text-gray-400 transition-all group-hover:bg-white/10 group-hover:text-white">
                  <History className="h-4 w-4" />
                </div>

                <div className="flex-1 text-sm font-medium">Execution History</div>

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
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-white text-black">
                <Lightbulb className="h-5 w-5" />
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-gray-500">
                  Analytics Supervisor
                </div>
                <h2 className="mt-1 text-2xl font-bold text-gray-900">Suggestions</h2>
              </div>
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
              {suggestions.length > 0 ? (
                suggestions.map((item) => {
                  const isClosed = Boolean(item.submittedAt);
                  const priority = inferPriority(item);

                  return (
                  <div
                    key={item.id}
                    className="w-full rounded-3xl border border-gray-200 bg-white p-5 text-left"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-sm font-semibold text-gray-900">
                        {item.title}
                      </div>
                      <span className={`rounded-xl border px-3 py-1 text-[10px] font-semibold uppercase tracking-wide ${priorityBadgeClass(priority)}`}>
                        {priority}
                      </span>
                    </div>

                    <div className="mt-2 text-sm leading-6 text-gray-500">
                      {item.description}
                    </div>

                    <div className="mt-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-600">
                      Source: {item.source}
                    </div>

                    <div className="mt-5 flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          onExecuteSuggestion(item);
                          setIsSuggestionsOpen(false);
                        }}
                        disabled={isClosed}
                        className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-black px-4 text-sm font-semibold text-white transition hover:bg-gray-900 disabled:cursor-not-allowed disabled:bg-gray-400"
                      >
                        <Play className="h-4 w-4" />
                        Execute in Chat
                      </button>

                      <button
                        type="button"
                        onClick={() => onRemoveSuggestion(item.id)}
                        className="flex h-11 w-11 items-center justify-center rounded-xl border-2 border-gray-300 text-gray-700 transition hover:bg-gray-100"
                        aria-label="Remove suggestion"
                        title="Remove suggestion"
                      >
                        <X className="h-5 w-5" />
                      </button>
                    </div>

                    {isClosed ? (
                      <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-600">
                        Closed {item.submittedAt ? `on ${formatRelativeTime(item.submittedAt)}` : ''}
                      </p>
                    ) : null}

                  </div>
                )})
              ) : (
                <div className="rounded-3xl border border-gray-200 bg-gray-50 p-5 text-sm leading-6 text-gray-600">
                  No suggestions yet. Run any specialist agent to generate actionable recommendations here.
                </div>
              )}
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
            <div className="space-y-3">
              {isHistoryLoading ? (
                <div className="rounded-3xl border border-gray-200 bg-gray-50 p-5 text-sm text-gray-600">
                  Loading chat history...
                </div>
              ) : chatThreads.length > 0 ? (
                chatThreads.map((thread) => {
                  const isActiveThread = activeThreadId === thread.id;
                  return (
                    <button
                      key={thread.id}
                      onClick={() => {
                        onOpenHistoryThread(thread.id);
                        setIsHistoryOpen(false);
                      }}
                      className={`w-full rounded-3xl border p-4 text-left transition ${
                        isActiveThread
                          ? 'border-blue-300 bg-blue-50'
                          : 'border-gray-200 bg-white hover:border-blue-200 hover:bg-blue-50/40'
                      }`}
                    >
                      <div className="truncate text-sm font-semibold text-gray-900">{thread.title || 'New Chat'}</div>
                      <div className="mt-1 line-clamp-2 text-xs leading-5 text-gray-500">
                        {thread.last_message_preview || 'Open this thread to continue the conversation.'}
                      </div>
                      <div className="mt-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-600">
                        {formatRelativeTime(thread.last_message_at || thread.updated_at || thread.created_at)}
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className="rounded-3xl border border-gray-200 bg-gray-50 p-5 text-sm leading-6 text-gray-600">
                  No chat history yet. Start a new chat and it will appear here automatically.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
