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
    <div className="chat-input-shell flex items-center gap-2">
      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyPress={handleKeyPress}
        placeholder="Ask about forecasts, scenarios, budget allocation..."
        className="flex-1 resize-none input-field min-h-[84px] max-h-40 px-5 py-4"
        disabled={isLoading}
      />
      <button
        onClick={handleSend}
        disabled={isLoading || !input.trim()}
        className="chat-send-btn self-center"
      >
        {isLoading ? (
          <Loader size={24} className="animate-spin" />
        ) : (
          <Send size={26} />
        )}
      </button>
    </div>
  );
}

