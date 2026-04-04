
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

import type { AnalysisRun, Message } from './types';

const API_BASE =
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_API_URL ||
  'http://localhost:8001/api';

interface ActivatedAgent {
  id: string;
  label: string;
}

export default function App() {
  const [activeSection, setActiveSection] = useState('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const [messages, setMessages] = useState<Message[]>([]);
  const [currentAnalysis, setCurrentAnalysis] =
    useState<AnalysisRun | null>(null);

  const [activatedAgents, setActivatedAgents] = useState<ActivatedAgent[]>([]);
  const [executionTimeline, setExecutionTimeline] = useState<string[]>([]);

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

      const isSimpleChat = simpleChatPatterns.some((pattern) =>
        pattern.test(lower),
      );

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

  const renderWorkspace = () => {
    switch (activeSection) {
      case 'forecast':
        return <ForecastWorkspace />;

      case 'scenario':
        return <ScenarioWorkspace />;

      case 'funnel':
        return <FunnelWorkspace />;

      case 'cohort':
        return <CohortWorkspace />;

      case 'attribution':
        return <AttributionWorkspace />;

      case 'report':
        return <ReportWorkspace />;

      default:
        return (
          <div className="flex h-full flex-col overflow-hidden bg-[#f6f7f9]">
            <Header
              onMenuClick={() => setIsSidebarOpen(true)}
              onNewChat={handleNewChat}
            />

            <div className="flex-1 overflow-y-auto px-6 py-8 lg:px-8">
              <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
                {messages.length === 0 && !currentAnalysis && (
                  <div className="flex min-h-[65vh] items-center justify-center rounded-[32px] border border-gray-200 bg-white px-8 py-16 shadow-sm">
                    <div className="max-w-3xl text-center">
                      <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-black text-white shadow-sm">
                        <svg
                          width="20"
                          height="20"
                          viewBox="0 0 24 24"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path
                            d="M3 12H6L8.2 5L11.8 19L14 10H21"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </div>

                      <h1 className="mb-4 text-3xl font-extrabold tracking-tight text-black">
                        Analytics Supervisor
                      </h1>

                      <p className="mx-auto max-w-2xl text-base leading-8 text-gray-500 md:text-lg">
                        Ask about forecasts, scenarios, attribution, funnel
                        optimization, customer retention, budget allocation, or
                        executive summaries.
                      </p>
                    </div>
                  </div>
                )}

                {currentAnalysis?.result && (
                  <div className="rounded-[32px] border border-gray-200 bg-white p-6 shadow-sm">
                    <Dashboard
                      result={currentAnalysis.result}
                      isLoading={false}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#f4f5f7] text-gray-900">
      <Sidebar
        activeSection={activeSection}
        onSectionChange={setActiveSection}
        isMobileOpen={isSidebarOpen}
        onMobileClose={() => setIsSidebarOpen(false)}
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
