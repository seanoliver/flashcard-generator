'use client';

import { useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';

interface FlashcardMessage {
  role: 'moderator' | 'cardsmith' | 'explainer' | 'challenger' | 'beginner' | 'engineer' | 'coach' | 'historian' | 'contrarian' | 'refiner';
  content: string;
  timestamp: number;
  speaker: string;
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

          // Color coding for different agent roles
          const getMessageStyling = (role: string) => {
            switch (role) {
              case 'moderator':
                return {
                  bg: 'bg-gray-50 dark:bg-gray-900/20 border-l-4 border-gray-600',
                  badge: 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200'
                };
              case 'cardsmith':
                return {
                  bg: 'bg-purple-50 dark:bg-purple-900/20 border-l-4 border-purple-500',
                  badge: 'bg-purple-100 dark:bg-purple-800 text-purple-800 dark:text-purple-200'
                };
              case 'explainer':
                return {
                  bg: 'bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500',
                  badge: 'bg-blue-100 dark:bg-blue-800 text-blue-800 dark:text-blue-200'
                };
              case 'challenger':
                return {
                  bg: 'bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500',
                  badge: 'bg-red-100 dark:bg-red-800 text-red-800 dark:text-red-200'
                };
              case 'beginner':
                return {
                  bg: 'bg-emerald-50 dark:bg-emerald-900/20 border-l-4 border-emerald-500',
                  badge: 'bg-emerald-100 dark:bg-emerald-800 text-emerald-800 dark:text-emerald-200'
                };
              case 'engineer':
                return {
                  bg: 'bg-teal-50 dark:bg-teal-900/20 border-l-4 border-teal-500',
                  badge: 'bg-teal-100 dark:bg-teal-800 text-teal-800 dark:text-teal-200'
                };
              case 'coach':
                return {
                  bg: 'bg-orange-50 dark:bg-orange-900/20 border-l-4 border-orange-500',
                  badge: 'bg-orange-100 dark:bg-orange-800 text-orange-800 dark:text-orange-200'
                };
              case 'historian':
                return {
                  bg: 'bg-amber-50 dark:bg-amber-900/20 border-l-4 border-amber-500',
                  badge: 'bg-amber-100 dark:bg-amber-800 text-amber-800 dark:text-amber-200'
                };
              case 'contrarian':
                return {
                  bg: 'bg-rose-50 dark:bg-rose-900/20 border-l-4 border-rose-500',
                  badge: 'bg-rose-100 dark:bg-rose-800 text-rose-800 dark:text-rose-200'
                };
              case 'refiner':
                return {
                  bg: 'bg-indigo-50 dark:bg-indigo-900/20 border-l-4 border-indigo-500',
                  badge: 'bg-indigo-100 dark:bg-indigo-800 text-indigo-800 dark:text-indigo-200'
                };
              default:
                return {
                  bg: 'bg-gray-50 dark:bg-gray-900/20 border-l-4 border-gray-500',
                  badge: 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200'
                };
            }
          };

          const styling = getMessageStyling(message.role);
          
          return (
            <div
              key={`${message.role}-${message.timestamp}-${index}`}
              className={`p-4 rounded-lg ${styling.bg}`}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className={`px-2 py-1 rounded text-xs font-medium ${styling.badge}`}>
                  {message.speaker || message.role}
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
              <div className="text-gray-700 dark:text-gray-300 text-sm">
                <ReactMarkdown
                  components={{
                    // Customize markdown elements for better styling
                    p: ({ children }) => <p className="mb-3 last:mb-0 leading-relaxed">{children}</p>,
                    ul: ({ children }) => <ul className="mb-3 pl-4 list-disc space-y-1">{children}</ul>,
                    ol: ({ children }) => <ol className="mb-3 pl-4 list-decimal space-y-1">{children}</ol>,
                    li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                    strong: ({ children }) => <strong className="font-semibold text-gray-900 dark:text-white">{children}</strong>,
                    em: ({ children }) => <em className="italic">{children}</em>,
                    code: ({ children }) => <code className="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-xs font-mono text-gray-800 dark:text-gray-200">{children}</code>,
                    pre: ({ children }) => <pre className="bg-gray-100 dark:bg-gray-700 p-3 rounded text-xs font-mono overflow-x-auto mb-3 border">{children}</pre>,
                    h1: ({ children }) => <h1 className="text-lg font-bold mb-3 text-gray-900 dark:text-white">{children}</h1>,
                    h2: ({ children }) => <h2 className="text-base font-bold mb-2 text-gray-900 dark:text-white">{children}</h2>,
                    h3: ({ children }) => <h3 className="text-sm font-bold mb-2 text-gray-900 dark:text-white">{children}</h3>,
                    blockquote: ({ children }) => <blockquote className="border-l-4 border-gray-300 dark:border-gray-600 pl-4 italic mb-3">{children}</blockquote>,
                    a: ({ href, children }) => <a href={href} className="text-blue-600 dark:text-blue-400 hover:underline" target="_blank" rel="noopener noreferrer">{children}</a>,
                  }}
                >
                  {/* Filter out JSON blocks from conversation display */}
                  {message.content.split('```json')[0].trim()}
                </ReactMarkdown>
                {isStreaming && (
                  <span className="inline-block w-2 h-4 bg-gray-400 ml-1 animate-pulse"></span>
                )}
              </div>
            </div>
          );
        })}
        
        {conversation.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-500 dark:text-gray-400 text-center">
              Panel discussion will appear here as experts collaborate on your flashcards...
            </p>
          </div>
        )}
      </div>
    </div>
  );
}