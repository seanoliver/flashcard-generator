# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

This project uses **pnpm** as the package manager (not npm). Key commands:

- `pnpm dev` - Start development server with Turbopack
- `pnpm build` - Build for production
- `pnpm start` - Start production server
- `pnpm lint` - Run ESLint

## Architecture Overview

### Core Application Flow
This is an AI-powered flashcard generator that uses three distinct AI personalities to collaboratively create and refine flashcards through streaming conversations.

**Three-AI System:**
1. **Dr. Sarah Chen (Generator)** - Creates initial flashcards and focuses on comprehensive coverage
2. **Dr. Marcus Rodriguez (Memory Expert)** - Optimizes for memorability and learning effectiveness  
3. **Dr. Elena Vasquez (Subject Expert)** - Ensures accuracy and identifies coverage gaps

### Key Components

**API Route (`src/app/api/generate-flashcards/route.ts`)**
- Implements Server-Sent Events (SSE) streaming
- Manages three separate OpenAI conversation threads with distinct system prompts
- Uses JSON operations system for flashcard modifications (`add`, `edit`, `delete`)
- Applies focused context sharing (shows only last 8 cards with IDs)

**Frontend State Management (`src/components/FlashcardGenerator.tsx`)**
- Handles real-time streaming data from SSE
- Manages conversation state, flashcard updates, and streaming progress
- Implements responsive layout (desktop: sidebar + chat, mobile: stacked)

**Conversation Display (`src/components/ConversationDisplay.tsx`)**
- Real-time markdown rendering with react-markdown
- Auto-scroll during streaming
- Filters out JSON blocks from conversation display
- Color-coded messages by AI role

### Critical Design Patterns

**Streaming Architecture:**
- Token-level streaming for real-time text display
- SSE format: `data: ${JSON.stringify(data)}\n\n`
- Multiple message types: `message_start`, `message_token`, `message_complete`, `flashcards_updated`

**AI Conversation Rules:**
- Each AI focuses on 2-3 specific cards per turn (not comprehensive listings)
- Explicit rules prevent redundant definitions (never repeat term in answer)
- Continuous addition of new cards alongside editing existing ones
- Context limited to recent cards to maintain focus

**Flashcard Operations System:**
```typescript
interface FlashcardOperation {
  type: 'add' | 'edit' | 'delete';
  flashcard?: Flashcard;
  flashcard_id?: string;
  reason?: string;
}
```

## Environment Setup

Required environment variable:
- `OPENAI_API_KEY` - OpenAI API key for GPT-4o-mini model

## Key Technical Details

- Uses Next.js 15 with App Router and Turbopack
- Tailwind CSS v4 for styling
- TypeScript with strict type checking
- React 19 with concurrent features for streaming
- OpenAI API v5 with streaming support

The application is designed for real-time collaborative AI conversations that produce high-quality, focused flashcards through iterative improvement cycles.