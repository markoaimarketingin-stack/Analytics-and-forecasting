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
              ? 'message-in message-user'
              : 'message-in message-assistant'
          }
        >
          {visibleContent}
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
