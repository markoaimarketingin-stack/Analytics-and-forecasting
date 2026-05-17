
import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { BarChart3 } from 'lucide-react';

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
  const [sidebarWidth, setSidebarWidth] = useState(326);
  const [chatPanelWidth, setChatPanelWidth] = useState(420);

  const [messages, setMessages] = useState<Message[]>([]);
  const [currentAnalysis, setCurrentAnalysis] = useState<AnalysisRun | null>(null);
  const [activatedAgents, setActivatedAgents] = useState<ActivatedAgent[]>([]);
  const [executionTimeline, setExecutionTimeline] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<UISuggestionItem[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const minSidebarWidth = 260;
  const maxSidebarWidth = 360;
  const minChatPanelWidth = 320;
  const maxChatPanelWidth = 560;
  const minMiddlePanelWidth = 500; // As requested

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'end',
    });
  }, [messages, isLoading, currentAnalysis]);

  const addSuggestionsFromResult = (source: string, result?: Partial<AgentOrchestrationResult> | null) => {
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
    const userMessage: Message = { id: `${Date.now()}-user`, role: 'user', content: message, timestamp: new Date() };
    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);
    try {
      const lower = message.toLowerCase().trim();
      setExecutionTimeline([]);
      setActivatedAgents([]);
      setCurrentAnalysis(null);
      const simpleChatPatterns = [/hello\b/, /hi\b/, /hey\b/, /help\b/, /who are you/, /what can you do/];
      const isSimpleChat = simpleChatPatterns.some((pattern) => pattern.test(lower));
      if (isSimpleChat) {
        const response = await axios.post(`${API_BASE}/chat`, { message });
        setMessages((prev) => [...prev, { id: `${Date.now()}-assistant`, role: 'assistant', content: response.data.message || 'I am ready to help.', timestamp: new Date() }]);
        return;
      }
      const response = await axios.post(`${API_BASE}/orchestrate`, { message });
      const data = response.data;
      setMessages((prev) => [...prev, { id: `${Date.now()}-assistant`, role: 'assistant', content: data.reasoning || data.message || 'Analysis completed.', timestamp: new Date() }]);
      setActivatedAgents(data.activated_agents || []);
      setExecutionTimeline(data.timeline || []);
      if (data.result) {
        addSuggestionsFromResult('Supervisor', data.result);
        setCurrentAnalysis({ id: `${Date.now()}-analysis`, timestamp: new Date(), status: 'completed', payload: data.payload, result: data.result });
      }
    } catch (error: any) {
      setMessages((prev) => [...prev, { id: `${Date.now()}-error`, role: 'assistant', content: error?.message || 'Error processing request.', timestamp: new Date() }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExecuteSuggestion = (suggestion: UISuggestionItem) => handleSendMessage(suggestion.prompt);
  const handleWorkspaceRunResult = (source: string, result: AgentOrchestrationResult) => addSuggestionsFromResult(source, result);

  const renderWorkspace = () => {
    switch (activeSection) {
      case 'supervisor':
        return (
          <div className="flex h-full flex-col overflow-hidden bg-black">
            <Header onMenuClick={() => setIsSidebarOpen(true)} onNewChat={handleNewChat} />
            <div className="flex-1 overflow-y-auto px-6 py-8 lg:px-8">
              <div className="mx-auto flex min-h-[70vh] w-full max-w-5xl flex-col items-center justify-center px-8 py-16 text-center">
                <div className="mb-[46px] flex h-[140px] w-[140px] items-center justify-center rounded-full border border-[rgba(255,255,255,0.08)] bg-[#000000]">
                  <img src="/symboll.png" alt="Supervisor" className="w-[54px] h-[54px] object-contain mix-blend-screen" />
                </div>
                <div className="max-w-5xl">
                  <h1 className="mb-[16px] text-[36px] font-[800] leading-[44px] text-white whitespace-nowrap">I am your Analytics Supervisor Agent</h1>
                  <p className="mx-auto max-w-[850px] text-[17px] font-[400] leading-[28px] text-zinc-400">Specialized in orchestrating funnel, cohort, attribution, forecast, and scenario workflows for unified, decision-ready insights.</p>
                </div>
              </div>
            </div>
          </div>
        );
      case 'dashboard':
        return (
          <div className="flex h-full flex-col overflow-hidden bg-black">
            <Header onMenuClick={() => setIsSidebarOpen(true)} onNewChat={handleNewChat} />
            <div className="flex-1 overflow-y-auto px-6 py-8 lg:px-8">
              <div className="mx-auto w-full max-w-6xl p-6">
                <Dashboard result={currentAnalysis?.result ?? null} isLoading={false} />
              </div>
            </div>
          </div>
        );
      case 'forecast': return <ForecastWorkspace onRunResult={(res) => handleWorkspaceRunResult('Forecast Agent', res)} />;
      case 'scenario': return <ScenarioWorkspace onRunResult={(res) => handleWorkspaceRunResult('Scenario Agent', res)} />;
      case 'funnel': return <FunnelWorkspace onRunResult={(res) => handleWorkspaceRunResult('Funnel Agent', res)} />;
      case 'cohort': return <CohortWorkspace onRunResult={(res) => handleWorkspaceRunResult('Cohort Agent', res)} />;
      case 'attribution': return <AttributionWorkspace onRunResult={(res) => handleWorkspaceRunResult('Attribution Agent', res)} />;
      case 'report': return <ReportWorkspace />;
      case 'settings': return <SettingsWorkspace />;
      default: return <div className="flex h-full items-center justify-center bg-black text-zinc-500">Select a section.</div>;
    }
  };

  const startResizingSidebar = (e: React.MouseEvent) => {
    e.preventDefault();
    document.body.style.userSelect = 'none'; // Disable text selection
    document.body.style.cursor = 'col-resize';
    const handleMouseMove = (moveEvent: MouseEvent) => {
      const rawNewWidth = moveEvent.clientX;
      const effectiveMaxSidebarWidth = window.innerWidth - chatPanelWidth - minMiddlePanelWidth;
      let newWidth = Math.min(maxSidebarWidth, rawNewWidth);
      newWidth = Math.max(minSidebarWidth, newWidth);
      newWidth = Math.min(newWidth, effectiveMaxSidebarWidth);
      newWidth = Math.max(minSidebarWidth, newWidth);
      setSidebarWidth(newWidth);
    };
    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = ''; // Re-enable text selection
      document.body.style.cursor = '';
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const startResizingChatPanel = (e: React.MouseEvent) => {
    e.preventDefault();
    const handleMouseMove = (moveEvent: MouseEvent) => {
      const newWidth = window.innerWidth - moveEvent.clientX;
      if (newWidth >= minChatPanelWidth && newWidth <= maxChatPanelWidth) {
        setChatPanelWidth(newWidth);
      }
    };
    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleNewChat = () => {
    setMessages([]);
    setCurrentAnalysis(null);
    setActivatedAgents([]);
    setExecutionTimeline([]);
  };

  return (
    <div className="app-shell flex h-screen w-screen overflow-hidden bg-black text-white">
      <Sidebar
        activeSection={activeSection}
        onSectionChange={setActiveSection}
        isMobileOpen={isSidebarOpen}
        onMobileClose={() => setIsSidebarOpen(false)}
        suggestions={suggestions}
        onExecuteSuggestion={handleExecuteSuggestion}
        width={sidebarWidth}
      />

      {/* Sidebar Resizer: sits directly between Sidebar and Main content */}
      <div
        onMouseDown={startResizingSidebar}
        className="hidden lg:block h-full w-1 cursor-col-resize bg-[rgba(255,255,255,0.08)] transition-colors hover:bg-[rgba(255,255,255,0.22)] z-10"
      />

      <div className="flex-1 min-w-0 overflow-hidden h-full">
        {renderWorkspace()}
      </div>

      {/* ChatPanel Resizer: sits directly between Main content and Chat panel */}
      <div
        onMouseDown={startResizingChatPanel}
        className="hidden lg:block h-full w-1 cursor-col-resize bg-[rgba(255,255,255,0.08)] transition-colors hover:bg-[rgba(255,255,255,0.22)] z-10"
      />

      <ChatPanel
        messages={messages}
        isLoading={isLoading}
        currentAnalysis={currentAnalysis}
        executionTimeline={executionTimeline}
        activatedAgents={activatedAgents}
        handleSendMessage={handleSendMessage}
        onNewChat={handleNewChat}
        width={chatPanelWidth}
      />

      {/* Knowledge Base Modals */}
      <ExistingFilesModal />
      <UploadFileModal />
      <DatasetSelectionModal />
    </div>
  );
}
