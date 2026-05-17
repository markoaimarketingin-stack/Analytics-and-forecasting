import React from 'react';
import { Bot, Plus, X, History } from 'lucide-react';
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
  onNewChat?: () => void;
  width?: number;
}

export default function ChatPanel({
  messages,
  isLoading,
  currentAnalysis,
  executionTimeline,
  activatedAgents,
  handleSendMessage,
  onNewChat,
  width,
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
    <aside 
      className="hidden w-full flex-col border-l border-zinc-800 bg-black lg:flex text-white"
      style={{ width: typeof window !== 'undefined' && window.innerWidth >= 1024 ? width : undefined }}
    >
      {/* Header */}
      <div className="flex h-[82px] items-center justify-between border-b border-zinc-800 bg-black px-6">
        <div className="flex items-center">
          <Bot className="h-[18px] w-[18px] text-white" />
        </div>

        <div className="flex items-center gap-4">
          <button onClick={onNewChat} className="flex h-9 w-9 items-center justify-center rounded-xl text-white transition hover:bg-zinc-900">
            <Plus size={16} />
          </button>
          <button className="flex h-9 w-9 items-center justify-center rounded-xl text-white transition hover:bg-zinc-900">
            <History size={16} />
          </button>
          <button className="flex h-9 w-9 items-center justify-center rounded-xl text-white transition hover:bg-zinc-900">
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto bg-black px-5 py-6 lg:px-6">
          <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
            <MessageList messages={messages} isLoading={isLoading} />
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input */}
      <div className="bg-black px-[32px] pb-[28px] pt-2">
          <div className="mx-auto w-full">
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