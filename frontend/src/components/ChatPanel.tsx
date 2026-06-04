import React from 'react';
import {
  Plus,
  History,
  X,
  MessageSquare,
  Lightbulb,
  Bookmark,
  Trash2,
} from 'lucide-react';
import MessageList from './MessageList';
import ChatInput from './ChatInput';
import SuggestionCard from './SuggestionCard';
import type { Message, AnalysisRun, UISuggestionItem } from '../types';

const SAVED_PROMPTS_KEY = 'marko_saved_prompts';

interface SavedPrompt {
  id: string;
  content: string;
  savedAt: string; // ISO string
}

function loadSavedPrompts(): SavedPrompt[] {
  try {
    const raw = localStorage.getItem(SAVED_PROMPTS_KEY);
    return raw ? (JSON.parse(raw) as SavedPrompt[]) : [];
  } catch {
    return [];
  }
}

function persistSavedPrompts(prompts: SavedPrompt[]) {
  localStorage.setItem(SAVED_PROMPTS_KEY, JSON.stringify(prompts));
}

function formatSavedAt(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } else if (diffDays === 1) {
    return 'Yesterday';
  } else {
    return `${diffDays} days ago`;
  }
}

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

  // ── Lifted Input State ─────────────────────────────────────────
  const [input, setInput] = React.useState('');

  // ── Saved Prompts state ───────────────────────────────────────
  const [savedPrompts, setSavedPrompts] = React.useState<SavedPrompt[]>(() =>
    loadSavedPrompts()
  );

  const handleSavePrompt = React.useCallback((content: string) => {
    const newPrompt: SavedPrompt = {
      id: `sp_${Date.now()}`,
      content,
      savedAt: new Date().toISOString(),
    };
    setSavedPrompts((prev) => {
      // Avoid exact duplicates
      if (prev.some((p) => p.content === content)) return prev;
      const updated = [newPrompt, ...prev];
      persistSavedPrompts(updated);
      return updated;
    });
  }, []);

  const handleDeleteSavedPrompt = React.useCallback((id: string) => {
    setSavedPrompts((prev) => {
      const updated = prev.filter((p) => p.id !== id);
      persistSavedPrompts(updated);
      return updated;
    });
  }, []);

  const handleEditPrompt = React.useCallback((content: string) => {
    setInput(content);
    setActiveTab('chatbot');
    setTimeout(() => {
      document.getElementById('chat-textarea')?.focus();
    }, 50);
  }, []);

  const handleUseSavedPrompt = React.useCallback(
    (content: string) => {
      setInput(content);
      setActiveTab('chatbot');
      setTimeout(() => {
        document.getElementById('chat-textarea')?.focus();
      }, 50);
    },
    []
  );

  // ── Resize logic ──────────────────────────────────────────────
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
  }, [messages, isLoading, currentAnalysis, executionTimeline, activatedAgents]);

  const emptyStateText =
    mode === 'ask'
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
          {savedPrompts.length > 0 && (
            <span className="ml-1 rounded-full bg-zinc-700 px-1.5 py-0.5 text-[10px] font-bold text-zinc-200">
              {savedPrompts.length}
            </span>
          )}
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
                <MessageList
                  messages={messages}
                  isLoading={isLoading}
                  onSavePrompt={handleSavePrompt}
                  onEditPrompt={handleEditPrompt}
                />
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
                  No suggestions yet. Run any specialist agent to generate actionable
                  recommendations here.
                </div>
              )}
            </div>
          </div>
        ) : (
          /* ── Saved Prompts Tab ── */
          <div className="chat-panel-body flex-1 overflow-y-auto px-4 py-5">
            <h3 className="text-[10px] font-bold uppercase tracking-[0.25em] text-zinc-600 mb-4 px-1">
              Saved Prompts
            </h3>

            <div className="space-y-3">
              {savedPrompts.length > 0 ? (
                savedPrompts.map((prompt) => (
                  <div
                    key={prompt.id}
                    className="group rounded-2xl border border-zinc-900 bg-zinc-950/40 p-4"
                  >
                    <p className="text-sm text-white leading-relaxed">{prompt.content}</p>

                    <div className="mt-3 flex items-center justify-between">
                      <p className="text-xs text-zinc-500">{formatSavedAt(prompt.savedAt)}</p>

                      <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          type="button"
                          onClick={() => handleUseSavedPrompt(prompt.content)}
                          className="rounded px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-white transition-colors"
                          title="Send this prompt"
                        >
                          Use
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteSavedPrompt(prompt.id)}
                          className="flex items-center justify-center rounded p-1 text-zinc-600 hover:bg-zinc-800 hover:text-red-400 transition-colors"
                          title="Delete saved prompt"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-zinc-900 bg-zinc-950/40 p-5 text-xs leading-5 text-zinc-500">
                  No saved prompts yet. Hover over any message you've sent and click{' '}
                  <span className="text-zinc-400 font-medium">Save Prompt</span> to save it here.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer — only in chatbot tab */}
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
                input={input}
                setInput={setInput}
              />
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
