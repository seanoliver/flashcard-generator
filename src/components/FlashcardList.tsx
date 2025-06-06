'use client';

import { useState } from 'react';

interface Flashcard {
  question: string;
  answer: string;
}

interface FlashcardListProps {
  flashcards: Flashcard[];
  isStreaming?: boolean;
}

export default function FlashcardList({ flashcards, isStreaming = false }: FlashcardListProps) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editQuestion, setEditQuestion] = useState('');
  const [editAnswer, setEditAnswer] = useState('');

  const handleEdit = (index: number) => {
    setEditingIndex(index);
    setEditQuestion(flashcards[index].question);
    setEditAnswer(flashcards[index].answer);
  };

  const handleSave = () => {
    // For now, just cancel editing since we're in streaming mode
    setEditingIndex(null);
  };

  const handleCancel = () => {
    setEditingIndex(null);
    setEditQuestion('');
    setEditAnswer('');
  };

  const handleDelete = (index: number) => {
    // Disable deletion during streaming
    if (!isStreaming) {
      // Could implement deletion logic here for final results
      console.log('Delete card:', index);
    }
  };

  const handleExport = async (format: 'json' | 'csv') => {
    try {
      const response = await fetch('/api/export-flashcards', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ flashcards, format }),
      });

      if (!response.ok) {
        throw new Error('Export failed');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `flashcards.${format}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export error:', error);
      alert('Failed to export flashcards');
    }
  };

  return (
    <div className="h-full flex flex-col">
      {!isStreaming && flashcards.length > 0 && (
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <div className="flex gap-2">
            <button
              onClick={() => handleExport('json')}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded text-sm transition-colors duration-200"
            >
              Export JSON
            </button>
            <button
              onClick={() => handleExport('csv')}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded text-sm transition-colors duration-200"
            >
              Export CSV
            </button>
          </div>
        </div>
      )}
      
      <div className="flex-1 overflow-y-auto p-4">
        {flashcards.length > 0 ? (
          <div className="space-y-3">
            {flashcards.map((card, index) => (
              <div
                key={index}
                className="border border-gray-200 dark:border-gray-600 rounded-lg p-3"
              >
                {editingIndex === index ? (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Question:
                      </label>
                      <textarea
                        value={editQuestion}
                        onChange={(e) => setEditQuestion(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                        rows={2}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Answer:
                      </label>
                      <textarea
                        value={editAnswer}
                        onChange={(e) => setEditAnswer(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                        rows={3}
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={handleSave}
                        className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-sm transition-colors duration-200"
                      >
                        Save
                      </button>
                      <button
                        onClick={handleCancel}
                        className="bg-gray-600 hover:bg-gray-700 text-white px-3 py-1 rounded text-sm transition-colors duration-200"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="mb-2">
                      <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Q:</span>
                      <p className="text-gray-900 dark:text-white text-sm mt-1">{card.question}</p>
                    </div>
                    <div className="mb-3">
                      <span className="text-xs font-medium text-gray-700 dark:text-gray-300">A:</span>
                      <p className="text-gray-900 dark:text-white text-sm mt-1">{card.answer}</p>
                    </div>
                    {!isStreaming && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEdit(index)}
                          className="bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded text-xs transition-colors duration-200"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(index)}
                          className="bg-red-600 hover:bg-red-700 text-white px-2 py-1 rounded text-xs transition-colors duration-200"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-500 dark:text-gray-400 text-center text-sm px-4">
              {isStreaming ? 'Flashcards will appear here as they are created...' : 'No flashcards generated yet'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}