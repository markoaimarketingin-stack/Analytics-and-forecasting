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
        <div
          key={message.id}
          className={
            message.role === 'user'
              ? 'ml-auto max-w-[85%] rounded-[24px] rounded-br-md bg-blue-600 px-5 py-4 text-sm leading-7 text-white shadow-sm'
              : 'max-w-[90%] rounded-[24px] rounded-bl-md border border-gray-200 bg-white px-5 py-4 text-sm leading-7 text-gray-800 shadow-sm'
          }
        >
          {message.content}
        </div>
      ))}

      {isLoading && (
        <div className="max-w-[90%] rounded-[24px] rounded-bl-md border border-gray-200 bg-white px-5 py-4 text-sm text-gray-500 shadow-sm">
          Analytics Supervisor is analyzing...
        </div>
      )}
    </div>
  );
}