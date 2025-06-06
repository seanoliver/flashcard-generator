import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const MAX_TOKENS = 2000;

interface FlashcardMessage {
  role: 'explainer' | 'critic';
  content: string;
  timestamp: number;
}

interface Flashcard {
  question: string;
  answer: string;
}

export async function POST(request: NextRequest) {
  console.log('API route called');

  try {
    const { topic, rounds = 6 } = await request.json();
    console.log('Received topic:', topic, 'Rounds:', rounds);

    if (!topic) {
      return NextResponse.json({ error: 'Topic is required' }, { status: 400 });
    }

    if (!process.env.OPENAI_API_KEY) {
      console.error('OpenAI API key not found');
      return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 });
    }

    // Create a readable stream for Server-Sent Events
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const sendUpdate = (data: any) => {
          const message = `data: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(message));
        };

        try {
          const conversation: FlashcardMessage[] = [];
          let currentFlashcards: Flashcard[] = [];

          // System prompts for the two agents focused on flashcard iteration
          const explainerPrompt = `You are an Expert Explainer creating study flashcards. Your role is to:

1. REVIEW the current flashcard set (if any)
2. ANALYZE the topic for comprehensive coverage
3. PROPOSE specific improvements: new cards, better questions, clearer answers
4. FOCUS on educational effectiveness and clarity

Your response should:
- Comment on the current flashcard set's strengths/gaps
- Suggest specific improvements with clear reasoning
- Propose new flashcards for missing concepts

Format NEW/UPDATED flashcards as:
FLASHCARD: Q: [question] | A: [answer]

Format DELETIONS as:
DELETE: [question to remove]`;

          const criticPrompt = `You are a Critical Reviewer evaluating study flashcards. Your role is to:

1. EXAMINE each flashcard for accuracy and educational value
2. IDENTIFY problems: unclear questions, incomplete answers, redundancy
3. SUGGEST refinements to make flashcards more effective
4. ENSURE comprehensive topic coverage without overwhelming detail

Your response should:
- Critique specific flashcards with clear reasoning
- Propose improvements or alternatives
- Suggest new cards for gaps you identify

Format NEW/UPDATED flashcards as:
FLASHCARD: Q: [question] | A: [answer]

Format DELETIONS as:
DELETE: [question to remove]`;

          // Helper function to extract flashcard operations from text
          const extractFlashcardOperations = (content: string) => {
            const operations = {
              newCards: [] as Flashcard[],
              deletions: [] as string[]
            };

            // Extract new/updated flashcards
            const flashcardRegex = /FLASHCARD:\s*Q:\s*(.+?)\s*\|\s*A:\s*(.+?)(?=\n|$)/gi;
            let match;
            while ((match = flashcardRegex.exec(content)) !== null) {
              operations.newCards.push({
                question: match[1].trim(),
                answer: match[2].trim(),
              });
            }

            // Extract deletions
            const deleteRegex = /DELETE:\s*(.+?)(?=\n|$)/gi;
            while ((match = deleteRegex.exec(content)) !== null) {
              operations.deletions.push(match[1].trim());
            }

            return operations;
          };

          // Helper function to apply operations to flashcard set
          const applyOperations = (flashcards: Flashcard[], operations: { newCards: Flashcard[], deletions: string[] }) => {
            let updated = [...flashcards];

            // Remove deleted cards
            operations.deletions.forEach(questionToDelete => {
              updated = updated.filter(card =>
                !card.question.toLowerCase().includes(questionToDelete.toLowerCase()) &&
                !questionToDelete.toLowerCase().includes(card.question.toLowerCase())
              );
            });

            // Add new cards (avoiding duplicates)
            operations.newCards.forEach(newCard => {
              const isDuplicate = updated.some(existingCard =>
                existingCard.question.toLowerCase() === newCard.question.toLowerCase()
              );
              if (!isDuplicate) {
                updated.push(newCard);
              }
            });

            return updated;
          };

          // Start the conversation
          let explainerMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
            { role: 'system', content: explainerPrompt },
            { role: 'user', content: `Create initial flashcards for the topic "${topic}". Start with the most fundamental concepts and build a solid foundation for learning this subject.` }
          ];

          let criticMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
            { role: 'system', content: criticPrompt }
          ];

          sendUpdate({ type: 'status', message: 'Starting conversation...', progress: 0 });

          // Conduct conversation based on specified rounds
          for (let turn = 0; turn < rounds; turn++) {
            const progress = Math.round((turn / rounds) * 80); // Reserve 20% for final processing
            sendUpdate({ type: 'status', message: `Turn ${turn + 1}/${rounds}`, progress });

            if (turn % 2 === 0) {
              // Explainer's turn
              sendUpdate({ type: 'status', message: 'Expert Explainer is thinking...', progress });

              // Create message placeholder
              const messageId = `explainer-${turn}`;
              const message: FlashcardMessage = {
                role: 'explainer',
                content: '',
                timestamp: Date.now(),
              };

              conversation.push(message);

              // Send initial message structure
              sendUpdate({
                type: 'message_start',
                messageId,
                message: { ...message },
                progress,
                conversationLength: conversation.length
              });

              const stream = await openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: explainerMessages,
                temperature: 0.7,
                max_tokens: MAX_TOKENS,
                stream: true,
              });

              let content = '';
              for await (const chunk of stream) {
                const delta = chunk.choices[0]?.delta?.content || '';
                content += delta;

                // Update the message in conversation
                const messageIndex = conversation.length - 1;
                conversation[messageIndex].content = content;

                // Send token update
                sendUpdate({
                  type: 'message_token',
                  messageId,
                  token: delta,
                  content,
                  progress
                });
              }

              // Extract and apply flashcard operations
              const operations = extractFlashcardOperations(content);
              currentFlashcards = applyOperations(currentFlashcards, operations);

              // Send updated flashcard state
              sendUpdate({
                type: 'flashcards_updated',
                flashcards: currentFlashcards,
                operations,
                progress
              });

              // Send completion
              sendUpdate({
                type: 'message_complete',
                messageId,
                finalContent: content,
                progress
              });

              explainerMessages.push({ role: 'assistant', content });

              // Prepare critic's context with current flashcard state
              const flashcardSummary = currentFlashcards.length > 0
                ? `\n\nCURRENT FLASHCARDS:\n${currentFlashcards.map((card, i) => `${i+1}. Q: ${card.question} | A: ${card.answer}`).join('\n')}`
                : '\n\nCURRENT FLASHCARDS: (none yet)';

              criticMessages.push({
                role: 'user',
                content: `The Explainer provided this feedback on the flashcards: "${content}"${flashcardSummary}\n\nPlease review the current flashcard set and provide your critique. Focus on accuracy, clarity, and completeness. Suggest specific improvements or new cards.`
              });

            } else {
              // Critic's turn
              sendUpdate({ type: 'status', message: 'Critical Reviewer is analyzing...', progress });

              // Create message placeholder
              const messageId = `critic-${turn}`;
              const message: FlashcardMessage = {
                role: 'critic',
                content: '',
                timestamp: Date.now(),
              };

              conversation.push(message);

              // Send initial message structure
              sendUpdate({
                type: 'message_start',
                messageId,
                message: { ...message },
                progress,
                conversationLength: conversation.length
              });

              const stream = await openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: criticMessages,
                temperature: 0.7,
                max_tokens: MAX_TOKENS,
                stream: true,
              });

              let content = '';
              for await (const chunk of stream) {
                const delta = chunk.choices[0]?.delta?.content || '';
                content += delta;

                // Update the message in conversation
                const messageIndex = conversation.length - 1;
                conversation[messageIndex].content = content;

                // Send token update
                sendUpdate({
                  type: 'message_token',
                  messageId,
                  token: delta,
                  content,
                  progress
                });
              }

              // Extract and apply flashcard operations
              const operations = extractFlashcardOperations(content);
              currentFlashcards = applyOperations(currentFlashcards, operations);

              // Send updated flashcard state
              sendUpdate({
                type: 'flashcards_updated',
                flashcards: currentFlashcards,
                operations,
                progress
              });

              // Send completion
              sendUpdate({
                type: 'message_complete',
                messageId,
                finalContent: content,
                progress
              });

              criticMessages.push({ role: 'assistant', content });

              // Prepare explainer's context with current flashcard state
              const flashcardSummary = currentFlashcards.length > 0
                ? `\n\nCURRENT FLASHCARDS:\n${currentFlashcards.map((card, i) => `${i+1}. Q: ${card.question} | A: ${card.answer}`).join('\n')}`
                : '\n\nCURRENT FLASHCARDS: (none yet)';

              explainerMessages.push({
                role: 'user',
                content: `The Critic provided this feedback: "${content}"${flashcardSummary}\n\nPlease address their suggestions and refine the flashcard set accordingly. Focus on their specific feedback while maintaining educational value.`
              });
            }
          }

          sendUpdate({ type: 'status', message: 'Finalizing flashcard set...', progress: 95 });

          // Send final results with the iteratively refined flashcards
          sendUpdate({
            type: 'complete',
            data: {
              topic,
              conversation,
              flashcards: currentFlashcards,
            },
            progress: 100
          });

        } catch (error) {
          sendUpdate({
            type: 'error',
            error: error instanceof Error ? error.message : 'Unknown error',
            progress: 0
          });
        } finally {
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    console.error('Error generating flashcards:', error);
    return NextResponse.json(
      { error: 'Failed to generate flashcards', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}