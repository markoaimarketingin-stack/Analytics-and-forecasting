import { Send, Loader } from 'lucide-react';
import { useState } from 'react';

interface ChatInputProps {
  onSend: (message: string) => void;
  isLoading: boolean;
}

export default function ChatInput({ onSend, isLoading }: ChatInputProps) {
  const [input, setInput] = useState('');

  const handleSend = () => {
    if (input.trim()) {
      onSend(input);
      setInput('');
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex items-center gap-[20px] w-full">
      {/* Input Pill */}
      <div className="flex-1 flex items-center h-[64px] rounded-[28px] border border-[rgba(255,255,255,0.14)] bg-[#050505] pl-[24px] pr-[24px]">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Ask about forecasts, scenarios, budget allocation..."
          className="w-full bg-transparent text-sm text-white placeholder-zinc-500 outline-none"
          disabled={isLoading}
        />
      </div>

      {/* Send Icon */}
      <button
        onClick={handleSend}
        disabled={isLoading || !input.trim()}
        className="flex-shrink-0 text-[rgba(255,255,255,0.45)] hover:text-white transition-colors disabled:opacity-30"
      >
        {isLoading ? (
          <Loader size={28} className="animate-spin" />
        ) : (
          <Send size={28} />
        )}
      </button>
    </div>
  );
}
