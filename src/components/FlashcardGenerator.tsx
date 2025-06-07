'use client';

import { useState } from 'react';
import ConversationDisplay from './ConversationDisplay';
import FlashcardList from './FlashcardList';

interface FlashcardMessage {
  role: 'moderator' | 'cardsmith' | 'explainer' | 'challenger' | 'beginner' | 'engineer' | 'coach' | 'historian' | 'contrarian' | 'refiner';
  content: string;
  timestamp: number;
  speaker: string;
}

interface Flashcard {
  question: string;
  answer: string;
  tags?: string[];
  notes?: string;
  id?: string;
}

interface RoundProgress {
  currentRound: number;
  totalRounds: number;
  passesRemaining: number;
}

interface ExpertContribution {
  [expertName: string]: number;
}

interface GenerationResult {
  topic: string;
  conversation: FlashcardMessage[];
  flashcards: Flashcard[];
}

export default function FlashcardGenerator() {
  const [topic, setTopic] = useState('');
  const [config, setConfig] = useState({
    NUM_ROUNDS: 5,
    MAX_EXPERT_PASSES: 5,
    INCLUDE_PERSONAS: ['explainer', 'challenger', 'beginner', 'engineer', 'coach', 'historian', 'contrarian', 'refiner'],
    INCLUDE_TRANSCRIPT: true
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [streamingData, setStreamingData] = useState<{
    conversation: FlashcardMessage[];
    status: string;
    progress: number;
    activeStreams: Map<string, FlashcardMessage>;
    currentFlashcards: Flashcard[];
    roundProgress: RoundProgress | null;
    expertContributions: ExpertContribution;
  }>({
    conversation: [],
    status: '',
    progress: 0,
    activeStreams: new Map(),
    currentFlashcards: [],
    roundProgress: null,
    expertContributions: {}
  });

  const handleGenerate = async () => {
    if (!topic.trim()) {
      setError('Please enter a topic');
      return;
    }

    setIsGenerating(true);
    setError(null);
    setResult(null);
    setStreamingData({
      conversation: [],
      status: '',
      progress: 0,
      activeStreams: new Map(),
      currentFlashcards: [],
      roundProgress: null,
      expertContributions: {}
    });

    try {
      console.log('Sending request for topic:', topic, 'config:', config);

      const response = await fetch('/api/generate-flashcards', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ topic, config }),
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
              } else if (data.type === 'flashcards_updated') {
                // Update current flashcards state
                setStreamingData(prev => ({
                  ...prev,
                  currentFlashcards: data.flashcards,
                  progress: data.progress
                }));
              } else if (data.type === 'round_progress') {
                // Update round progress and expert contributions
                setStreamingData(prev => ({
                  ...prev,
                  roundProgress: data.roundProgress,
                  expertContributions: data.expertContributions,
                  progress: data.progress
                }));
              } else if (data.type === 'complete') {
                setResult(data.data);
                setStreamingData(prev => ({
                  ...prev,
                  progress: 100,
                  // Keep the streaming data for display in final results
                  currentFlashcards: data.data.flashcards,
                  conversation: data.data.conversation
                }));
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
    setStreamingData({
      conversation: [],
      status: '',
      progress: 0,
      activeStreams: new Map(),
      currentFlashcards: [],
      roundProgress: null,
      expertContributions: {}
    });
    setConfig({
      NUM_ROUNDS: 5,
      MAX_EXPERT_PASSES: 5,
      INCLUDE_PERSONAS: ['explainer', 'challenger', 'beginner', 'engineer', 'coach', 'historian', 'contrarian', 'refiner'],
      INCLUDE_TRANSCRIPT: true
    });
  };

  return (
    <div className="h-full flex">
      {/* Input form - only show when not generating and no results */}
      {!isGenerating && !result && (
        <div className="w-full flex items-center justify-center">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 max-w-md w-full mx-4">
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-6 text-center">
              Enter a Topic to Study
            </h2>

            <div className="space-y-4">
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g., GraphQL, Attachment Theory, SQL Joins..."
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
              />

              <div>
                <label htmlFor="rounds" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Panel Rounds (default: 5)
                </label>
                <input
                  id="rounds"
                  type="number"
                  min="2"
                  max="15"
                  value={config.NUM_ROUNDS}
                  onChange={(e) => setConfig(prev => ({...prev, NUM_ROUNDS: Math.max(2, Math.min(15, parseInt(e.target.value) || 5))}))}
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Each round allows expert panel discussion and collaboration
                </p>
              </div>

              <div>
                <label htmlFor="max-passes" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Max Expert Handoffs (default: 5)
                </label>
                <input
                  id="max-passes"
                  type="number"
                  min="1"
                  max="10"
                  value={config.MAX_EXPERT_PASSES}
                  onChange={(e) => setConfig(prev => ({...prev, MAX_EXPERT_PASSES: Math.max(1, Math.min(10, parseInt(e.target.value) || 5))}))}
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  How many times experts can pass to each other per round
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Expert Panel Members
                </label>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {[
                    { id: 'explainer', name: 'Explainer' },
                    { id: 'challenger', name: 'Challenger' },
                    { id: 'beginner', name: 'Beginner' },
                    { id: 'engineer', name: 'Engineer' },
                    { id: 'coach', name: 'Coach' },
                    { id: 'historian', name: 'Historian' },
                    { id: 'contrarian', name: 'Contrarian' },
                    { id: 'refiner', name: 'Refiner' }
                  ].map(expert => (
                    <label key={expert.id} className="flex items-center gap-2 p-2 rounded border border-gray-200 dark:border-gray-600">
                      <input
                        type="checkbox"
                        checked={config.INCLUDE_PERSONAS.includes(expert.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setConfig(prev => ({
                              ...prev,
                              INCLUDE_PERSONAS: [...prev.INCLUDE_PERSONAS, expert.id]
                            }));
                          } else {
                            setConfig(prev => ({
                              ...prev,
                              INCLUDE_PERSONAS: prev.INCLUDE_PERSONAS.filter(p => p !== expert.id)
                            }));
                          }
                        }}
                        className="rounded"
                      />
                      <span className="text-gray-700 dark:text-gray-300">{expert.name}</span>
                    </label>
                  ))}
                </div>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Select which expert perspectives to include in the panel
                </p>
              </div>

              {error && (
                <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
              )}

              <button
                onClick={handleGenerate}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-lg transition-colors duration-200"
              >
                Generate Flashcards
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Generation in progress or results view */}
      {(isGenerating || result || streamingData.conversation.length > 0) && (
        <>
          {/* Desktop layout */}
          <div className="hidden lg:flex h-full">
            {/* Left sidebar - Flashcards */}
            <div className="w-80 flex-shrink-0 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col">
              <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Flashcards ({(result?.flashcards || streamingData.currentFlashcards).length})
                  </h3>
                  <button
                    onClick={handleReset}
                    className="text-sm bg-gray-600 hover:bg-gray-700 text-white px-3 py-1 rounded transition-colors duration-200"
                  >
                    New Topic
                  </button>
                </div>
                {result && (
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 truncate">
                    {result.topic}
                  </p>
                )}
              </div>

              <div className="flex-1 overflow-hidden">
                <FlashcardList
                  flashcards={result?.flashcards || streamingData.currentFlashcards}
                  isStreaming={isGenerating}
                />
              </div>
            </div>

            {/* Right side - Chat area */}
            <div className="flex-1 flex flex-col">
              {/* Header with progress */}
              <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex-shrink-0">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Expert Panel Discussion
                  </h3>
                  {isGenerating && (
                    <div className="flex items-center gap-3">
                      <div className="w-32 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                        <div
                          className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${streamingData.progress}%` }}
                        ></div>
                      </div>
                      <span className="text-sm text-gray-600 dark:text-gray-400 min-w-0">
                        {streamingData.progress}%
                      </span>
                    </div>
                  )}
                </div>

                {isGenerating && (
                  <div className="mt-2 flex items-center gap-2">
                    <div className="w-3 h-3 bg-blue-600 rounded-full animate-pulse"></div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {streamingData.status || 'Expert panel is collaborating...'}
                    </p>
                  </div>
                )}
              </div>

              {/* Chat content */}
              <div className="flex-1 overflow-hidden bg-gray-50 dark:bg-gray-900">
                <ConversationDisplay
                  conversation={result?.conversation || streamingData.conversation}
                  activeStreams={isGenerating ? streamingData.activeStreams : undefined}
                  roundProgress={streamingData.roundProgress}
                  expertContributions={streamingData.expertContributions}
                />
              </div>
            </div>
          </div>

          {/* Mobile layout */}
          <div className="lg:hidden h-full flex flex-col">
            {/* Mobile header */}
            <div className="p-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {isGenerating ? 'Generating...' : (result?.topic || 'Results')}
                </h3>
                <button
                  onClick={handleReset}
                  className="text-sm bg-gray-600 hover:bg-gray-700 text-white px-3 py-1 rounded transition-colors duration-200"
                >
                  New Topic
                </button>
              </div>

              {isGenerating && (
                <div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mb-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${streamingData.progress}%` }}
                    ></div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-blue-600 rounded-full animate-pulse"></div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {streamingData.status || 'Expert panel is collaborating...'}
                    </p>
                    <span className="text-sm text-gray-600 dark:text-gray-400 ml-auto">
                      {streamingData.progress}%
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Mobile content - stacked vertically */}
            <div className="flex-1 flex flex-col">
              {/* Flashcards section */}
              <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                <div className="p-3 border-b border-gray-200 dark:border-gray-700">
                  <h4 className="font-medium text-gray-900 dark:text-white">
                    Flashcards ({(result?.flashcards || streamingData.currentFlashcards).length})
                  </h4>
                </div>
                <div className="max-h-64 overflow-y-auto">
                  <FlashcardList
                    flashcards={result?.flashcards || streamingData.currentFlashcards}
                    isStreaming={isGenerating}
                  />
                </div>
              </div>

              {/* Chat section */}
              <div className="flex-1 bg-gray-50 dark:bg-gray-900 flex flex-col">
                <div className="p-3 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                  <h4 className="font-medium text-gray-900 dark:text-white">
                    Expert Panel Discussion
                  </h4>
                </div>
                <div className="flex-1 overflow-hidden">
                  <ConversationDisplay
                    conversation={result?.conversation || streamingData.conversation}
                    activeStreams={isGenerating ? streamingData.activeStreams : undefined}
                    roundProgress={streamingData.roundProgress}
                    expertContributions={streamingData.expertContributions}
                  />
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}