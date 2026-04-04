import React from 'react';
import { Bot } from 'lucide-react';
import MessageList from './MessageList';
import ChatInput from './ChatInput';
import type { Message, AnalysisRun } from '../types';

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
  handleSendMessage: (message: string) => void;
}

export default function ChatPanel({
  messages,
  isLoading,
  currentAnalysis,
  executionTimeline,
  activatedAgents,
  handleSendMessage,
}: ChatPanelProps) {
  const messagesEndRef = React.useRef<HTMLDivElement>(null);

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
    <aside className="chat-panel-glass hidden w-full flex-col lg:flex lg:w-[420px]">
      {/* Header */}
      <div className="workspace-header-glass border-b px-6 py-3">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-violet-600 text-white shadow-[0_12px_30px_rgba(79,70,229,0.35)]">
            <Bot className="h-7 w-7" />
          </div>

          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-blue-600">
              Analytics Supervisor
            </div>

            <div className="mt-1 flex items-center gap-2">
              <div className="h-2.5 w-2.5 rounded-full bg-green-500" />
              <span className="text-sm font-medium text-green-600">
                Online
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto bg-gradient-to-b from-[#f7f8fb] to-[#f4f5f8] px-5 py-6 lg:px-6">
          <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
            <MessageList messages={messages} isLoading={isLoading} />
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input */}
        <div className="workspace-header-glass border-t px-5 py-5 lg:px-6">
          <div className="mx-auto max-w-5xl">
            <ChatInput
              onSend={handleSendMessage}
              isLoading={isLoading}
            />
          </div>
        </div>
      </div>
    </aside>
  );
}