import React from 'react';
import { Bot, BookOpen, Plus, X } from 'lucide-react';
import MessageList from './MessageList';
import ChatInput from './ChatInput';
import type { Message, AnalysisRun } from '../types';
import { useKnowledgeBase } from '../context/KnowledgeBaseContext';

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
}: ChatPanelProps) {
  const messagesEndRef = React.useRef<HTMLDivElement>(null);
  const { openDatasetSelectionModal } = useKnowledgeBase();

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

  return (
    <aside className="chat-panel-glass hidden w-full flex-col lg:flex lg:w-[430px]">
      {/* Keep this header h-20 to align with main workspace headers. */}
      <div className="chat-panel-header relative flex h-20 items-center justify-between border-b border-gray-200/80 bg-white/85 px-6 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-black text-white shadow-[0_10px_20px_rgba(0,0,0,0.24)]">
            <Bot className="h-5 w-5" />
          </div>
        </div>

        <div className="mr-12 flex items-center gap-2">
          <button
            onClick={onNewChat}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 px-4 text-xs font-semibold text-white shadow-[0_8px_20px_rgba(59,130,246,0.3)] transition hover:brightness-105"
          >
            <Plus className="h-3.5 w-3.5" /> New Chat
          </button>
          <button
            onClick={openDatasetSelectionModal}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-full border-2 border-solid border-[#7c3aed] bg-white px-3 text-xs font-semibold text-violet-600 transition hover:bg-violet-50"
          >
            <BookOpen className="h-4 w-4" /> Knowledge Base
          </button>
        </div>

        <button
          onClick={onCollapse}
          aria-label="Close chat panel"
          title="Close chat panel"
          className="absolute right-4 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-500 transition hover:bg-gray-100 hover:text-gray-700"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="chat-panel-body flex-1 overflow-y-auto bg-gradient-to-b from-[#f7f8fb] to-[#f3f5fa] px-5 py-5 lg:px-6">
          <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
            <MessageList messages={messages} isLoading={isLoading} />
            <div ref={messagesEndRef} />
          </div>
        </div>

        <div className="chat-panel-footer border-t border-gray-200/80 bg-white/90 px-5 py-4 backdrop-blur lg:px-6">
          <div className="mx-auto max-w-5xl">
            <ChatInput onSend={handleSendMessage} isLoading={isLoading} />
          </div>
        </div>
      </div>
    </aside>
  );
}

