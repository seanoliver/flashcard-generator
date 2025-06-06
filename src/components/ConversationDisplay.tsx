'use client';

import { useEffect, useRef } from 'react';

interface FlashcardMessage {
  role: 'explainer' | 'critic';
  content: string;
  timestamp: number;
}

interface ConversationDisplayProps {
  conversation: FlashcardMessage[];
  activeStreams?: Map<string, FlashcardMessage>;
}

export default function ConversationDisplay({ conversation, activeStreams }: ConversationDisplayProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isStreamingRef = useRef(false);

  // Auto-scroll to bottom when new content arrives
  useEffect(() => {
    if (scrollRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
      
      // Auto-scroll if user is near bottom or if actively streaming
      if (isNearBottom || isStreamingRef.current || (activeStreams && activeStreams.size > 0)) {
        scrollRef.current.scrollTop = scrollHeight;
      }
    }
  }, [conversation, activeStreams]);

  // Track if we're actively streaming
  useEffect(() => {
    isStreamingRef.current = activeStreams ? activeStreams.size > 0 : false;
  }, [activeStreams]);
  return (
    <div className="h-full flex flex-col">
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-4">
        {conversation.map((message, index) => {
          const isStreaming = activeStreams && Array.from(activeStreams.values()).some(
            streamMsg => streamMsg.timestamp === message.timestamp && streamMsg.role === message.role
          );
          
          return (
            <div
              key={`${message.role}-${message.timestamp}-${index}`}
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
                {isStreaming && (
                  <span className="inline-flex items-center">
                    <span className="animate-pulse w-2 h-2 bg-green-500 rounded-full"></span>
                  </span>
                )}
              </div>
              <p className="text-gray-700 dark:text-gray-300 text-sm whitespace-pre-wrap">
                {message.content}
                {isStreaming && (
                  <span className="inline-block w-2 h-4 bg-gray-400 ml-1 animate-pulse"></span>
                )}
              </p>
            </div>
          );
        })}
        
        {conversation.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-500 dark:text-gray-400 text-center">
              Conversation will appear here as AI experts discuss your flashcards...
            </p>
          </div>
        )}
      </div>
    </div>
  );
}