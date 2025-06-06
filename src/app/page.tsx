'use client';

import FlashcardGenerator from '@/components/FlashcardGenerator';

export default function Home() {
  return (
    <div className="h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex flex-col">
      <header className="flex-shrink-0 text-center py-6 px-4">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-1">
          AI Flashcard Generator
        </h1>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Two AI experts collaborate to create comprehensive study flashcards
        </p>
      </header>
      
      <div className="flex-1 overflow-hidden">
        <FlashcardGenerator />
      </div>
    </div>
  );
}
