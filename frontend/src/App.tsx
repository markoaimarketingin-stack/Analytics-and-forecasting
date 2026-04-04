
import { useEffect, useRef, useState } from 'react';
import axios from 'axios';

import Sidebar from './components/Sidebar';
import Header from './components/Header';
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

import type { AnalysisRun, AgentOrchestrationResult, Message, UISuggestionItem } from './types';

const API_BASE =
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_API_URL ||
  'http://localhost:8001/api';

interface ActivatedAgent {
  id: string;
  label: string;
}

export default function App() {
  const [activeSection, setActiveSection] = useState('supervisor');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const [messages, setMessages] = useState<Message[]>([]);
  const [currentAnalysis, setCurrentAnalysis] =
    useState<AnalysisRun | null>(null);

  const [activatedAgents, setActivatedAgents] = useState<ActivatedAgent[]>([]);
  const [executionTimeline, setExecutionTimeline] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<UISuggestionItem[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'end',
    });
  }, [messages, isLoading, currentAnalysis]);

  const handleNewChat = () => {
    setMessages([]);
    setCurrentAnalysis(null);
    setActivatedAgents([]);
    setExecutionTimeline([]);
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

  const handleSendMessage = async (message: string) => {
    if (!message.trim()) return;

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
        });

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

        return;
      }

      const response = await axios.post(`${API_BASE}/orchestrate`, {
        message,
      });

      const data = response.data;

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
    } finally {
      setIsLoading(false);
    }
  };

  const handleExecuteSuggestion = (suggestion: UISuggestionItem) => {
    handleSendMessage(suggestion.prompt);
  };

  const handleWorkspaceRunResult = (source: string, result: AgentOrchestrationResult) => {
    addSuggestionsFromResult(source, result);
  };

  const renderWorkspace = () => {
    switch (activeSection) {
      case 'supervisor':
        return (
          <div className="flex h-full flex-col overflow-hidden bg-[#f6f7f9]">
            <Header
              onMenuClick={() => setIsSidebarOpen(true)}
              onNewChat={handleNewChat}
            />

            <div className="flex-1 overflow-y-auto px-6 py-8 lg:px-8">
              <div className="mx-auto flex min-h-[70vh] w-full max-w-5xl items-center justify-center rounded-[32px] border border-gray-200 bg-white px-8 py-16 shadow-sm">
                <div className="max-w-3xl text-center">
                  <h1 className="mb-4 text-3xl font-extrabold tracking-tight text-black">Analytics Supervisor</h1>
                  <p className="text-base leading-8 text-gray-500 md:text-lg">
                    This is your orchestration center. The supervisor coordinates specialist agents for forecasting,
                    scenarios, funnel analysis, attribution, and cohorts, then combines them into business-ready insights.
                  </p>
                </div>
              </div>
            </div>
          </div>
        );

      case 'dashboard':
        return (
          <div className="flex h-full flex-col overflow-hidden bg-[#f6f7f9]">
            <Header
              onMenuClick={() => setIsSidebarOpen(true)}
              onNewChat={handleNewChat}
            />

            <div className="flex-1 overflow-y-auto px-6 py-8 lg:px-8">
              <div className="mx-auto w-full max-w-6xl rounded-[32px] border border-gray-200 bg-white p-6 shadow-sm">
                <Dashboard
                  result={currentAnalysis?.result ?? null}
                  isLoading={false}
                />
              </div>
            </div>
          </div>
        );

      case 'forecast':
        return <ForecastWorkspace onRunResult={(result) => handleWorkspaceRunResult('Forecast Agent', result)} />;

      case 'scenario':
        return <ScenarioWorkspace onRunResult={(result) => handleWorkspaceRunResult('Scenario Agent', result)} />;

      case 'funnel':
        return <FunnelWorkspace onRunResult={(result) => handleWorkspaceRunResult('Funnel Agent', result)} />;

      case 'cohort':
        return <CohortWorkspace onRunResult={(result) => handleWorkspaceRunResult('Cohort Agent', result)} />;

      case 'attribution':
        return <AttributionWorkspace onRunResult={(result) => handleWorkspaceRunResult('Attribution Agent', result)} />;

      case 'report':
        return <ReportWorkspace />;

      case 'settings':
        return <SettingsWorkspace />;

      default:
        return (
          <div className="flex h-full items-center justify-center bg-[#f6f7f9] text-gray-500">Select a section from the sidebar.</div>
        );
    }
  };

  return (
    <div className="app-shell flex h-screen w-screen overflow-hidden bg-[#f4f5f7] text-gray-900">
      <Sidebar
        activeSection={activeSection}
        onSectionChange={setActiveSection}
        isMobileOpen={isSidebarOpen}
        onMobileClose={() => setIsSidebarOpen(false)}
        suggestions={suggestions}
        onExecuteSuggestion={handleExecuteSuggestion}
      />

      <div className="ml-0 flex min-w-0 flex-1 overflow-hidden lg:ml-64">
        <div className="min-w-0 flex-1 overflow-hidden">
          {renderWorkspace()}
        </div>

        <ChatPanel
          messages={messages}
          isLoading={isLoading}
          currentAnalysis={currentAnalysis}
          executionTimeline={executionTimeline}
          activatedAgents={activatedAgents}
          handleSendMessage={handleSendMessage}
        />
      </div>

      {/* Knowledge Base Modals */}
      <ExistingFilesModal />
      <UploadFileModal />
      <DatasetSelectionModal />
    </div>
  );
}
