import React, { useState } from 'react';
import { Paperclip, ArrowRight, Square } from 'lucide-react';

interface ChatInputProps {
  onSend: (message: string, mode: 'ask' | 'agent') => void;
  onCancel: () => void;
  isLoading: boolean;
  mode: 'ask' | 'agent';
  onModeChange: (mode: 'ask' | 'agent') => void;
  onManageModels?: () => void;
}

export default function ChatInput({
  onSend,
  onCancel,
  isLoading,
  mode,
  onModeChange,
  onManageModels,
}: ChatInputProps) {
  const [input, setInput] = useState('');
  const [model, setModel] = useState<string>('marko-2.0-mini');

  const handleSend = () => {
    if (input.trim()) {
      onSend(input, mode);
      setInput('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (isLoading) {
        onCancel();
      } else {
        handleSend();
      }
    }
    if (e.key === 'Escape' && isLoading) {
      onCancel();
    }
  };

  const handleModeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onModeChange(e.target.value as 'ask' | 'agent');
  };

  const handleModelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val === 'manage') {
      if (onManageModels) {
        onManageModels();
      }
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
        placeholder={
          mode === 'ask'
            ? 'Ask anything about your data...'
            : 'Instruct agents to run analysis or optimizations...'
        }
        className="chat-textarea-dark"
      />

      {/* Bottom controls row */}
      <div className="chat-input-bottom-row flex items-center gap-2 w-full">

        {/* Mode Selector — same style as model selector */}
        <select
          id="chat-mode-select"
          value={mode}
          onChange={handleModeChange}
          className="chat-dropdown-rect text-xs font-semibold"
          disabled={isLoading}
          title="Switch between Ask (Q&A) and Agent (orchestration) mode"
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

        {/* Send / Cancel button */}
        {isLoading ? (
          <button
            id="chat-cancel-btn"
            onClick={onCancel}
            className="chat-send-btn-circle chat-cancel-btn flex-shrink-0"
            title="Cancel generation (Esc)"
            aria-label="Stop generating"
          >
            <Square size={12} fill="currentColor" />
          </button>
        ) : (
          <button
            id="chat-send-btn"
            onClick={handleSend}
            disabled={!input.trim()}
            className="chat-send-btn-circle flex-shrink-0"
            title="Send message (Enter)"
            aria-label="Send message"
          >
            <ArrowRight size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
