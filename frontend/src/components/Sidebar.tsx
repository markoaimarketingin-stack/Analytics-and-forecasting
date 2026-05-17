import React, { useState } from 'react';
import {
  LayoutDashboard,
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
  Play,
  TrendingUp,
} from 'lucide-react';
import type { UISuggestionItem } from '../types';

interface SidebarProps {
  activeSection: string;
  onSectionChange: (section: string) => void;
  isMobileOpen: boolean;
  onMobileClose: () => void;
  suggestions: UISuggestionItem[];
  onExecuteSuggestion: (suggestion: UISuggestionItem) => void;
  width?: number;
}

export default function Sidebar({
  activeSection,
  onSectionChange,
  isMobileOpen,
  onMobileClose,
  suggestions,
  onExecuteSuggestion,
  width,
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
        <div className="fixed inset-0 z-40 bg-black/60 lg:hidden" onClick={onMobileClose} />
      )}

      {/* Render the sidebar content in two places: a fixed mobile drawer and an in-flow desktop sidebar. */}
      {isMobileOpen && (
        <aside
          className="fixed left-0 top-0 z-50 flex h-screen flex-col bg-black text-white lg:hidden"
          style={{
            width: 326,
            minWidth: '260px',
            maxWidth: '360px',
            borderRight: '1px solid rgba(255,255,255,0.08)',
            paddingTop: '32px',
          }}
        >
          {/* BRAND ROW */}
          <div className="flex items-center px-[30px] mb-[42px] gap-[16px]">
            <img src="/marko ai.png" alt="Marko AI" className="w-[44px] h-[44px] object-contain" />
            <div className="text-[24px] font-[750] leading-[30px] tracking-[-0.035em] text-white">Marko AI</div>
            <button onClick={onMobileClose} className="ml-auto rounded-lg p-1 text-zinc-400 hover:bg-neutral-900 hover:text-white lg:hidden">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {/* ORCHESTRATOR */}
            <div className="mb-[42px]">
              <div className="px-[30px] mb-[18px] text-[11px] font-[700] uppercase tracking-[0.28em] text-[rgba(255,255,255,0.48)]">ORCHESTRATOR</div>

              <button
                onClick={() => {
                  onSectionChange('supervisor');
                  onMobileClose();
                }}
                className={`group flex mx-[30px] items-center gap-[16px] transition-all duration-200 border ${
                  activeSection === 'supervisor'
                    ? 'h-[64px] bg-[#171717] border-[rgba(255,255,255,0.12)] rounded-[18px] px-[24px] pr-[20px] shadow-[0_18px_38px_rgba(0,0,0,0.45)] w-[calc(100%-60px)]'
                    : 'h-[52px] border-transparent rounded-[16px] px-[24px] pr-[20px] hover:bg-[rgba(255,255,255,0.045)] hover:border-[rgba(255,255,255,0.06)] w-[calc(100%-60px)]'
                }`}
              >
                <div className={`flex items-center justify-center shrink-0 ${
                  activeSection === 'supervisor'
                    ? 'h-[38px] w-[38px] rounded-[12px] bg-[rgba(255,255,255,0.06)]'
                    : 'h-[22px] w-[22px]'
                }`}>
                  <LayoutDashboard size={17} strokeWidth={1.7} className="text-white" />
                </div>
                <span className={`text-[16px] leading-[20px] tracking-[-0.02em] text-white ${activeSection === 'supervisor' ? 'font-[700]' : 'font-[600]'}`}>Supervisor</span>
                <ChevronRight size={16} strokeWidth={1.7} className="ml-auto text-[rgba(255,255,255,0.62)]" />
              </button>
            </div>

            {/* SPECIALIST AGENTS */}
            <div className="mb-[42px]">
              <div className="px-[30px] mb-[18px] text-[11px] font-[700] uppercase tracking-[0.28em] text-[rgba(255,255,255,0.48)]">SPECIALIST AGENTS</div>

              <div className="flex flex-col gap-[18px]">
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
                    className={`group flex mx-[30px] items-center gap-[16px] h-[52px] rounded-[16px] px-[24px] pr-[20px] transition-all duration-200 border ${
                        isActive
                          ? 'bg-[#171717] border-[rgba(255,255,255,0.12)] text-white'
                          : 'border-transparent hover:bg-[rgba(255,255,255,0.045)] hover:border-[rgba(255,255,255,0.06)] text-white'
                      }`}
                    >
                      <div className="flex h-[22px] w-[22px] shrink-0 items-center justify-center">
                        <Icon size={17} strokeWidth={1.7} className="text-[rgba(255,255,255,0.90)]" />
                      </div>
                      <span className="text-[16px] font-[600] leading-[20px] tracking-[-0.02em] text-white">{agent.name}</span>
                      <ChevronRight size={16} strokeWidth={1.7} className="ml-auto text-[rgba(255,255,255,0.60)]" />
                    </button>
                  );
                })}
              </div>
            </div>

            {/* WORKSPACE TOOLS */}
            <div className="mb-[38px]">
              <div className="px-[30px] mb-[16px] text-[11px] font-[700] uppercase tracking-[0.26em] text-[rgba(255,255,255,0.48)]">WORKSPACE TOOLS</div>

              <div className="flex flex-col gap-[14px]">
                <button
                  onClick={() => {
                    onSectionChange('dashboard');
                    onMobileClose();
                  }}
                  className={`group flex mx-[30px] items-center gap-[16px] h-[48px] rounded-[16px] px-[22px] pr-[20px] border transition-all ${activeSection === 'dashboard' ? 'bg-[#171717] border-[rgba(255,255,255,0.12)] text-white' : 'border-transparent hover:bg-[rgba(255,255,255,0.045)] hover:border-[rgba(255,255,255,0.06)] text-white'}`}
                >
                  <div className="flex h-[21px] w-[21px] shrink-0 items-center justify-center">
                    <PanelsTopLeft size={16} strokeWidth={1.7} className="text-[rgba(255,255,255,0.92)]" />
                  </div>
                  <span className="text-[16px] font-[600] leading-[20px] tracking-[-0.02em]">Dashboard</span>
                  <ChevronRight size={16} strokeWidth={1.7} className="ml-auto text-[rgba(255,255,255,0.62)]" />
                </button>

                <button
                  onClick={() => {
                    onSectionChange('report');
                    onMobileClose();
                  }}
                  className={`group flex mx-[30px] items-center gap-[16px] h-[48px] rounded-[16px] px-[22px] pr-[20px] border transition-all ${activeSection === 'report' ? 'bg-[#171717] border-[rgba(255,255,255,0.12)] text-white' : 'border-transparent hover:bg-[rgba(255,255,255,0.045)] hover:border-[rgba(255,255,255,0.06)] text-white'}`}
                >
                  <div className="flex h-[21px] w-[21px] shrink-0 items-center justify-center">
                    <FileBarChart2 size={16} strokeWidth={1.7} className="text-[rgba(255,255,255,0.92)]" />
                  </div>
                  <span className="text-[16px] font-[600] leading-[20px] tracking-[-0.02em]">Report Maker</span>
                  <ChevronRight size={16} strokeWidth={1.7} className="ml-auto text-[rgba(255,255,255,0.62)]" />
                </button>
              </div>
            </div>

            {/* ANALYSIS */}
            <div>
              <div className="px-[30px] mb-[16px] text-[11px] font-[700] uppercase tracking-[0.26em] text-[rgba(255,255,255,0.48)]">ANALYSIS</div>

              <div className="flex flex-col gap-[14px]">
                <button
                  onClick={() => {
                    setIsSuggestionsOpen(true);
                    onMobileClose();
                  }}
                  className="group flex mx-[30px] items-center gap-[16px] h-[48px] rounded-[16px] px-[22px] pr-[20px] border border-transparent transition-all hover:bg-[rgba(255,255,255,0.045)] hover:border-[rgba(255,255,255,0.06)] text-white"
                >
                  <div className="flex h-[21px] w-[21px] shrink-0 items-center justify-center">
                    <Lightbulb size={16} strokeWidth={1.7} className="text-[rgba(255,255,255,0.92)]" />
                  </div>
                  <span className="text-[16px] font-[600] leading-[20px] tracking-[-0.02em]">Suggestions</span>
                  <ChevronRight size={16} strokeWidth={1.7} className="ml-auto text-[rgba(255,255,255,0.62)]" />
                </button>

                <button
                  onClick={() => {
                    setIsHistoryOpen(true);
                    onMobileClose();
                  }}
                  className="group flex mx-[30px] items-center gap-[16px] h-[48px] rounded-[16px] px-[22px] pr-[20px] border border-transparent transition-all hover:bg-[rgba(255,255,255,0.045)] hover:border-[rgba(255,255,255,0.06)] text-white"
                >
                  <div className="flex h-[21px] w-[21px] shrink-0 items-center justify-center">
                    <History size={16} strokeWidth={1.7} className="text-[rgba(255,255,255,0.92)]" />
                  </div>
                  <span className="text-[16px] font-[600] leading-[20px] tracking-[-0.02em]">Execution History</span>
                  <ChevronRight size={16} strokeWidth={1.7} className="ml-auto text-[rgba(255,255,255,0.62)]" />
                </button>
              </div>
            </div>
          </div>

          {/* BOTTOM PROFILE SECTION (includes Settings gear) */}
          <div className="mt-auto border-t border-[rgba(255,255,255,0.08)] p-[16px_30px_20px_30px] flex items-center gap-[13px]">
            <div className="h-[40px] w-[40px] shrink-0 rounded-full bg-[#050505] border border-[rgba(255,255,255,0.18)] flex items-center justify-center text-white text-[15px] font-[600]">N</div>
            <div className="flex flex-col">
              <div className="text-[13.5px] font-[700] leading-[18px] text-white">Guest User</div>
              <div className="text-[11px] font-[400] leading-[15px] text-[rgba(255,255,255,0.62)]">Free Plan</div>
            </div>
            <button onClick={() => onSectionChange('settings')} className="ml-auto text-[rgba(255,255,255,0.55)] hover:text-white transition-colors">
              <Settings size={16} />
            </button>
          </div>
        </aside>
      )}

      {/* Desktop sidebar (in-flow) */}
      <aside
        className="hidden lg:flex h-screen flex-col bg-black text-white"
        style={{
          width: width,
          minWidth: '260px',
          maxWidth: '360px',
          borderRight: '1px solid rgba(255,255,255,0.08)',
          paddingTop: '32px',
        }}
      >
        {/* BRAND ROW */}
        <div className="flex items-center px-[30px] mb-[42px] gap-[16px]">
          <img src="/marko ai.png" alt="Marko AI" className="w-[44px] h-[44px] object-contain" />
          <div className="text-[24px] font-[750] leading-[30px] tracking-[-0.035em] text-white">Marko AI</div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* ORCHESTRATOR */}
          <div className="mb-[42px]">
            <div className="px-[30px] mb-[18px] text-[11px] font-[700] uppercase tracking-[0.28em] text-[rgba(255,255,255,0.48)]">ORCHESTRATOR</div>

            <button
              onClick={() => {
                onSectionChange('supervisor');
                onMobileClose();
              }}
              className={`group flex mx-[30px] items-center gap-[16px] transition-all duration-200 border ${
                activeSection === 'supervisor'
                  ? 'h-[64px] bg-[#171717] border-[rgba(255,255,255,0.12)] rounded-[18px] px-[24px] pr-[20px] shadow-[0_18px_38px_rgba(0,0,0,0.45)] w-[calc(100%-60px)]'
                  : 'h-[52px] border-transparent rounded-[16px] px-[24px] pr-[20px] hover:bg-[rgba(255,255,255,0.045)] hover:border-[rgba(255,255,255,0.06)] w-[calc(100%-60px)]'
              }`}
            >
              <div className={`flex items-center justify-center shrink-0 ${
                activeSection === 'supervisor'
                  ? 'h-[38px] w-[38px] rounded-[12px] bg-[rgba(255,255,255,0.06)]'
                  : 'h-[22px] w-[22px]'
              }`}>
                <LayoutDashboard size={17} strokeWidth={1.7} className="text-white" />
              </div>
              <span className={`text-[16px] leading-[20px] tracking-[-0.02em] text-white ${activeSection === 'supervisor' ? 'font-[700]' : 'font-[600]'}`}>Supervisor</span>
              <ChevronRight size={16} strokeWidth={1.7} className="ml-auto text-[rgba(255,255,255,0.62)]" />
            </button>
          </div>

          {/* SPECIALIST AGENTS */}
          <div className="mb-[42px]">
            <div className="px-[30px] mb-[18px] text-[11px] font-[700] uppercase tracking-[0.28em] text-[rgba(255,255,255,0.48)]">SPECIALIST AGENTS</div>

            <div className="flex flex-col gap-[18px]">
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
                    className={`group flex mx-[30px] items-center gap-[16px] h-[52px] rounded-[16px] px-[24px] pr-[20px] transition-all duration-200 border ${
                      isActive
                        ? 'bg-[#171717] border-[rgba(255,255,255,0.12)] text-white'
                        : 'border-transparent hover:bg-[rgba(255,255,255,0.045)] hover:border-[rgba(255,255,255,0.06)] text-white'
                    }`}
                  >
                    <div className="flex h-[22px] w-[22px] shrink-0 items-center justify-center">
                      <Icon size={17} strokeWidth={1.7} className="text-[rgba(255,255,255,0.90)]" />
                    </div>
                    <span className="text-[16px] font-[600] leading-[20px] tracking-[-0.02em] text-white">{agent.name}</span>
                    <ChevronRight size={16} strokeWidth={1.7} className="ml-auto text-[rgba(255,255,255,0.60)]" />
                  </button>
                );
              })}
            </div>
          </div>

          {/* WORKSPACE TOOLS */}
          <div className="mb-[38px]">
            <div className="px-[30px] mb-[16px] text-[11px] font-[700] uppercase tracking-[0.26em] text-[rgba(255,255,255,0.48)]">WORKSPACE TOOLS</div>

            <div className="flex flex-col gap-[14px]">
              <button
                onClick={() => {
                  onSectionChange('dashboard');
                  onMobileClose();
                }}
                className={`group flex mx-[30px] items-center gap-[16px] h-[48px] rounded-[16px] px-[22px] pr-[20px] border transition-all ${activeSection === 'dashboard' ? 'bg-[#171717] border-[rgba(255,255,255,0.12)] text-white' : 'border-transparent hover:bg-[rgba(255,255,255,0.045)] hover:border-[rgba(255,255,255,0.06)] text-white'}`}
              >
                <div className="flex h-[21px] w-[21px] shrink-0 items-center justify-center">
                  <PanelsTopLeft size={16} strokeWidth={1.7} className="text-[rgba(255,255,255,0.92)]" />
                </div>
                <span className="text-[16px] font-[600] leading-[20px] tracking-[-0.02em]">Dashboard</span>
                <ChevronRight size={16} strokeWidth={1.7} className="ml-auto text-[rgba(255,255,255,0.62)]" />
              </button>

              <button
                onClick={() => {
                  onSectionChange('report');
                  onMobileClose();
                }}
                className={`group flex mx-[30px] items-center gap-[16px] h-[48px] rounded-[16px] px-[22px] pr-[20px] border transition-all ${activeSection === 'report' ? 'bg-[#171717] border-[rgba(255,255,255,0.12)] text-white' : 'border-transparent hover:bg-[rgba(255,255,255,0.045)] hover:border-[rgba(255,255,255,0.06)] text-white'}`}
              >
                <div className="flex h-[21px] w-[21px] shrink-0 items-center justify-center">
                  <FileBarChart2 size={16} strokeWidth={1.7} className="text-[rgba(255,255,255,0.92)]" />
                </div>
                <span className="text-[16px] font-[600] leading-[20px] tracking-[-0.02em]">Report Maker</span>
                <ChevronRight size={16} strokeWidth={1.7} className="ml-auto text-[rgba(255,255,255,0.62)]" />
              </button>
            </div>
          </div>

          {/* ANALYSIS */}
          <div>
            <div className="px-[30px] mb-[16px] text-[11px] font-[700] uppercase tracking-[0.26em] text-[rgba(255,255,255,0.48)]">ANALYSIS</div>

            <div className="flex flex-col gap-[14px]">
              <button
                onClick={() => {
                  setIsSuggestionsOpen(true);
                  onMobileClose();
                }}
                className="group flex mx-[30px] items-center gap-[16px] h-[48px] rounded-[16px] px-[22px] pr-[20px] border border-transparent transition-all hover:bg-[rgba(255,255,255,0.045)] hover:border-[rgba(255,255,255,0.06)] text-white"
              >
                <div className="flex h-[21px] w-[21px] shrink-0 items-center justify-center">
                  <Lightbulb size={16} strokeWidth={1.7} className="text-[rgba(255,255,255,0.92)]" />
                </div>
                <span className="text-[16px] font-[600] leading-[20px] tracking-[-0.02em]">Suggestions</span>
                <ChevronRight size={16} strokeWidth={1.7} className="ml-auto text-[rgba(255,255,255,0.62)]" />
              </button>

              <button
                onClick={() => {
                  setIsHistoryOpen(true);
                  onMobileClose();
                }}
                className="group flex mx-[30px] items-center gap-[16px] h-[48px] rounded-[16px] px-[22px] pr-[20px] border border-transparent transition-all hover:bg-[rgba(255,255,255,0.045)] hover:border-[rgba(255,255,255,0.06)] text-white"
              >
                <div className="flex h-[21px] w-[21px] shrink-0 items-center justify-center">
                  <History size={16} strokeWidth={1.7} className="text-[rgba(255,255,255,0.92)]" />
                </div>
                <span className="text-[16px] font-[600] leading-[20px] tracking-[-0.02em]">Execution History</span>
                <ChevronRight size={16} strokeWidth={1.7} className="ml-auto text-[rgba(255,255,255,0.62)]" />
              </button>
            </div>
          </div>
        </div>

        {/* BOTTOM PROFILE SECTION (includes Settings gear) */}
        <div className="mt-auto border-t border-[rgba(255,255,255,0.08)] p-[16px_30px_20px_30px] flex items-center gap-[13px]">
          <div className="h-[40px] w-[40px] shrink-0 rounded-full bg-[#050505] border border-[rgba(255,255,255,0.18)] flex items-center justify-center text-white text-[15px] font-[600]">N</div>
          <div className="flex flex-col">
            <div className="text-[13.5px] font-[700] leading-[18px] text-white">Guest User</div>
            <div className="text-[11px] font-[400] leading-[15px] text-[rgba(255,255,255,0.62)]">Free Plan</div>
          </div>
          <button onClick={() => onSectionChange('settings')} className="ml-auto text-[rgba(255,255,255,0.55)] hover:text-white transition-colors">
            <Settings size={16} />
          </button>
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
          className={`absolute right-0 top-0 flex h-full w-[420px] flex-col border-l border-zinc-800 bg-zinc-950 text-white shadow-2xl transition-transform duration-300 ${
            isSuggestionsOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
        >
          <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-5">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-zinc-400">
                Smart Assistant
              </div>
              <h2 className="mt-1 text-2xl font-bold text-white">
                Suggestions
              </h2>
            </div>

            <button
              onClick={() => setIsSuggestionsOpen(false)}
              className="flex h-10 w-10 items-center justify-center rounded-xl text-zinc-400 transition hover:bg-zinc-900 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            <div className="space-y-4">
              {suggestions.length > 0 ? (
                suggestions.map((item) => (
                  <div
                    key={item.id}
                    className="w-full rounded-3xl border border-zinc-800 bg-zinc-950 p-5 text-left"
                  >
                    <div className="text-sm font-semibold text-white">
                      {item.title}
                    </div>
                    <div className="mt-2 text-sm leading-6 text-zinc-400">
                      {item.description}
                    </div>
                    <div className="mt-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
                      Source: {item.source}
                    </div>
                    <button
                      onClick={() => {
                        onExecuteSuggestion(item);
                        setIsSuggestionsOpen(false);
                      }}
                      className="mt-4 inline-flex items-center gap-2 rounded-xl bg-zinc-800 px-4 py-2 text-xs font-semibold text-white transition hover:bg-zinc-700"
                    >
                      <Play className="h-3.5 w-3.5" />
                      Execute in Chat
                    </button>
                  </div>
                ))
              ) : (
                <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-5 text-sm leading-6 text-zinc-400">
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
          className={`absolute right-0 top-0 flex h-full w-[420px] flex-col border-l border-zinc-800 bg-zinc-950 text-white shadow-2xl transition-transform duration-300 ${
            isHistoryOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
        >
          <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-5">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-zinc-400">
                Analytics Supervisor
              </div>

              <h2 className="mt-1 text-2xl font-bold text-white">
                Execution History
              </h2>
            </div>

            <button
              onClick={() => setIsHistoryOpen(false)}
              className="flex h-10 w-10 items-center justify-center rounded-xl text-zinc-400 transition hover:bg-zinc-900 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            <div className="space-y-5">
              <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-5">
                <div className="mb-4 text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-400">
                  Latest Execution
                </div>

                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="mt-1 flex h-7 w-7 items-center justify-center rounded-full bg-zinc-800 text-xs font-bold text-zinc-300">
                      ✓
                    </div>
                    <div>
                      <div className="text-sm font-medium text-white">
                        Forecast Agent executed
                      </div>
                      <div className="mt-1 text-xs text-zinc-400">
                        2 minutes ago
                      </div>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="mt-1 flex h-7 w-7 items-center justify-center rounded-full bg-zinc-800 text-xs font-bold text-zinc-300">
                      ✓
                    </div>
                    <div>
                      <div className="text-sm font-medium text-white">
                        Funnel Agent executed
                      </div>
                      <div className="mt-1 text-xs text-zinc-400">
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
