import React from 'react';
import { Bot, Plus, History, X, MessageSquare, Lightbulb, Play } from 'lucide-react';
import MessageList from './MessageList';
import ChatInput from './ChatInput';
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
  handleSendMessage: (message: string) => void;
  suggestions: UISuggestionItem[];
  onExecuteSuggestion: (suggestion: UISuggestionItem) => void;
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
  suggestions,
  onExecuteSuggestion,
  onRemoveSuggestion,
  onOpenHistory,
  onManageModels,
}: ChatPanelProps) {
  const [activeTab, setActiveTab] = React.useState<'chatbot' | 'suggestions'>('chatbot');
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
    // Panel is on the right side of the viewport
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
    if (priority === 'HIGH') return 'border-red-950/50 bg-red-950/40 text-red-400';
    if (priority === 'MEDIUM') return 'border-amber-900/50 bg-amber-950/40 text-amber-400';
    return 'border-zinc-800 bg-zinc-900 text-zinc-400';
  };

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

      {/* Header aligned exactly like mockup */}
      <div className="chat-panel-header-dark flex h-20 items-center justify-between border-b border-zinc-900 px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-900 border border-zinc-850 p-2 shadow-inner">
            <Bot className="h-5 w-5 text-white" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-white tracking-tight leading-none">Assistant</span>
            <span className="text-[9px] font-bold text-zinc-500 tracking-wider mt-1.5 uppercase">READ-ONLY MODE</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={onNewChat}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-900 hover:text-white transition-colors"
            title="New Chat"
          >
            <Plus className="h-5 w-5" />
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
      </div>

      {/* Tab Selector */}
      <div className="px-6 py-3 bg-black border-b border-zinc-900/60">
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
        </div>
      </div>

      {/* Body Area */}
      <div className="flex flex-1 flex-col overflow-hidden bg-black">
        {activeTab === 'chatbot' ? (
          messages.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
              <p className="text-zinc-500 text-sm max-w-xs leading-relaxed font-medium">
                Ask mode is for Q&A and fetching context. Agent mode can prepare optimizations or Meta budget changes, always behind confirmation.
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
        ) : (
          <div className="chat-panel-body flex-1 overflow-y-auto px-5 py-5 lg:px-6 space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500 mb-4 px-1">Suggested Actions</h3>
            <div className="space-y-4">
              {suggestions.length > 0 ? (
                suggestions.map((item) => {
                  const isClosed = Boolean(item.submittedAt);
                  const priority = inferPriority(item);

                  return (
                    <div
                      key={item.id}
                      className="suggestion-card-dark"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-sm font-semibold text-white pr-2">
                          {item.title}
                        </div>
                        <span className={`rounded-xl border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${priorityBadgeClass(priority)}`}>
                          {priority}
                        </span>
                      </div>

                      <div className="mt-2 text-xs leading-5 text-zinc-400">
                        {item.description}
                      </div>

                      <div className="mt-2 text-[9px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                        Source: {item.source}
                      </div>

                      <div className="mt-4 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onExecuteSuggestion(item)}
                          disabled={isClosed}
                          className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-white px-3 text-xs font-bold text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-600"
                        >
                          <Play className="h-3 w-3 fill-black text-black" />
                          Execute in Chat
                        </button>

                        <button
                          type="button"
                          onClick={() => onRemoveSuggestion(item.id)}
                          className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-800 text-zinc-400 transition hover:bg-zinc-900 hover:text-white"
                          title="Remove suggestion"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>

                      {isClosed ? (
                        <p className="mt-3 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                          Closed {item.submittedAt ? `on ${formatRelativeTime(item.submittedAt)}` : ''}
                        </p>
                      ) : null}
                    </div>
                  );
                })
              ) : (
                <div className="rounded-2xl border border-zinc-900 bg-zinc-950/40 p-5 text-xs leading-5 text-zinc-500">
                  No suggestions yet. Run any specialist agent to generate actionable recommendations here.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer Area (only displayed in chatbot view) */}
        {activeTab === 'chatbot' && (
          <div className="chat-panel-footer bg-black px-5 py-4 backdrop-blur lg:px-6">
            <div className="mx-auto max-w-5xl">
              <ChatInput onSend={handleSendMessage} isLoading={isLoading} onManageModels={onManageModels} />
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
