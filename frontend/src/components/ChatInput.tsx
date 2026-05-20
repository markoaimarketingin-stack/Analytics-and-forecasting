import React, { useState } from 'react';
import { Paperclip, ArrowRight, Loader } from 'lucide-react';

interface ChatInputProps {
  onSend: (message: string) => void;
  isLoading: boolean;
  onManageModels?: () => void;
}

export default function ChatInput({ onSend, isLoading, onManageModels }: ChatInputProps) {
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<'ask' | 'agent'>('ask');
  const [model, setModel] = useState<string>('marko-2.0-mini');

  const handleSend = () => {
    if (input.trim()) {
      onSend(input);
      setInput('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleModelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val === 'manage') {
      if (onManageModels) {
        onManageModels();
      }
      // Reset select back to marko-2.0-mini so it doesn't stay selected
      setModel('marko-2.0-mini');
    } else {
      setModel(val);
    }
  };

  return (
    <div className="chat-input-shell-dark">
      {/* Top context helper row */}
      <div className="chat-input-paperclip-row">
        <button type="button" className="chat-input-paperclip-btn" title="Add context">
          <Paperclip className="h-3.5 w-3.5" />
        </button>
        <span className="text-[11px] tracking-wide text-zinc-500 font-medium">
          Add context (#), extensions (@), commands (/)
        </span>
      </div>

      {/* Text input area */}
      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Ask or instruct the assistant..."
        className="chat-textarea-dark"
        disabled={isLoading}
      />

      {/* Bottom controls row */}
      <div className="chat-input-bottom-row flex items-center gap-2 w-full">
        {/* Mode Selector */}
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as 'ask' | 'agent')}
          className="chat-dropdown-rect text-xs font-semibold"
          disabled={isLoading}
        >
          <option value="ask">Ask</option>
          <option value="agent">Agent</option>
        </select>

        {/* Model Selector */}
        <select
          value={model}
          onChange={handleModelChange}
          className="chat-dropdown-rect text-xs font-semibold flex-1 min-w-0"
          disabled={isLoading}
        >
          <option value="marko-2.0-mini">marko-2.0-mini</option>
          <option value="manage">Manage models</option>
        </select>

        {/* Circular Send Button */}
        <button
          onClick={handleSend}
          disabled={isLoading || !input.trim()}
          className="chat-send-btn-circle flex-shrink-0"
          title="Send message"
        >
          {isLoading ? (
            <Loader size={14} className="animate-spin" />
          ) : (
            <ArrowRight size={14} />
          )}
        </button>
      </div>
    </div>
  );
}
