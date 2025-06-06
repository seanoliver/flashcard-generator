'use client';

interface FlashcardMessage {
  role: 'explainer' | 'critic';
  content: string;
  timestamp: number;
}

interface ConversationDisplayProps {
  conversation: FlashcardMessage[];
}

export default function ConversationDisplay({ conversation }: ConversationDisplayProps) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
      <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
        AI Expert Conversation
      </h3>
      
      <div className="space-y-4 max-h-96 overflow-y-auto">
        {conversation.map((message, index) => (
          <div
            key={index}
            className={`p-4 rounded-lg ${
              message.role === 'explainer'
                ? 'bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500'
                : 'bg-amber-50 dark:bg-amber-900/20 border-l-4 border-amber-500'
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              <span
                className={`px-2 py-1 rounded text-xs font-medium ${
                  message.role === 'explainer'
                    ? 'bg-blue-100 dark:bg-blue-800 text-blue-800 dark:text-blue-200'
                    : 'bg-amber-100 dark:bg-amber-800 text-amber-800 dark:text-amber-200'
                }`}
              >
                {message.role === 'explainer' ? 'Expert Explainer' : 'Critical Reviewer'}
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {new Date(message.timestamp).toLocaleTimeString()}
              </span>
            </div>
            <p className="text-gray-700 dark:text-gray-300 text-sm whitespace-pre-wrap">
              {message.content}
            </p>
          </div>
        ))}
      </div>
      
      {conversation.length === 0 && (
        <p className="text-gray-500 dark:text-gray-400 text-center py-8">
          No conversation yet
        </p>
      )}
    </div>
  );
}