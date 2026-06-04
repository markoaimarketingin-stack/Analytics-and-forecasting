import { Bookmark, Edit, MoreVertical } from 'lucide-react';
import { useState, useEffect } from 'react';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface MessageListProps {
  messages: Message[];
  isLoading?: boolean;
  onSavePrompt?: (content: string) => void;
  onEditPrompt?: (content: string) => void;
}

export default function MessageList({
  messages,
  isLoading,
  onSavePrompt,
  onEditPrompt,
}: MessageListProps) {
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [activeDropdownId, setActiveDropdownId] = useState<string | null>(null);

  useEffect(() => {
    const handleGlobalClick = () => {
      setActiveDropdownId(null);
    };
    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, []);

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
                <div className="mt-1 flex justify-end relative">
                  <button
                    type="button"
                    className="flex items-center justify-center rounded-lg p-1 text-zinc-500 hover:bg-zinc-900 hover:text-white transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveDropdownId(activeDropdownId === message.id ? null : message.id);
                    }}
                    aria-label="Prompt options"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </button>

                  {activeDropdownId === message.id && (
                    <div className="absolute right-0 top-7 z-20 w-36 rounded-xl border border-zinc-800 bg-zinc-950 p-1.5 shadow-xl">
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs text-zinc-300 hover:bg-zinc-900 hover:text-white transition-colors"
                        onClick={() => {
                          if (onEditPrompt) onEditPrompt(message.content);
                          setActiveDropdownId(null);
                        }}
                      >
                        <Edit className="h-3.5 w-3.5" />
                        Edit Prompt
                      </button>
                      <button
                        type="button"
                        disabled={isSaved}
                        className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors ${
                          isSaved
                            ? 'text-emerald-500 cursor-default'
                            : 'text-zinc-300 hover:bg-zinc-900 hover:text-white'
                        }`}
                        onClick={() => {
                          handleSave(message.id, message.content);
                          setActiveDropdownId(null);
                        }}
                      >
                        <Bookmark className={`h-3.5 w-3.5 ${isSaved ? 'fill-emerald-500' : ''}`} />
                        {isSaved ? 'Saved!' : 'Save Prompt'}
                      </button>
                    </div>
                  )}
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
