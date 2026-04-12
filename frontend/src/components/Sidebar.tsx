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
  LogOut,
} from 'lucide-react';
import type { ChatThreadSummary, RecommendationStatus, UISuggestionItem } from '../types';

interface SidebarProps {
  activeSection: string;
  onSectionChange: (section: string) => void;
  isMobileOpen: boolean;
  onMobileClose: () => void;
  suggestions: UISuggestionItem[];
  onExecuteSuggestion: (suggestion: UISuggestionItem) => void;
  onUpdateSuggestion: (suggestionId: string, updates: Partial<UISuggestionItem>) => void;
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

  const statusLabel = (status: RecommendationStatus, isClosed: boolean) => {
    if (isClosed) return 'Closed';
    if (status === 'in_progress') return 'In Progress';
    if (status === 'implemented') return 'Implemented';
    if (status === 'rejected') return 'Rejected';
    if (status === 'accepted') return 'Accepted';
    return 'Pending';
  };

  const statusBadgeClass = (status: RecommendationStatus, isClosed: boolean) => {
    if (isClosed) return 'bg-slate-100 text-slate-700';
    if (status === 'implemented') return 'bg-emerald-100 text-emerald-700';
    if (status === 'in_progress') return 'bg-blue-100 text-blue-700';
    if (status === 'accepted') return 'bg-indigo-100 text-indigo-700';
    if (status === 'rejected') return 'bg-rose-100 text-rose-700';
    return 'bg-gray-100 text-gray-600';
  };

  const statusButtonClass = (isActive: boolean) =>
    `rounded-lg border px-2 py-1 text-[11px] font-semibold transition ${
      isActive
        ? 'border-gray-900 bg-gray-900 text-white'
        : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50'
    }`;

  const handleSubmitOutcome = (suggestion: UISuggestionItem) => {
    onUpdateSuggestion(suggestion.id, {
      status: suggestion.status,
      owner: suggestion.owner,
      dueDate: suggestion.dueDate,
      expectedImpact: suggestion.expectedImpact,
      actualImpact: suggestion.actualImpact,
      outcomeNotes: suggestion.outcomeNotes,
      submittedAt: new Date().toISOString(),
    });
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
                onSectionChange('supervisor');
                onMobileClose();
              }}
              className={`group flex w-full items-center gap-3 rounded-2xl border px-4 py-4 text-left transition-all duration-200 ${
                activeSection === 'supervisor'
                  ? 'border-white/10 bg-neutral-900 text-white shadow-[0_8px_24px_rgba(37,99,235,0.12)]'
                  : 'border-transparent text-gray-300 hover:border-white/10 hover:bg-neutral-900 hover:text-white'
              }`}
            >
              <div
                className={`flex h-12 w-12 items-center justify-center rounded-xl transition-all ${
                  activeSection === 'supervisor'
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

              <button
                onClick={() => {
                  onSectionChange('settings');
                  onMobileClose();
                }}
                className={`group flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition-all duration-200 ${
                  activeSection === 'settings'
                    ? 'bg-neutral-900 text-white'
                    : 'text-gray-300 hover:bg-neutral-900 hover:text-white'
                }`}
              >
                <div
                  className={`flex h-11 w-11 items-center justify-center rounded-xl transition-all ${
                    activeSection === 'settings'
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/25'
                      : 'bg-white/5 text-gray-400 group-hover:bg-white/10 group-hover:text-white'
                  }`}
                >
                  <Settings className="h-5 w-5" />
                </div>

                <div className="flex-1 text-sm font-medium">Settings</div>
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

        <div className="border-t border-white/10 px-5 py-4">
          <div className="rounded-2xl border border-white/10 bg-neutral-900/70 p-3">
            <div className="flex items-center gap-3">
              <div className="relative flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-blue-500/35 via-violet-500/35 to-cyan-400/35 p-[2px] shadow-[0_10px_22px_rgba(59,130,246,0.28)]">
                <div className="flex h-full w-full items-center justify-center rounded-full border border-white/15 bg-neutral-950 text-lg font-bold uppercase leading-none text-white">
                  {accountInitial}
                </div>
                <span className="absolute bottom-0.5 right-0.5 h-2.5 w-2.5 rounded-full border border-black bg-emerald-400" />
              </div>

              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-white">{accountName || 'User'}</div>
                <div className="truncate text-xs text-gray-400">{accountEmail}</div>
              </div>
            </div>

            <button
              type="button"
              onClick={onLogout}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-gray-200 transition hover:bg-white/10 hover:text-white"
            >
              <LogOut className="h-3.5 w-3.5" />
              Logout
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
              {suggestions.length > 0 ? (
                suggestions.map((item) => {
                  const isClosed = Boolean(item.submittedAt);
                  const canSubmit = !isClosed && (item.status === 'implemented' || item.status === 'rejected');

                  return (
                  <div
                    key={item.id}
                    className="w-full rounded-3xl border border-gray-200 bg-white p-5 text-left"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-sm font-semibold text-gray-900">
                        {item.title}
                      </div>
                      <span className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase ${statusBadgeClass(item.status, isClosed)}`}>
                        {statusLabel(item.status, isClosed)}
                      </span>
                    </div>

                    <div className="mt-2 text-sm leading-6 text-gray-500">
                      {item.description}
                    </div>

                    <div className="mt-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">
                      Source: {item.source}
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className={statusButtonClass(item.status === 'accepted')}
                        disabled={isClosed}
                        onClick={() => onUpdateSuggestion(item.id, { status: 'accepted' })}
                      >
                        Accepted
                      </button>
                      <button
                        type="button"
                        className={statusButtonClass(item.status === 'in_progress')}
                        disabled={isClosed}
                        onClick={() => onUpdateSuggestion(item.id, { status: 'in_progress' })}
                      >
                        In Progress
                      </button>
                      <button
                        type="button"
                        className={statusButtonClass(item.status === 'implemented')}
                        disabled={isClosed}
                        onClick={() => onUpdateSuggestion(item.id, { status: 'implemented' })}
                      >
                        Implemented
                      </button>
                      <button
                        type="button"
                        className={statusButtonClass(item.status === 'rejected')}
                        disabled={isClosed}
                        onClick={() => onUpdateSuggestion(item.id, { status: 'rejected' })}
                      >
                        Rejected
                      </button>
                    </div>

                    <div className="mt-4 grid gap-2 sm:grid-cols-2">
                      <label className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                        Owner
                        <input
                          type="text"
                          value={item.owner || ''}
                          disabled={isClosed}
                          onChange={(event) => onUpdateSuggestion(item.id, { owner: event.target.value })}
                          className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs font-medium text-gray-700"
                          placeholder="Assign owner"
                        />
                      </label>

                      <label className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                        Due Date
                        <input
                          type="date"
                          value={item.dueDate || ''}
                          disabled={isClosed}
                          onChange={(event) => onUpdateSuggestion(item.id, { dueDate: event.target.value })}
                          className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs font-medium text-gray-700"
                        />
                      </label>

                      {item.status === 'implemented' ? (
                        <label className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                          Actual KPI Delta
                          <input
                            type="text"
                            value={item.actualImpact || ''}
                            disabled={isClosed}
                            onChange={(event) => onUpdateSuggestion(item.id, { actualImpact: event.target.value })}
                            className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs font-medium text-gray-700"
                            placeholder="e.g. +5.2% ROAS"
                          />
                        </label>
                      ) : null}
                    </div>

                    <label className="mt-2 block text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                      Outcome Notes
                      <textarea
                        value={item.outcomeNotes || ''}
                        disabled={isClosed}
                        onChange={(event) => onUpdateSuggestion(item.id, { outcomeNotes: event.target.value })}
                        className="mt-1 min-h-[72px] w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs font-medium text-gray-700"
                        placeholder="Capture experiment outcome, blockers, or decisions"
                      />
                    </label>

                    {!isClosed && item.status === 'accepted' ? (
                      <button
                        onClick={() => {
                          onExecuteSuggestion(item);
                          setIsSuggestionsOpen(false);
                        }}
                        className="mt-4 inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-xs font-semibold text-white transition hover:bg-amber-600"
                      >
                        <Play className="h-3.5 w-3.5" />
                        Execute in Chat
                      </button>
                    ) : null}

                    {canSubmit ? (
                      <button
                        type="button"
                        onClick={() => handleSubmitOutcome(item)}
                        className="w-full rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 px-4 py-2 text-sm font-semibold text-white shadow transition hover:from-blue-700 hover:to-violet-700"
                      >
                        Submit
                      </button>
                    ) : null}

                    {isClosed ? (
                      <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-600">
                        Closed {item.submittedAt ? `on ${formatRelativeTime(item.submittedAt)}` : ''}
                      </p>
                    ) : null}

                    {item.status === 'in_progress' ? (
                      <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-blue-600">
                        Execution in progress. Mark implemented or rejected, then submit.
                      </p>
                    ) : null}

                    {item.status === 'pending' ? (
                      <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Mark as accepted to enable execution.
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
