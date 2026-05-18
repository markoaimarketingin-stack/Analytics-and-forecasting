import { useState, useEffect, useRef, type KeyboardEvent } from 'react';
import MessageList from './MessageList';
import SuggestionsPanel from './SuggestionsPanel'; // Import SuggestionsPanel
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
  handleSendMessage: (message: string) => void;
  suggestions: UISuggestionItem[]; // Add suggestions prop
  onExecuteSuggestion: (suggestion: UISuggestionItem) => void; // Add onExecuteSuggestion prop
  onNewChat?: () => void;
  onClosePanel: () => void; // Add onClosePanel prop
  width?: number;
}

export default function ChatPanel({
  messages,
  isLoading,
  currentAnalysis,
  executionTimeline,
  activatedAgents,
  handleSendMessage,
  suggestions,
  onExecuteSuggestion,
  onNewChat,
  onClosePanel,
  width,
}: ChatPanelProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
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
  
  const [activeTab, setActiveTab] = useState<"chatbot" | "suggestions">("chatbot");
  const [input, setInput] = useState('');

  const handleSend = () => {
    if (input.trim()) {
      handleSendMessage(input);
      setInput('');
    }
  };

  const handleKeyPress = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <aside
      className="flex flex-col shrink-0 overflow-hidden bg-[#000000] border-l border-[rgba(255,255,255,0.08)]"
      style={{ width: width ? `${width}px` : '380px', minWidth: '340px', maxWidth: '500px', height: '100vh' }}
    >
      {/* Header */}
      <div className="flex shrink-0 items-center border-b border-[rgba(255,255,255,0.08)] pl-[28px] pr-[28px]" style={{ height: '86px' }}>
        <div className="flex items-center">
          <img src="/marko%20ai.png" alt="AI Assistant" className="h-[28px] w-[28px] object-contain opacity-100" />
          <div className="ml-[10px] text-[16px] font-semibold leading-[20px] tracking-[-0.01em] text-[#ffffff]">AI Assistant</div>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-[32px]">
          <button onClick={onNewChat} className="transition-opacity hover:opacity-80 cursor-pointer">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
          </button>
          <button 
            onClick={() => {}} 
            className="transition-opacity hover:opacity-80 cursor-pointer"
            aria-label="Reload previous chats"
            title="Reload previous chats"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 1 0 3-6.7" />
              <path d="M3 3v6h6" />
              <path d="M12 7v5l3 3" />
            </svg>
          </button>
          <button onClick={onClosePanel} className="transition-opacity hover:opacity-80 cursor-pointer">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      </div>

      {/* Chatbot / Suggestions Tabs */}
      <div className="mx-[28px] mt-[14px] grid h-[52px] grid-cols-2 overflow-hidden rounded-[10px] border border-[rgba(255,255,255,0.14)] bg-[#000000]">
        <button
          onClick={() => setActiveTab("chatbot")}
          className={`flex min-w-0 items-center justify-center gap-[10px] overflow-hidden text-[16px] font-medium leading-[20px] transition-colors cursor-pointer ${
            activeTab === "chatbot"
              ? "bg-gradient-to-br from-[rgba(255,255,255,0.08)] to-[rgba(255,255,255,0.025)] text-[#ffffff]"
              : "bg-transparent text-[rgba(255,255,255,0.55)]"
          }`}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
          </svg>
          Chatbot
        </button>
        <button
          onClick={() => setActiveTab("suggestions")}
          className={`flex min-w-0 items-center justify-center gap-[10px] overflow-hidden text-[16px] font-medium leading-[20px] transition-colors cursor-pointer ${
            activeTab === "suggestions"
              ? "bg-gradient-to-br from-[rgba(255,255,255,0.08)] to-[rgba(255,255,255,0.025)] text-[#ffffff]"
              : "bg-transparent text-[rgba(255,255,255,0.55)]"
          }`}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"></path>
            <path d="M9 18h6"></path>
            <path d="M10 22h4"></path>
          </svg>
          Suggestions
        </button>
      </div>

      {/* Body Area */}
      <div className="relative flex-1 bg-[#000000] overflow-hidden">
        {activeTab === "chatbot" && (
          messages.length > 0 && (
            <div className="flex-1 overflow-y-auto px-5 py-6 lg:px-6">
              <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
                <MessageList messages={messages} isLoading={isLoading} />
                <div ref={messagesEndRef} />
              </div>
            </div>
          )
        )}

        {activeTab === "suggestions" && (
          <div className="flex-1 overflow-y-auto px-5 py-6 lg:px-6">
            <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
              <SuggestionsPanel suggestions={suggestions} onSuggestionClick={onExecuteSuggestion} />
            </div>
          </div>
        )}
      </div>

      {/* Bottom Composer */}
      <div className="w-full overflow-visible bg-[#000000] px-[28px] pb-[28px]">
        <div className="flex w-full items-center gap-[18px]">
          <div className="flex h-[58px] flex-1 min-w-0 items-center overflow-hidden rounded-full border border-[rgba(255,255,255,0.18)] bg-[rgba(255,255,255,0.025)] pl-[26px] pr-[22px]">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Ask anything..."
              className="flex-1 resize-none overflow-hidden bg-transparent text-[16px] font-normal leading-[20px] text-white outline-none placeholder:text-[rgba(255,255,255,0.62)] placeholder:truncate placeholder:whitespace-nowrap"
              disabled={isLoading}
              rows={1} // Set rows to 1 to prevent initial vertical resizing
              style={{ maxHeight: '58px' }} // Limit height to prevent excessive growth
            />
          </div>

          <button
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
            className="flex shrink-0 items-center justify-center text-[rgba(255,255,255,0.50)] transition-opacity disabled:opacity-25"
          >
            {isLoading ? (
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="animate-spin">
                <path d="M12 2v4"></path>
                <path d="M12 18v4"></path>
                <path d="M4.93 4.93l2.83 2.83"></path>
                <path d="M16.24 16.24l2.83 2.83"></path>
                <path d="M2 12h4"></path>
                <path d="M18 12h4"></path>
                <path d="M4.93 19.07l2.83-2.83"></path>
                <path d="M16.24 7.76l2.83-2.83"></path>
              </svg>
            ) : (
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"></line>
                <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
              </svg>
            )}
          </button>
        </div>
      </div>

    </aside>
  );
}