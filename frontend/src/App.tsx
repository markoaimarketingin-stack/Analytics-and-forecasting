import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { Bot } from 'lucide-react';

import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import ChatPanel from './components/ChatPanel';
import ExistingFilesModal from './components/knowledge/ExistingFilesModal';
import UploadFileModal from './components/knowledge/UploadFileModal';
import DatasetSelectionModal from './components/knowledge/DatasetSelectionModal';

import ForecastWorkspace from './components/forecast/ForecastWorkspace';
import ScenarioWorkspace from './components/scenario/ScenarioWorkspace';
import FunnelWorkspace from './components/funnel/FunnelWorkspace';
import CohortWorkspace from './components/cohort/CohortWorkspace';
import AttributionWorkspace from './components/attribution/AttributionWorkspace';
import BudgetAllocatorWorkspace from './components/budget/BudgetAllocatorWorkspace';
import ReportWorkspace from './components/report/ReportWorkspace';
import SettingsWorkspace from './components/settings/SettingsWorkspace';
import SupervisorWorkspace from './components/supervisor/SupervisorWorkspace';
import {
  fetchRecommendationOutcomes,
  orchestrateAgents,
  upsertRecommendationOutcome,
} from './services/api';

import type {
  AnalysisRun,
  AgentOrchestrationResult,
  ChatThreadSummary,
  Message,
  RecommendationLifecycleRecord,
  RecommendationStatus,
  UISuggestionItem,
} from './types';

const API_BASE =
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_API_URL ||
  'http://localhost:8001/api';

interface ActivatedAgent {
  id: string;
  label: string;
}

const THEME_STORAGE_KEY = 'analytics_theme_dark_mode';
const RECOMMENDATION_STORAGE_PREFIX = 'recommendation-lifecycle';

const toIsoNow = () => new Date().toISOString();

const recommendationStorageKey = (clientId: string, threadId?: string | null) =>
  `${RECOMMENDATION_STORAGE_PREFIX}:${clientId || 'anonymous-client'}:${threadId || 'global'}`;

const toTitleCase = (value: string): string =>
  value
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

const buildSuggestionBaseTitle = (text: string, fallbackIndex: number): string => {
  const normalized = text
    .replace(/\s+/g, ' ')
    .replace(/[.!?]+$/g, '')
    .trim();

  if (!normalized) return `Recommendation ${fallbackIndex}`;

  const snippet = normalized.split(/[.!?]/)[0]?.trim() || normalized;
  const words = snippet.split(' ').filter(Boolean).slice(0, 6);
  if (words.length === 0) return `Recommendation ${fallbackIndex}`;

  return toTitleCase(words.join(' '));
};

const asNumber = (value: unknown): number | null => {
  const next = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(next) ? next : null;
};

const deriveExpectedOutcomeFromResult = (result: AgentOrchestrationResult): string | null => {
  const forecastRoi = asNumber(result.forecast_analysis?.predicted_roi);
  const forecastRevenue = asNumber(result.forecast_analysis?.next_30_day_revenue);
  const scenarioUpside =
    asNumber(result.scenario_analysis?.best_case?.revenue) !== null &&
    asNumber(result.scenario_analysis?.base_case?.revenue) !== null
      ? (asNumber(result.scenario_analysis?.best_case?.revenue) as number) -
        (asNumber(result.scenario_analysis?.base_case?.revenue) as number)
      : null;
  const funnelUplift = asNumber(result.funnel_analysis?.predicted_conversion_uplift_if_fixed);
  const retentionRate = asNumber(result.cohort_analysis?.three_month_retention);
  const confidence = asNumber(result.confidence_score);

  if (forecastRoi !== null && forecastRevenue !== null) {
    return `Projected ROI ${forecastRoi.toFixed(1)}% with ${Math.round(forecastRevenue).toLocaleString()} expected revenue in next 30 days`;
  }
  if (scenarioUpside !== null) {
    return `Expected upside of ${Math.round(scenarioUpside).toLocaleString()} revenue vs base scenario`;
  }
  if (funnelUplift !== null) {
    return `Estimated conversion uplift of ${funnelUplift.toFixed(1)}% if recommendation is applied`;
  }
  if (retentionRate !== null) {
    return `Expected 3-month retention around ${retentionRate.toFixed(1)}% for the targeted cohort mix`;
  }
  if (confidence !== null) {
    return `Expected KPI improvement based on orchestration confidence score ${confidence.toFixed(1)}%`;
  }

  return null;
};

const normalizeRecommendationStatus = (value: unknown): RecommendationStatus => {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'accepted' || raw === 'in_progress' || raw === 'implemented' || raw === 'rejected') {
    return raw;
  }
  return 'pending';
};

const toLifecycleRecord = (item: UISuggestionItem): RecommendationLifecycleRecord => ({
  suggestion_id: item.id,
  client_id: item.clientId,
  thread_id: item.threadId,
  title: item.title,
  description: item.description,
  prompt: item.prompt,
  source: item.source,
  status: item.status,
  accepted_at: item.acceptedAt,
  submitted_at: item.submittedAt,
  owner: item.owner,
  due_date: item.dueDate,
  expected_impact: item.expectedImpact,
  actual_impact: item.actualImpact,
  outcome_notes: item.outcomeNotes,
  last_updated_at: item.lastUpdatedAt,
});

const fromLifecycleRecord = (record: RecommendationLifecycleRecord): UISuggestionItem => ({
  id: record.suggestion_id,
  title: record.title || 'Recommendation',
  description: record.description || '',
  prompt: record.prompt || record.description || '',
  source: record.source || 'Lifecycle',
  status: normalizeRecommendationStatus(record.status),
  acceptedAt: record.accepted_at,
  submittedAt: record.submitted_at,
  owner: record.owner,
  dueDate: record.due_date,
  expectedImpact: record.expected_impact,
  actualImpact: record.actual_impact,
  outcomeNotes: record.outcome_notes,
  lastUpdatedAt: record.last_updated_at,
  clientId: record.client_id,
  threadId: record.thread_id,
});

const DEFAULT_SECTION = 'supervisor';

interface AppProps {
  clientId: string;
  accountName: string;
  accountEmail: string;
  onLogout: () => void;
}

export default function App({
  clientId,
  accountName,
  accountEmail,
  onLogout,
}: AppProps) {
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;

    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'true') return true;
    if (saved === 'false') return false;

    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  });
  const [activeSection, setActiveSection] = useState(DEFAULT_SECTION);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const [messages, setMessages] = useState<Message[]>([]);
  const [currentAnalysis, setCurrentAnalysis] =
    useState<AnalysisRun | null>(null);

  const [activatedAgents, setActivatedAgents] = useState<ActivatedAgent[]>([]);
  const [executionTimeline, setExecutionTimeline] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<UISuggestionItem[]>([]);
  const [currentThreadId, setCurrentThreadId] = useState<string | null>(null);
  const [chatThreads, setChatThreads] = useState<ChatThreadSummary[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [isChatPanelCollapsed, setIsChatPanelCollapsed] = useState(false);
  const [supervisorResetToken, setSupervisorResetToken] = useState(0);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.documentElement.classList.toggle('dark-mode', darkMode);
    localStorage.setItem(THEME_STORAGE_KEY, String(darkMode));
  }, [darkMode]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'end',
    });
  }, [messages, isLoading, currentAnalysis]);


  const loadChatThreads = async (resolvedClientId: string) => {
    if (!resolvedClientId) return;
    setIsHistoryLoading(true);

    try {
      const response = await axios.get(`${API_BASE}/chat-history`, {
        params: {
          client_id: resolvedClientId,
          limit: 100,
        },
      });

      setChatThreads(response.data.threads || []);
    } catch (error) {
      console.error('Failed to load chat history', error);
    } finally {
      setIsHistoryLoading(false);
    }
  };

  useEffect(() => {
    if (!clientId) return;
    loadChatThreads(clientId);
  }, [clientId]);

  const handleNewChat = () => {
    setMessages([]);
    setCurrentAnalysis(null);
    setActivatedAgents([]);
    setExecutionTimeline([]);
    setCurrentThreadId(null);
    setSupervisorResetToken((prev) => prev + 1);
  };

  const handleOpenHistoryThread = async (threadId: string) => {
    if (!clientId) return;

    try {
      const response = await axios.get(`${API_BASE}/chat-history/${threadId}`, {
        params: { client_id: clientId },
      });

      const restoredMessages: Message[] = (response.data.messages || []).map((item: any) => ({
        id: String(item.id),
        role: item.role,
        content: item.content,
        timestamp: new Date(item.created_at),
      }));

      setMessages(restoredMessages);
      setCurrentThreadId(threadId);
      setExecutionTimeline([]);
      setActivatedAgents([]);
      setCurrentAnalysis(null);
    } catch (error) {
      console.error('Failed to open chat thread', error);
    }
  };

  useEffect(() => {
    if (!clientId) return;

    const contextKey = recommendationStorageKey(clientId, currentThreadId);

    // Load local lifecycle snapshot first for immediate UX.
    try {
      const localRaw = localStorage.getItem(contextKey);
      if (localRaw) {
        const parsed = JSON.parse(localRaw) as UISuggestionItem[];
        if (Array.isArray(parsed)) {
          setSuggestions((prev) => {
            const map = new Map<string, UISuggestionItem>();
            prev.forEach((item) => map.set(item.id, item));
            parsed.forEach((item) => map.set(item.id, item));
            return Array.from(map.values()).slice(0, 50);
          });
        }
      }
    } catch {
      // Non-blocking local parse fallback.
    }

    let cancelled = false;

    const hydrateFromApi = async () => {
      const response = await fetchRecommendationOutcomes(clientId, currentThreadId || undefined);
      if (cancelled || !response.success || !Array.isArray(response.data)) return;

      const mapped = response.data.map(fromLifecycleRecord);
      setSuggestions((prev) => {
        const map = new Map<string, UISuggestionItem>();
        prev.forEach((item) => map.set(item.id, item));
        mapped.forEach((item) => map.set(item.id, item));
        return Array.from(map.values()).slice(0, 50);
      });
    };

    hydrateFromApi();

    return () => {
      cancelled = true;
    };
  }, [clientId, currentThreadId]);

  useEffect(() => {
    if (!clientId) return;
    const contextKey = recommendationStorageKey(clientId, currentThreadId);
    localStorage.setItem(contextKey, JSON.stringify(suggestions));
  }, [clientId, currentThreadId, suggestions]);

  const addSuggestionsFromResult = (
    source: string,
    result?: Partial<AgentOrchestrationResult> | null,
  ) => {
    if (!result) return;
    const recs = result.recommendations || [];
    if (!Array.isArray(recs) || recs.length === 0) return;

    const now = toIsoNow();
    const usedTitles = new Set(
      suggestions
        .map((item) => item.title?.trim())
        .filter((title): title is string => Boolean(title)),
    );

    const mapped: UISuggestionItem[] = recs.map((text, index) => {
      const baseTitle = buildSuggestionBaseTitle(text, index + 1);
      let uniqueTitle = baseTitle;
      let suffix = 2;
      while (usedTitles.has(uniqueTitle)) {
        uniqueTitle = `${baseTitle} (${suffix})`;
        suffix += 1;
      }
      usedTitles.add(uniqueTitle);

      return {
        id: `${source}-${Date.now()}-${index}`,
        title: uniqueTitle,
        description: text,
        prompt: text,
        source,
        status: 'pending',
        lastUpdatedAt: now,
        clientId,
        threadId: currentThreadId || undefined,
      };
    });

    setSuggestions((prev) => {
      const existingByPrompt = new Map(prev.map((item) => [item.prompt.toLowerCase(), item]));
      const nextItems = mapped.map((item) => {
        const existing = existingByPrompt.get(item.prompt.toLowerCase());
        if (!existing) return item;
        return {
          ...item,
          id: existing.id,
          title: existing.title || item.title,
          status: existing.status,
          acceptedAt: existing.acceptedAt,
          submittedAt: existing.submittedAt,
          owner: existing.owner,
          dueDate: existing.dueDate,
          expectedImpact: existing.expectedImpact,
          actualImpact: existing.actualImpact,
          outcomeNotes: existing.outcomeNotes,
          lastUpdatedAt: existing.lastUpdatedAt || now,
        };
      });

      const map = new Map<string, UISuggestionItem>();
      [...nextItems, ...prev].forEach((item) => map.set(item.id, item));
      return Array.from(map.values()).slice(0, 50);
    });
  };

  const persistSuggestionOutcome = async (item: UISuggestionItem) => {
    try {
      await upsertRecommendationOutcome(toLifecycleRecord(item));
    } catch {
      // Local persistence remains the fallback.
    }
  };

  const handleUpdateSuggestion = (
    suggestionId: string,
    updates: Partial<UISuggestionItem>,
  ) => {
    const now = toIsoNow();

    setSuggestions((prev) => {
      const next = prev.map((item) => {
        if (item.id !== suggestionId) return item;

        const nextStatus = updates.status || item.status;
        const shouldSetAcceptedAt =
          nextStatus === 'accepted' &&
          !item.acceptedAt &&
          !updates.acceptedAt;

        const updated: UISuggestionItem = {
          ...item,
          ...updates,
          status: normalizeRecommendationStatus(nextStatus),
          acceptedAt: shouldSetAcceptedAt ? now : (updates.acceptedAt ?? item.acceptedAt),
          submittedAt: updates.submittedAt ?? item.submittedAt,
          lastUpdatedAt: now,
          clientId: item.clientId || clientId,
          threadId: item.threadId || currentThreadId || undefined,
        };

        // Fire-and-forget API upsert.
        void persistSuggestionOutcome(updated);
        return updated;
      });

      return next;
    });
  };

  const handleSendMessage = async (
    message: string,
    executionContext?: { executedSuggestionId?: string },
  ): Promise<boolean> => {
    if (!message.trim()) return false;

    const userMessage: Message = {
      id: `${Date.now()}-user`,
      role: 'user',
      content: message,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    try {
      const lower = message.toLowerCase().trim();

      // Clear previous analysis UI immediately so old cards do not persist
      setExecutionTimeline([]);
      setActivatedAgents([]);
      setCurrentAnalysis(null);

      const simpleChatPatterns = [
          /^hello\b/,
          /^hi\b/,
          /^hey\b/,
          /^help\b/,
          /who are you/,
          /what can you do/,
          /what does.*agent.*do/,
          /what do.*agents.*do/,
          /tell me about.*agents/,
          /capabilities/,
          /what data do you have/,
          /what information do you have/,
          /tell me about yourself/,
          /what do you know/,
        ];

      const metaAgentQuery =
        lower.includes('agent') &&
        (
          lower.includes('tell me') ||
          lower.includes('what') ||
          lower.includes('about') ||
          lower.includes('capabilities')
        ) &&
        !lower.includes('forecast') &&
        !lower.includes('roi') &&
        !lower.includes('predict');

      const isSimpleChat = simpleChatPatterns.some((pattern) =>
        pattern.test(lower),
      ) || metaAgentQuery;

      if (isSimpleChat) {
        const response = await axios.post(`${API_BASE}/chat`, {
          message,
          thread_id: currentThreadId,
          client_id: clientId,
        });

        if (response.data.thread_id) {
          setCurrentThreadId(response.data.thread_id);
        }

        setMessages((prev) => [
          ...prev,
          {
            id: `${Date.now()}-assistant`,
            role: 'assistant',
            content:
              response.data.message ||
              'I am online and ready to help with analytics questions.',
            timestamp: new Date(),
          },
        ]);

        // Clear analysis cards for conversational replies
        setExecutionTimeline([]);
        setActivatedAgents([]);
        setCurrentAnalysis(null);
        if (clientId) {
          loadChatThreads(clientId);
        }

        return true;
      }

      const response = await axios.post(`${API_BASE}/orchestrate`, {
        message,
        thread_id: currentThreadId,
        client_id: clientId,
      });

      const data = response.data;

      if (data.thread_id) {
        setCurrentThreadId(data.thread_id);
      }

      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-assistant`,
          role: 'assistant',
          content:
            data.reasoning ||
            data.message ||
            'Analysis completed successfully.',
          timestamp: new Date(),
        },
      ]);

      setActivatedAgents(data.activated_agents || []);
      setExecutionTimeline(data.timeline || []);

      if (data.result) {
        addSuggestionsFromResult('Supervisor', data.result);

        if (executionContext?.executedSuggestionId) {
          const expected = deriveExpectedOutcomeFromResult(data.result);
          if (expected) {
            handleUpdateSuggestion(executionContext.executedSuggestionId, {
              expectedImpact: expected,
            });
          }
        }

        const run: AnalysisRun = {
          id: `${Date.now()}-analysis`,
          timestamp: new Date(),
          status: 'completed',
          payload: data.payload,
          result: data.result,
        };

        setCurrentAnalysis(run);
      } else {
        setCurrentAnalysis(null);
      }

      if (clientId) {
        loadChatThreads(clientId);
      }

      return true;
    } catch (error: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-error`,
          role: 'assistant',
          content:
            error?.response?.data?.detail ||
            error?.message ||
            'Analytics Supervisor could not process your request.',
          timestamp: new Date(),
        },
      ]);

      setExecutionTimeline([]);
      setActivatedAgents([]);
      setCurrentAnalysis(null);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const handleRunSupervisorPipeline = async (): Promise<boolean> => {
    const supervisorPrompt =
      'Run complete supervisor pipeline: funnel, cohort, attribution, forecast, and scenario. Build dashboard-ready insights.';

    const userMessage: Message = {
      id: `${Date.now()}-user`,
      role: 'user',
      content: supervisorPrompt,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    try {
      setExecutionTimeline([]);
      setActivatedAgents([]);
      setCurrentAnalysis(null);

      const response = await orchestrateAgents({
        intent: 'dashboard',
        agents: ['funnel', 'cohort', 'attribution', 'forecast', 'scenario'],
        client_id: clientId,
        payload: {
          horizon_days: 90,
          kpi_metric: 'revenue',
          channel: 'all',
          campaign_type: 'all',
          campaign_id: 'all',
        },
      });

      if (!response.success || !response.data?.success) {
        throw new Error(response.detail || response.data?.errors?.system || 'Supervisor pipeline failed.');
      }

      const data = response.data;

      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-assistant`,
          role: 'assistant',
          content:
            data.executive_summary ||
            'Supervisor pipeline completed. Open dashboard to review full multi-agent insights.',
          timestamp: new Date(),
        },
      ]);

      setActivatedAgents([
        { id: 'funnel', label: 'Funnel Agent' },
        { id: 'cohort', label: 'Cohort Agent' },
        { id: 'attribution', label: 'Attribution Agent' },
        { id: 'forecast', label: 'Forecast Agent' },
        { id: 'scenario', label: 'Scenario Agent' },
      ]);

      setExecutionTimeline([
        'Supervisor pipeline started',
        'Funnel, Cohort, Attribution executed',
        'Forecast executed',
        'Scenario executed',
        'Results combined for dashboard',
      ]);

      addSuggestionsFromResult('Supervisor', data);

      const run: AnalysisRun = {
        id: `${Date.now()}-analysis`,
        timestamp: new Date(),
        status: 'completed',
        payload: {} as any,
        result: data as any,
      };

      setCurrentAnalysis(run);
      return true;
    } catch (error: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-error`,
          role: 'assistant',
          content:
            error?.response?.data?.detail ||
            error?.message ||
            'Supervisor pipeline could not be completed.',
          timestamp: new Date(),
        },
      ]);

      setExecutionTimeline([]);
      setActivatedAgents([]);
      setCurrentAnalysis(null);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const handleExecuteSuggestion = (suggestion: UISuggestionItem) => {
    handleUpdateSuggestion(suggestion.id, {
      status: 'in_progress',
      acceptedAt: suggestion.acceptedAt || toIsoNow(),
    });
    void handleSendMessage(suggestion.prompt, { executedSuggestionId: suggestion.id });
  };

  const handleRemoveSuggestion = (suggestionId: string) => {
    setSuggestions((prev) => prev.filter((item) => item.id !== suggestionId));
  };

  const handleWorkspaceRunResult = (source: string, result: AgentOrchestrationResult) => {
    addSuggestionsFromResult(source, result);
    setCurrentAnalysis({
      id: `${Date.now()}-workspace-analysis`,
      timestamp: new Date(),
      status: 'completed',
      payload: {} as any,
      result: result as any,
    });
  };

  const renderWorkspace = () => {
    switch (activeSection) {
      case 'supervisor':
        return (
          <div className="workspace-section-shell flex h-full flex-col overflow-hidden bg-[#f6f7f9]">
            <SupervisorWorkspace
              onRunAnalysis={handleRunSupervisorPipeline}
              onOpenDashboard={() => setActiveSection('dashboard')}
              resetToken={supervisorResetToken}
            />
          </div>
        );

      case 'dashboard':
        return (
          <div className="workspace-section-shell flex h-full flex-col overflow-hidden bg-[#f6f7f9]">
            <div className="flex-1 overflow-y-auto px-6 py-8 lg:px-8">
              <div className="mx-auto w-full max-w-6xl rounded-[32px] border border-gray-200 bg-white p-6 shadow-sm">
                <Dashboard
                  result={currentAnalysis?.result ?? null}
                  isLoading={false}
                  clientId={clientId}
                  recommendationOutcomes={suggestions}
                />
              </div>
            </div>
          </div>
        );

      case 'forecast':
        return <ForecastWorkspace clientId={clientId} onRunResult={(result) => handleWorkspaceRunResult('Forecast Agent', result)} />;

      case 'scenario':
        return <ScenarioWorkspace clientId={clientId} onRunResult={(result) => handleWorkspaceRunResult('Scenario Agent', result)} />;

      case 'funnel':
        return <FunnelWorkspace clientId={clientId} onRunResult={(result) => handleWorkspaceRunResult('Funnel Agent', result)} />;

      case 'cohort':
        return <CohortWorkspace clientId={clientId} onRunResult={(result) => handleWorkspaceRunResult('Cohort Agent', result)} />;

      case 'attribution':
        return <AttributionWorkspace clientId={clientId} onRunResult={(result) => handleWorkspaceRunResult('Attribution Agent', result)} />;

      case 'budget':
        return <BudgetAllocatorWorkspace clientId={clientId} onRunResult={(result) => handleWorkspaceRunResult('Budget Allocator Agent', result)} />;

      case 'report':
        return <ReportWorkspace clientId={clientId} onRunResult={(result) => handleWorkspaceRunResult('Report Generator', result)} />;

      case 'settings':
        return (
          <SettingsWorkspace
            darkMode={darkMode}
            onToggleDarkMode={setDarkMode}
            onLogout={onLogout}
          />
        );

      default:
        return (
          <div className="workspace-section-shell flex h-full items-center justify-center bg-[#f6f7f9] text-gray-500">Select a section from the sidebar.</div>
        );
    }
  };

  return (
    <div className="app-shell app-theme-root flex h-screen w-screen overflow-hidden bg-[#f4f5f7] text-gray-900">
      <Sidebar
        activeSection={activeSection}
        onSectionChange={setActiveSection}
        isMobileOpen={isSidebarOpen}
        onMobileClose={() => setIsSidebarOpen(false)}
        suggestions={suggestions}
        onExecuteSuggestion={handleExecuteSuggestion}
        onUpdateSuggestion={handleUpdateSuggestion}
        onRemoveSuggestion={handleRemoveSuggestion}
        chatThreads={chatThreads}
        isHistoryLoading={isHistoryLoading}
        activeThreadId={currentThreadId}
        onOpenHistoryThread={handleOpenHistoryThread}
        accountName={accountName}
        accountEmail={accountEmail}
        onLogout={onLogout}
      />

      <div className="ml-0 flex min-w-0 flex-1 overflow-hidden lg:ml-64">
        <div className="min-w-0 flex-1 overflow-hidden">
          {renderWorkspace()}
        </div>

        {!isChatPanelCollapsed ? (
          <ChatPanel
            messages={messages}
            isLoading={isLoading}
            currentAnalysis={currentAnalysis}
            executionTimeline={executionTimeline}
            activatedAgents={activatedAgents}
            onNewChat={handleNewChat}
            onCollapse={() => setIsChatPanelCollapsed(true)}
            handleSendMessage={handleSendMessage}
          />
        ) : null}
      </div>

      {isChatPanelCollapsed ? (
        <button
          type="button"
          onClick={() => setIsChatPanelCollapsed(false)}
          aria-label="Open chat panel"
          title="Open chat panel"
          className="fixed right-6 top-1/2 z-40 hidden h-16 w-16 -translate-y-1/2 items-center justify-center rounded-full border border-blue-200 bg-gradient-to-br from-blue-600 to-violet-600 text-white shadow-[0_16px_36px_rgba(79,70,229,0.35)] transition hover:scale-105 lg:flex"
        >
          <Bot className="h-7 w-7" />
        </button>
      ) : null}

      {/* Knowledge Base Modals */}
      <ExistingFilesModal />
      <UploadFileModal />
      <DatasetSelectionModal />
    </div>
  );
}
