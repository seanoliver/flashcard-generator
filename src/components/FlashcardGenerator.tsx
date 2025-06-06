'use client';

import { useState } from 'react';
import ConversationDisplay from './ConversationDisplay';
import FlashcardList from './FlashcardList';

interface FlashcardMessage {
  role: 'explainer' | 'critic';
  content: string;
  timestamp: number;
}

interface Flashcard {
  question: string;
  answer: string;
}

interface GenerationResult {
  topic: string;
  conversation: FlashcardMessage[];
  flashcards: Flashcard[];
}

export default function FlashcardGenerator() {
  const [topic, setTopic] = useState('');
  const [rounds, setRounds] = useState(6);
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [streamingData, setStreamingData] = useState<{
    conversation: FlashcardMessage[];
    status: string;
    progress: number;
    activeStreams: Map<string, FlashcardMessage>;
  }>({ conversation: [], status: '', progress: 0, activeStreams: new Map() });

  const handleGenerate = async () => {
    if (!topic.trim()) {
      setError('Please enter a topic');
      return;
    }

    setIsGenerating(true);
    setError(null);
    setResult(null);
    setStreamingData({ conversation: [], status: '', progress: 0, activeStreams: new Map() });

    try {
      console.log('Sending request for topic:', topic, 'rounds:', rounds);
      
      const response = await fetch('/api/generate-flashcards', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ topic, rounds }),
      });

      console.log('Response status:', response.status);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}: Failed to generate flashcards`);
      }

      // Handle streaming response
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('No response body reader available');
      }

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              
              if (data.type === 'status') {
                setStreamingData(prev => ({
                  ...prev,
                  status: data.message,
                  progress: data.progress
                }));
              } else if (data.type === 'message_start') {
                // Add new streaming message
                setStreamingData(prev => {
                  const newActiveStreams = new Map(prev.activeStreams);
                  newActiveStreams.set(data.messageId, data.message);
                  return {
                    ...prev,
                    conversation: [...prev.conversation, data.message],
                    progress: data.progress,
                    activeStreams: newActiveStreams
                  };
                });
              } else if (data.type === 'message_token') {
                // Update streaming content
                setStreamingData(prev => {
                  const newActiveStreams = new Map(prev.activeStreams);
                  const existingMessage = newActiveStreams.get(data.messageId);
                  if (existingMessage) {
                    const updatedMessage = { ...existingMessage, content: data.content };
                    newActiveStreams.set(data.messageId, updatedMessage);
                    
                    // Update conversation array - find by timestamp and role
                    const newConversation = [...prev.conversation];
                    const messageIndex = newConversation.findIndex(msg => 
                      msg.timestamp === existingMessage.timestamp && msg.role === existingMessage.role
                    );
                    if (messageIndex !== -1) {
                      newConversation[messageIndex] = updatedMessage;
                    }
                    
                    return {
                      ...prev,
                      conversation: newConversation,
                      progress: data.progress,
                      activeStreams: newActiveStreams
                    };
                  }
                  return prev;
                });
              } else if (data.type === 'message_complete') {
                // Remove from active streams
                setStreamingData(prev => {
                  const newActiveStreams = new Map(prev.activeStreams);
                  newActiveStreams.delete(data.messageId);
                  return {
                    ...prev,
                    progress: data.progress,
                    activeStreams: newActiveStreams
                  };
                });
              } else if (data.type === 'complete') {
                setResult(data.data);
                setStreamingData(prev => ({ ...prev, progress: 100 }));
              } else if (data.type === 'error') {
                throw new Error(data.error);
              }
            } catch (parseError) {
              console.warn('Failed to parse streaming data:', parseError);
            }
          }
        }
      }
    } catch (err) {
      console.error('Frontend error:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleReset = () => {
    setResult(null);
    setTopic('');
    setError(null);
    setStreamingData({ conversation: [], status: '', progress: 0, activeStreams: new Map() });
  };

  return (
    <div className="max-w-6xl mx-auto">
      {!result ? (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8">
          <div className="max-w-md mx-auto">
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
              Enter a Topic to Study
            </h2>
            
            <div className="space-y-4">
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g., GraphQL, Attachment Theory, SQL Joins..."
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                disabled={isGenerating}
              />
              
              <div>
                <label htmlFor="rounds" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Conversation Rounds (default: 6)
                </label>
                <input
                  id="rounds"
                  type="number"
                  min="2"
                  max="20"
                  value={rounds}
                  onChange={(e) => setRounds(Math.max(2, Math.min(20, parseInt(e.target.value) || 6)))}
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  disabled={isGenerating}
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  More rounds = deeper analysis but longer generation time
                </p>
              </div>
              
              {error && (
                <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
              )}
              
              <button
                onClick={handleGenerate}
                disabled={isGenerating}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium py-3 px-4 rounded-lg transition-colors duration-200"
              >
                {isGenerating ? 'Generating Flashcards...' : 'Generate Flashcards'}
              </button>
            </div>
            
            {isGenerating && (
              <div className="mt-6">
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mb-4">
                  <div 
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${streamingData.progress}%` }}
                  ></div>
                </div>
                <div className="text-center">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  <p className="mt-2 text-gray-600 dark:text-gray-400 text-sm">
                    {streamingData.status || 'AI experts are discussing your topic...'}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-500">
                    Progress: {streamingData.progress}%
                  </p>
                </div>
                
                {streamingData.conversation.length > 0 && (
                  <div className="mt-6">
                    <h4 className="text-lg font-medium text-gray-900 dark:text-white mb-3">
                      Live Conversation
                    </h4>
                    <ConversationDisplay 
                      conversation={streamingData.conversation} 
                      activeStreams={streamingData.activeStreams}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">
              Results for: {result.topic}
            </h2>
            <button
              onClick={handleReset}
              className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg transition-colors duration-200"
            >
              New Topic
            </button>
          </div>
          
          <div className="grid lg:grid-cols-2 gap-6">
            <ConversationDisplay conversation={result.conversation} />
            <FlashcardList flashcards={result.flashcards} />
          </div>
        </div>
      )}
    </div>
  );
}