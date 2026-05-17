interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface MessageListProps {
  messages: Message[];
  isLoading?: boolean;
}

export default function MessageList({
  messages,
  isLoading,
}: MessageListProps) {
  if (messages.length === 0 && !isLoading) {
    return null;
  }

  return (
    <div className="flex flex-col gap-4 pb-4">
      {messages.map((message) => (
        // Guard against empty backend replies in production so the bubble is never blank.
        // This is a UI-level safety net; backend still attempts to send meaningful content.
        (() => {
          const visibleContent =
            message.role === 'assistant' && (!message.content || !message.content.trim())
              ? 'I am online and ready to help with forecasts, scenarios, and analytics.'
              : message.content;

          return (
        <div
          key={message.id}
          className={
            message.role === 'user'
              ? 'message-in ml-auto max-w-[85%] rounded-[24px] rounded-br-md bg-zinc-800 px-5 py-4 text-sm leading-7 text-white shadow-sm'
              : 'message-in max-w-[90%] rounded-[24px] rounded-bl-md border border-zinc-800 bg-zinc-900 px-5 py-4 text-sm leading-7 text-zinc-300 shadow-sm'
          }
        >
          {visibleContent}
        </div>
          );
        })()
      ))}

      {isLoading && (
        <div className="max-w-[90%] rounded-[24px] rounded-bl-md border border-zinc-800 bg-zinc-900 px-5 py-4 text-sm text-zinc-400 shadow-sm">
          Analytics Supervisor is analyzing...
        </div>
      )}
    </div>
  );
}