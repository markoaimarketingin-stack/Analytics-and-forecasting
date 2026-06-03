import React from 'react';
import {
  Plus,
  History,
  X,
  MessageSquare,
  Lightbulb,
  Bookmark,
} from 'lucide-react';
import MessageList from './MessageList';
import ChatInput from './ChatInput';
import SuggestionCard from './SuggestionCard';
import type { Message, AnalysisRun, UISuggestionItem } from '../types';

interface ActivatedAgent {
  id: string;
  label: string;
}

interface ChatPanelProps {
  messages: Message[];
  isLoading: boolean;
  currentAnalysis: AnalysisRun | null;
  executionTimeline: string[];
  activatedAgents: ActivatedAgent[];
  onNewChat: () => void;
  onCollapse: () => void;
  handleSendMessage: (message: string, mode: 'ask' | 'agent') => void;
  onCancelMessage: () => void;
  mode: 'ask' | 'agent';
  onModeChange: (mode: 'ask' | 'agent') => void;
  suggestions: UISuggestionItem[];
  onExecuteSuggestion: (suggestion: UISuggestionItem) => void;
  onIgnoreSuggestion: (suggestionId: string) => void;
  onRemoveSuggestion: (suggestionId: string) => void;
  onOpenHistory: () => void;
  onManageModels: () => void;
}

export default function ChatPanel({
  messages,
  isLoading,
  currentAnalysis,
  executionTimeline,
  activatedAgents,
  onNewChat,
  onCollapse,
  handleSendMessage,
  onCancelMessage,
  mode,
  onModeChange,
  suggestions,
  onExecuteSuggestion,
  onIgnoreSuggestion,
  onRemoveSuggestion,
  onOpenHistory,
  onManageModels,
}: ChatPanelProps) {
  const [activeTab, setActiveTab] = React.useState<
  'chatbot' | 'suggestions' | 'saved-prompts'
  >('chatbot');
  const [width, setWidth] = React.useState(390);
  const [isResizing, setIsResizing] = React.useState(false);
  const messagesEndRef = React.useRef<HTMLDivElement>(null);

  const startResizing = React.useCallback((mouseDownEvent: React.MouseEvent) => {
    mouseDownEvent.preventDefault();
    setIsResizing(true);
  }, []);

  const stopResizing = React.useCallback(() => {
    setIsResizing(false);
  }, []);

  const resize = React.useCallback((mouseMoveEvent: MouseEvent) => {
    const newWidth = window.innerWidth - mouseMoveEvent.clientX;
    if (newWidth >= 320 && newWidth <= 750) {
      setWidth(newWidth);
    }
  }, []);

  React.useEffect(() => {
    if (isResizing) {
      window.addEventListener('mousemove', resize);
      window.addEventListener('mouseup', stopResizing);
    } else {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
    }
    return () => {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
    };
  }, [isResizing, resize, stopResizing]);

  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'end',
    });
  }, [
    messages,
    isLoading,
    currentAnalysis,
    executionTimeline,
    activatedAgents,
  ]);

  const emptyStateText = mode === 'ask'
    ? 'Ask anything about your analytics data — metrics, definitions, trends, or how agents work.'
    : 'Agent mode lets the AI run specialist agents (funnel, cohort, attribution, forecast) and build full analysis pipelines.';


  return (
    <aside
      className="chat-panel-dark panel-enter hidden w-full flex-col lg:flex"
      style={{ width: `${width}px` }}
    >
      {/* Resizer Handle */}
      <div
        className={`chat-panel-resizer ${isResizing ? 'is-resizing' : ''}`}
        onMouseDown={startResizing}
      />

      {/* Header */}
      <div className="flex items-center justify-end gap-1.5">
        <button
          onClick={onNewChat}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-900 hover:text-white transition-colors"
          title="New Chat"
        >
          <Plus className="h-5 w-5" />
        </button>

        <button
          onClick={() => setActiveTab('saved-prompts')}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-900 hover:text-white transition-colors"
          title="Saved Prompts"
        >
          <Bookmark className="h-4.5 w-4.5" />
        </button>

        <button
          onClick={onOpenHistory}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-900 hover:text-white transition-colors"
          title="Execution History"
        >
          <History className="h-4.5 w-4.5" />
        </button>

        <button
          onClick={onCollapse}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-900 hover:text-white transition-colors"
          title="Close Chat"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Tab Selector */}
      <div className="chat-tab-pill-container">
        <button
          onClick={() => setActiveTab('chatbot')}
          className={`chat-tab-pill ${activeTab === 'chatbot' ? 'chat-tab-pill-active' : ''}`}
        >
          <MessageSquare className="h-4 w-4" />
          Chatbot
        </button>

        <button
          onClick={() => setActiveTab('suggestions')}
          className={`chat-tab-pill ${activeTab === 'suggestions' ? 'chat-tab-pill-active' : ''}`}
        >
          <Lightbulb className="h-4 w-4" />
          Suggestions
        </button>

        <button
          onClick={() => setActiveTab('saved-prompts')}
          className={`chat-tab-pill ${activeTab === 'saved-prompts' ? 'chat-tab-pill-active' : ''}`}
        >
          <Bookmark className="h-4 w-4" />
          Saved
        </button>
      </div>

      {/* Body Area */}
      <div className="flex flex-1 flex-col overflow-hidden bg-black">
  {activeTab === 'chatbot' ? (
    messages.length === 0 ? (
      <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
        <p className="text-zinc-500 text-sm max-w-xs leading-relaxed font-medium">
          {emptyStateText}
        </p>
      </div>
    ) : (
      <div className="chat-panel-body flex-1 overflow-y-auto px-5 py-5 lg:px-6">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
          <MessageList messages={messages} isLoading={isLoading} />
          <div ref={messagesEndRef} />
        </div>
      </div>
    )
  ) : activeTab === 'suggestions' ? (
    <div className="chat-panel-body flex-1 overflow-y-auto px-4 py-5">
      <h3 className="text-[10px] font-bold uppercase tracking-[0.25em] text-zinc-600 mb-4 px-1">
        Suggested Actions
      </h3>

      <div className="space-y-3">
        {suggestions.length > 0 ? (
          suggestions.map((item) => (
            <SuggestionCard
              key={item.id}
              item={item}
              onExecute={onExecuteSuggestion}
              onIgnore={onIgnoreSuggestion}
            />
          ))
        ) : (
          <div className="rounded-2xl border border-zinc-900 bg-zinc-950/40 p-5 text-xs leading-5 text-zinc-500">
            No suggestions yet. Run any specialist agent to generate
            actionable recommendations here.
          </div>
        )}
      </div>
    </div>
  ) : (
    <div className="chat-panel-body flex-1 overflow-y-auto px-4 py-5">
      <h3 className="text-[10px] font-bold uppercase tracking-[0.25em] text-zinc-600 mb-4 px-1">
        Saved Prompts
      </h3>

      <div className="space-y-3">
        <div className="rounded-2xl border border-zinc-900 bg-zinc-950/40 p-5">
          <p className="text-sm text-white">
            Analyze campaign performance for the last 30 days
          </p>

          <p className="mt-2 text-right text-xs text-zinc-500">
            10:42 AM
          </p>
        </div>

        <div className="rounded-2xl border border-zinc-900 bg-zinc-950/40 p-5">
          <p className="text-sm text-white">
            Generate optimization suggestions
          </p>

          <p className="mt-2 text-right text-xs text-zinc-500">
            Yesterday
          </p>
        </div>

        <div className="rounded-2xl border border-zinc-900 bg-zinc-950/40 p-5">
          <p className="text-sm text-white">
            Forecast next month revenue
          </p>

          <p className="mt-2 text-right text-xs text-zinc-500">
            2 days ago
          </p>
        </div>
      </div>
    </div>
  )}

  {/* Footer Area (only displayed in chatbot view) */}
  {activeTab === 'chatbot' && (
    <div className="chat-panel-footer bg-black px-5 py-4 backdrop-blur lg:px-6">
      <div className="mx-auto max-w-5xl">
        <ChatInput
          onSend={handleSendMessage}
          onCancel={onCancelMessage}
          isLoading={isLoading}
          mode={mode}
          onModeChange={onModeChange}
          onManageModels={onManageModels}
        />
      </div>
    </div>
  )}
</div>
    </aside>
  );
}