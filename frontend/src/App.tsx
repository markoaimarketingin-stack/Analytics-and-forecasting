import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { Bot, History, X } from 'lucide-react';

import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import ChatPanel from './components/ChatPanel';
import ManageModelsModal from './components/ManageModelsModal';
import ExistingFilesModal from './components/knowledge/ExistingFilesModal';
import UploadFileModal from './components/knowledge/UploadFileModal';
import DatasetSelectionModal from './components/knowledge/DatasetSelectionModal';

import ForecastWorkspace from './components/forecast/ForecastWorkspace';
import ScenarioWorkspace from './components/scenario/ScenarioWorkspace';
import FunnelWorkspace from './components/funnel/FunnelWorkspace';
import CohortWorkspace from './components/cohort/CohortWorkspace';
import AttributionWorkspace from './components/attribution/AttributionWorkspace';
import BudgetAllocatorWorkspace from './components/budget/BudgetAllocatorWorkspace';
import DataQueryWorkspace from './components/dataquery/DataQueryWorkspace';
import PreprocessingWorkspace from './components/preprocessing/PreprocessingWorkspace';
import ReportWorkspace from './components/report/ReportWorkspace';
import SettingsWorkspace from './components/settings/SettingsWorkspace';
import SupervisorWorkspace from './components/supervisor/SupervisorWorkspace';
import {
  clearRecommendationOutcomes,
  fetchRecommendationOutcomes,
  orchestrateAgents,
  upsertRecommendationOutcome,
  getAgentResults,
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

const mapTabToSection = (tab: string): string => {
  const t = (tab || '').toLowerCase().trim();
  if (t === 'overview' || t === 'dashboard') return 'dashboard';
  if (t === 'campaigns' || t === 'forecast') return 'forecast';
  if (t === 'reports' || t === 'report') return 'report';
  if (t === 'budget') return 'budget';
  if (t === 'attribution') return 'attribution';
  if (t === 'funnel') return 'funnel';
  if (t === 'cohort') return 'cohort';
  return t;
};

const mapSectionToTab = (section: string): string => {
  if (section === 'dashboard') return 'overview';
  if (section === 'forecast') return 'campaigns';
  if (section === 'report') return 'reports';
  return section;
};

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
  const [chatMode, setChatMode] = useState<'ask' | 'agent'>('ask');
  const [isManageModelsOpen, setIsManageModelsOpen] = useState(false);

  // AbortController ref for cancelling in-flight chat/orchestrate requests
  const abortControllerRef = useRef<AbortController | null>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [currentAnalysis, setCurrentAnalysis] =
    useState<AnalysisRun | null>(null);

  const [activatedAgents, setActivatedAgents] = useState<ActivatedAgent[]>([]);
  const [executionTimeline, setExecutionTimeline] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<UISuggestionItem[]>([]);
  const [currentThreadId, setCurrentThreadId] = useState<string | null>(null);
  const [chatThreads, setChatThreads] = useState<ChatThreadSummary[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isChatPanelCollapsed, setIsChatPanelCollapsed] = useState(false);
  const [supervisorResetToken, setSupervisorResetToken] = useState(0);

  const [isEmbedded] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    return window.location.pathname.includes('/embed') || params.has('token') || params.has('org_id');
  });

  const [activePlatform, setActivePlatform] = useState<string>(() => {
    if (typeof window === 'undefined') return 'meta';
    const params = new URLSearchParams(window.location.search);
    return params.get('platform') || 'meta';
  });

  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('all');

  // Handle URL tab initialization
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get('tab');
    if (tabParam) {
      setActiveSection(mapTabToSection(tabParam));
    }
  }, []);

  // Inbound postMessage event listener
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleMessage = (event: MessageEvent) => {
      const { type, payload } = event.data || {};
      if (!type) return;

      if (type === 'SELECT_TAB' && payload?.tab) {
        setActiveSection(mapTabToSection(payload.tab));
      } else if (type === 'SELECT_PLATFORM' && payload?.platform) {
        setActivePlatform(payload.platform);
      } else if (type === 'SELECT_CAMPAIGN' && payload?.campaignId) {
        setSelectedCampaignId(payload.campaignId);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Outbound postMessage sync broadcaster
  useEffect(() => {
    if (typeof window === 'undefined' || !isEmbedded) return;

    window.parent.postMessage(
      {
        type: 'UI_SYNC',
        payload: {
          tab: mapSectionToTab(activeSection),
          platform: activePlatform,
          campaignId: selectedCampaignId,
          orgId: clientId,
        },
      },
      '*'
    );
  }, [activeSection, activePlatform, selectedCampaignId, clientId, isEmbedded]);

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

  const loadChatThreads = async (resolvedClientId: string) => {
    if (!resolvedClientId) return;
    setIsHistoryLoading(true);

    try {
      const response = await axios.get(`${API_BASE}/chat-history`, {
        withCredentials: true,
        params: {
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

    const hydrateLastAnalysis = async () => {
      try {
        const res = (await getAgentResults(undefined, clientId)) as any;
        if (res && res.success && res.results) {
          const hasSnapshot = 
            (res.recommendations && res.recommendations.length > 0) || 
            res.executive_summary || 
            Object.keys(res.results).length > 0;
            
          if (hasSnapshot) {
            const data = {
              success: true,
              executive_summary: res.executive_summary || null,
              recommendations: res.recommendations || [],
              funnel: res.results?.funnel || null,
              cohort: res.results?.cohort || null,
              attribution: res.results?.attribution || null,
              forecast: res.results?.forecast || null,
              scenario: res.results?.scenario || null,
            };
            
            const run: AnalysisRun = {
              id: 'cached-analysis',
              timestamp: new Date(res.timestamp || Date.now()),
              status: 'completed',
              payload: {} as any,
              result: data as any,
            };
            setCurrentAnalysis(run);
          }
        }
      } catch (error) {
        console.error('Failed to restore last analysis snapshot:', error);
      }
    };
    hydrateLastAnalysis();
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
        withCredentials: true,
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

  const addSuggestionsFromResult = async (
    source: string,
    result?: Partial<AgentOrchestrationResult> | null,
    replace = false,
  ) => {
    if (!result) return;
    const recs = result.recommendations || [];
    if (!Array.isArray(recs) || recs.length === 0) return;

    const now = toIsoNow();

    const mapped: UISuggestionItem[] = recs.map((itemObj: any, index) => {
      const isObj = itemObj && typeof itemObj === 'object';
      const text = isObj ? (itemObj.prompt || itemObj.title || '') : String(itemObj);
      const title = isObj && itemObj.title ? itemObj.title : buildSuggestionBaseTitle(text, index + 1);
      const description = isObj && itemObj.description ? itemObj.description : text;
      const expectedImpact = isObj && itemObj.expected_impact ? itemObj.expected_impact : undefined;

      return {
        id: `${source}-${Date.now()}-${index}`,
        title,
        description,
        prompt: text,
        source,
        status: 'pending',
        expectedImpact,
        lastUpdatedAt: now,
        clientId,
        threadId: currentThreadId || undefined,
      };
    });

    let nextSuggestions: UISuggestionItem[] = [];

    if (replace) {
      nextSuggestions = mapped;
      setSuggestions(mapped);

      // Clear previous suggestions in database and persist newly generated ones
      try {
        await clearRecommendationOutcomes(clientId, currentThreadId || undefined);
        for (const item of mapped) {
          await persistSuggestionOutcome(item);
        }
      } catch (error) {
        console.error('Failed to clear and update recommendations in database:', error);
      }
    } else {
      // Specialist Agent: Add up/append to existing suggestions
      setSuggestions((prev) => {
        const existingPrompts = new Set(prev.map(item => item.prompt.toLowerCase()));
        const uniqueNew = mapped.filter(item => !existingPrompts.has(item.prompt.toLowerCase()));
        const combined = [...uniqueNew, ...prev].slice(0, 50);
        nextSuggestions = combined;
        return combined;
      });

      // Persist the newly added specialist agent suggestions in database
      try {
        for (const item of mapped) {
          await persistSuggestionOutcome(item);
        }
      } catch (error) {
        console.error('Failed to append recommendations to database:', error);
      }
    }

    // Save suggestions to localStorage
    setTimeout(() => {
      const contextKey = recommendationStorageKey(clientId, currentThreadId);
      localStorage.setItem(contextKey, JSON.stringify(nextSuggestions));
    }, 50);
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
    mode: 'ask' | 'agent' = chatMode,
    executionContext?: { executedSuggestionId?: string },
  ): Promise<boolean> => {
    if (!message.trim()) return false;

    // Cancel any existing in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const userMessage: Message = {
      id: `${Date.now()}-user`,
      role: 'user',
      content: message,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    try {
      // Clear previous analysis UI immediately so old cards do not persist
      setExecutionTimeline([]);
      setActivatedAgents([]);
      setCurrentAnalysis(null);

      // ── Ask mode: pure Q&A via /api/chat ─────────────────────────────
      if (mode === 'ask') {
        const response = await axios.post(`${API_BASE}/chat`, {
          message,
          thread_id: currentThreadId,
          mode: 'ask',
        }, {
          withCredentials: true,
          signal: abortController.signal,
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

        setExecutionTimeline([]);
        setActivatedAgents([]);
        setCurrentAnalysis(null);
        if (clientId) {
          loadChatThreads(clientId);
        }

        return true;
      }

      // ── Agent mode: heuristic routing ────────────────────────────────
      const lower = message.toLowerCase().trim();

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
          mode: 'agent',
        }, {
          withCredentials: true,
          signal: abortController.signal,
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
      }, {
        withCredentials: true,
        signal: abortController.signal,
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
        addSuggestionsFromResult('Supervisor', data.result, true);

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
      // Ignore cancellation errors
      if (axios.isCancel(error) || error?.name === 'AbortError' || error?.code === 'ERR_CANCELED') {
        return false;
      }

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
      abortControllerRef.current = null;
    }
  };

  const handleCancelMessage = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsLoading(false);
    setMessages((prev) => [
      ...prev,
      {
        id: `${Date.now()}-cancelled`,
        role: 'assistant',
        content: 'Generation stopped.',
        timestamp: new Date(),
      },
    ]);
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

      addSuggestionsFromResult('Supervisor', data, true);

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
    void handleSendMessage(suggestion.prompt, 'agent', { executedSuggestionId: suggestion.id });
  };

  const handleRemoveSuggestion = (suggestionId: string) => {
    setSuggestions((prev) => prev.filter((item) => item.id !== suggestionId));
  };

  const handleIgnoreSuggestion = (suggestionId: string) => {
    // Move the item to the END of the queue — not removed
    setSuggestions((prev) => {
      const idx = prev.findIndex((s) => s.id === suggestionId);
      if (idx === -1) return prev;
      const copy = [...prev];
      const [item] = copy.splice(idx, 1);
      const updatedItem = {
        ...item,
        lastUpdatedAt: new Date(0).toISOString(), // Epoch to sort last when retrieved from Supabase/DB
      };
      persistSuggestionOutcome(updatedItem);
      return [...copy, updatedItem];
    });
  };


  const handleCancelSupervisorPipeline = () => {
    setIsLoading(false);
    setMessages((prev) => [
      ...prev,
      {
        id: `${Date.now()}-cancelled`,
        role: 'assistant',
        content: 'Analysis pipeline cancelled.',
        timestamp: new Date(),
      },
    ]);
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
              onCancelAnalysis={handleCancelSupervisorPipeline}
              onOpenDashboard={() => setActiveSection('dashboard')}
              resetToken={supervisorResetToken}
              clientId={clientId}
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

      case 'data-query':
        return <DataQueryWorkspace clientId={clientId} />;

      case 'preprocessing':
        return <PreprocessingWorkspace clientId={clientId} />;

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
      {!isEmbedded && (
        <Sidebar
          activeSection={activeSection}
          onSectionChange={setActiveSection}
          isMobileOpen={isSidebarOpen}
          onMobileClose={() => setIsSidebarOpen(false)}
          accountName={accountName}
          accountEmail={accountEmail}
        />
      )}
 
      <div className={`ml-0 flex min-w-0 flex-1 overflow-hidden ${isEmbedded ? '' : 'lg:ml-64'}`}>
        <div className="min-w-0 flex-1 overflow-hidden">
          <div key={activeSection} className="h-full page-enter">
            {renderWorkspace()}
          </div>
        </div>
 
        {!isEmbedded && !isChatPanelCollapsed ? (
          <ChatPanel
            messages={messages}
            isLoading={isLoading}
            currentAnalysis={currentAnalysis}
            executionTimeline={executionTimeline}
            activatedAgents={activatedAgents}
            onNewChat={handleNewChat}
            onCollapse={() => setIsChatPanelCollapsed(true)}
            handleSendMessage={handleSendMessage}
            onCancelMessage={handleCancelMessage}
            mode={chatMode}
            onModeChange={setChatMode}
            suggestions={suggestions}
            onExecuteSuggestion={handleExecuteSuggestion}
            onIgnoreSuggestion={handleIgnoreSuggestion}
            onRemoveSuggestion={handleRemoveSuggestion}
            onOpenHistory={() => setIsHistoryOpen(true)}
            onManageModels={() => setIsManageModelsOpen(true)}
          />
        ) : null}
      </div>
 
      {!isEmbedded && isChatPanelCollapsed ? (
        <button
          type="button"
          onClick={() => setIsChatPanelCollapsed(false)}
          aria-label="Open chat panel"
          title="Open chat panel"
          className="fixed right-6 top-1/2 z-40 hidden h-16 w-16 -translate-y-1/2 items-center justify-center rounded-full border-0 bg-transparent shadow-none transition duration-200 lg:flex"
        >
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-black p-1 shadow-[0_10px_20px_rgba(0,0,0,0.24)]">
            <div className="h-8 w-8 overflow-hidden rounded-full bg-transparent">
              <img src="/img.png" alt="Marko AI" className="h-full w-full object-cover" />
            </div>
          </div>
        </button>
      ) : null}

      {/* Execution History Drawer */}
      <div
        className={`drawer-backdrop fixed inset-0 z-[60] transition-all duration-300 ${
          isHistoryOpen
            ? 'pointer-events-auto opacity-100'
            : 'pointer-events-none opacity-0'
        }`}
        onClick={() => setIsHistoryOpen(false)}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className={`drawer-panel absolute right-0 top-0 flex h-full w-[420px] flex-col border-l border-gray-200 bg-white text-gray-900 shadow-2xl transition-transform duration-300 ${
            isHistoryOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
        >
          <div className="flex items-center justify-between border-b border-gray-200 px-6 py-5">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-gray-500">
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
                  const isActiveThread = currentThreadId === thread.id;
                  return (
                    <button
                      key={thread.id}
                      onClick={() => {
                        handleOpenHistoryThread(thread.id);
                        setIsHistoryOpen(false);
                      }}
                      className={`w-full rounded-3xl border p-4 text-left transition duration-300 ${
                        isActiveThread
                          ? 'border-gray-900 bg-gray-100 shadow-sm'
                          : 'border-gray-200 bg-white hover:-translate-y-0.5 hover:border-gray-300 hover:bg-gray-50 hover:shadow-md'
                      }`}
                    >
                      <div className="truncate text-sm font-semibold text-gray-900">{thread.title || 'New Chat'}</div>
                      <div className="mt-1 line-clamp-2 text-xs leading-5 text-gray-500">
                        {thread.last_message_preview || 'Open this thread to continue the conversation.'}
                      </div>
                      <div className="mt-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-600">
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

      {/* Knowledge Base Modals */}
      <ExistingFilesModal />
      <UploadFileModal />
      <DatasetSelectionModal />

      {/* Manage Models Modal */}
      <ManageModelsModal
        isOpen={isManageModelsOpen}
        onClose={() => setIsManageModelsOpen(false)}
      />
    </div>
  );
}
