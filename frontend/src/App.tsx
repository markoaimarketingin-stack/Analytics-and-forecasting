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
import ReportWorkspace from './components/report/ReportWorkspace';
import SettingsWorkspace from './components/settings/SettingsWorkspace';
import SupervisorWorkspace from './components/supervisor/SupervisorWorkspace';
import { orchestrateAgents } from './services/api';

import type {
  AnalysisRun,
  AgentOrchestrationResult,
  ChatThreadSummary,
  Message,
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
const CLIENT_ID_QUERY_PARAM = 'client_id';
const CLIENT_ID_COOKIE_KEY = 'marko_client_id';
const LEGACY_CLIENT_ID_LOCAL_STORAGE_KEY = 'marko_client_id';

const readCookieValue = (name: string): string | null => {
  if (typeof document === 'undefined') return null;
  const prefix = `${name}=`;
  const match = document.cookie
    .split(';')
    .map((item) => item.trim())
    .find((item) => item.startsWith(prefix));
  if (!match) return null;
  return decodeURIComponent(match.slice(prefix.length));
};

const writeCookieValue = (name: string, value: string) => {
  if (typeof document === 'undefined') return;
  const maxAgeSeconds = 60 * 60 * 24 * 365;
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAgeSeconds}; samesite=lax`;
};

const resolveInitialClientId = (): string => {
  if (typeof window === 'undefined') return '';

  const params = new URLSearchParams(window.location.search);
  const fromQuery = (params.get(CLIENT_ID_QUERY_PARAM) || '').trim();
  if (fromQuery) return fromQuery;

  const fromCookie = (readCookieValue(CLIENT_ID_COOKIE_KEY) || '').trim();
  if (fromCookie) return fromCookie;

  // Backward-compatibility: recover history tied to the old localStorage client id.
  try {
    const fromLegacyLocalStorage = (window.localStorage.getItem(LEGACY_CLIENT_ID_LOCAL_STORAGE_KEY) || '').trim();
    if (fromLegacyLocalStorage) return fromLegacyLocalStorage;
  } catch {
    // Ignore storage access failures (e.g., browser privacy mode).
  }

  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export default function App() {
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;

    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'true') return true;
    if (saved === 'false') return false;

    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  });
  const [activeSection, setActiveSection] = useState('supervisor');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const [messages, setMessages] = useState<Message[]>([]);
  const [currentAnalysis, setCurrentAnalysis] =
    useState<AnalysisRun | null>(null);

  const [activatedAgents, setActivatedAgents] = useState<ActivatedAgent[]>([]);
  const [executionTimeline, setExecutionTimeline] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<UISuggestionItem[]>([]);
  const [clientId, setClientId] = useState<string>(() => resolveInitialClientId());
  const [currentThreadId, setCurrentThreadId] = useState<string | null>(null);
  const [chatThreads, setChatThreads] = useState<ChatThreadSummary[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [isChatPanelCollapsed, setIsChatPanelCollapsed] = useState(false);

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

  useEffect(() => {
    if (!clientId || typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    if (params.get(CLIENT_ID_QUERY_PARAM) !== clientId) {
      params.set(CLIENT_ID_QUERY_PARAM, clientId);
      const nextUrl = `${window.location.pathname}?${params.toString()}${window.location.hash}`;
      window.history.replaceState({}, '', nextUrl);
    }

    writeCookieValue(CLIENT_ID_COOKIE_KEY, clientId);
  }, [clientId]);

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

  const addSuggestionsFromResult = (
    source: string,
    result?: Partial<AgentOrchestrationResult> | null,
  ) => {
    if (!result) return;
    const recs = result.recommendations || [];
    if (!Array.isArray(recs) || recs.length === 0) return;

    const mapped: UISuggestionItem[] = recs.map((text, index) => ({
      id: `${source}-${Date.now()}-${index}`,
      title: `Recommendation ${index + 1}`,
      description: text,
      prompt: text,
      source,
    }));

    setSuggestions((prev) => {
      const existingPrompts = new Set(prev.map((item) => item.prompt.toLowerCase()));
      const deduped = mapped.filter((item) => !existingPrompts.has(item.prompt.toLowerCase()));
      return [...deduped, ...prev].slice(0, 20);
    });
  };

  const handleSendMessage = async (message: string): Promise<boolean> => {
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
    handleSendMessage(suggestion.prompt);
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

      case 'report':
        return <ReportWorkspace clientId={clientId} onRunResult={(result) => handleWorkspaceRunResult('Report Generator', result)} />;

      case 'settings':
        return (
          <SettingsWorkspace
            darkMode={darkMode}
            onToggleDarkMode={setDarkMode}
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
        chatThreads={chatThreads}
        isHistoryLoading={isHistoryLoading}
        activeThreadId={currentThreadId}
        onOpenHistoryThread={handleOpenHistoryThread}
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
