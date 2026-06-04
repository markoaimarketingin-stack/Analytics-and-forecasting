import { Bookmark } from 'lucide-react';
import { useState } from 'react';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface MessageListProps {
  messages: Message[];
  isLoading?: boolean;
  onSavePrompt?: (content: string) => void;
}

export default function MessageList({
  messages,
  isLoading,
  onSavePrompt,
}: MessageListProps) {
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  if (messages.length === 0 && !isLoading) {
    return null;
  }

  const handleSave = (messageId: string, content: string) => {
    if (onSavePrompt) {
      onSavePrompt(content);
      setSavedIds((prev) => new Set(prev).add(messageId));
      // Reset the "Saved!" state after 2 seconds
      setTimeout(() => {
        setSavedIds((prev) => {
          const next = new Set(prev);
          next.delete(messageId);
          return next;
        });
      }, 2000);
    }
  };

  return (
    <div className="flex flex-col gap-4 pb-4">
      {messages.map((message) => (
        (() => {
          const visibleContent =
            message.role === 'assistant' && (!message.content || !message.content.trim())
              ? 'I am online and ready to help with forecasts, scenarios, and analytics.'
              : message.content;

          const isSaved = savedIds.has(message.id);

          return (
            <div key={message.id} className="group flex flex-col">
              <div
                className={
                  message.role === 'user'
                    ? 'message-in message-user'
                    : 'message-in message-assistant'
                }
              >
                {visibleContent}
              </div>

              {message.role === 'user' && (
                <div className="mt-1 flex justify-end opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    type="button"
                    className={`flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors ${
                      isSaved
                        ? 'text-emerald-500'
                        : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700'
                    }`}
                    onClick={() => handleSave(message.id, message.content)}
                    disabled={isSaved}
                  >
                    <Bookmark className={`h-3.5 w-3.5 ${isSaved ? 'fill-emerald-500' : ''}`} />
                    {isSaved ? 'Saved!' : 'Save Prompt'}
                  </button>
                </div>
              )}
            </div>
          );
        })()
      ))}

      {isLoading && (
        <div className="max-w-[90%] rounded-[24px] rounded-bl-md border border-gray-200 bg-white px-5 py-4 text-sm text-gray-500 shadow-sm">
          Analytics Supervisor is analyzing...
        </div>
      )}
    </div>
  );
}
