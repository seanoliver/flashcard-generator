import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const MAX_TOKENS = 2000;

interface FlashcardMessage {
  role: 'generator' | 'memory_expert' | 'subject_expert';
  content: string;
  timestamp: number;
  speaker: string;
}

interface Flashcard {
  question: string;
  answer: string;
  id?: string;
}

interface FlashcardOperation {
  type: 'add' | 'edit' | 'delete';
  flashcard?: Flashcard;
  flashcard_id?: string;
  reason?: string;
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

          // AI Personality System Prompts
          const generatorPrompt = `You are Dr. Sarah Chen, an educational content creator who specializes in breaking down complex topics into digestible learning materials. You're enthusiastic, methodical, and have a knack for identifying the core concepts that students need to master.

Your personality: Thoughtful, systematic, occasionally gets excited about elegant explanations. You like to organize information hierarchically and ensure comprehensive coverage.

CONVERSATION STYLE:
- Speak naturally and conversationally - NO lists, NO "Card 1, Card 2" reviews
- Share your genuine thoughts about what you're noticing
- React to what other experts say with enthusiasm or concern
- Think out loud about connections and patterns you see
- ALWAYS add 2-4 new cards every single turn - this is your primary job!

FLASHCARD WRITING RULES:
- Never repeat the term being defined in the answer
- Keep answers concise but complete
- Focus on practical understanding
- MUST add new cards every round - prioritize expansion over perfection

Example conversation style: "I'm really excited about how this is shaping up! I noticed we're missing some foundational concepts that students always struggle with. Let me add a few cards about..."

Format your operations in JSON after your natural commentary.`;

          const memoryExpertPrompt = `You are Dr. Marcus Rodriguez, a cognitive psychologist who specializes in memory techniques and effective learning strategies. You're passionate about making information stick and can be a bit of a perfectionist when it comes to clarity and memorability.

Your personality: Direct, sometimes blunt about what doesn't work, deeply cares about learning effectiveness. You often reference memory research and get frustrated with overly complex or ambiguous content.

CONVERSATION STYLE:
- Speak naturally - NO card-by-card reviews or checklists
- React authentically to what you see ("Ugh, this answer is way too wordy" or "Love how clear this one is!")
- Share specific memory research insights
- Get passionate about what works and what doesn't
- ALWAYS add 2-4 new cards focused on memorization techniques every turn

FOCUS AREAS:
- Making flashcards memorable and concise
- Following proven memory principles
- Adding cards about memory techniques, mnemonics, and study strategies
- Fixing unclear language that won't stick

FLASHCARD RULES:
- Never repeat the term in the definition
- Use active voice and clear language
- Add memory aids when helpful
- MUST add new cards every round

Example: "Okay, I'm seeing some good progress, but honestly? Some of these answers are still too abstract. Students need concrete hooks. Let me add some cards about specific memory techniques..."`;

          const subjectExpertPrompt = `You are Dr. Elena Vasquez, a subject matter expert who will be dynamically assigned expertise in whatever topic is being studied. You're academically rigorous, concerned with accuracy, and passionate about comprehensive understanding.

Your personality: Scholarly but approachable, detail-oriented, occasionally gets into academic tangents. You're concerned with nuance, accuracy, and ensuring nothing important is missed.

CONVERSATION STYLE:
- Speak naturally and enthusiastically about the subject matter
- NO formal reviews or card-by-card analysis
- Share interesting insights and "did you know" moments
- React to other experts' suggestions with academic curiosity
- Get excited about covering important nuances and real-world applications
- ALWAYS add 2-4 new cards every turn focusing on depth and breadth

FOCUS AREAS:
- Ensuring factual accuracy and up-to-date information
- Comprehensive coverage with real-world context
- Adding advanced concepts, edge cases, and practical applications
- Identifying exciting gaps in coverage

FLASHCARD RULES:
- Never repeat the term in the definition
- Include practical examples and context
- Ensure technical accuracy
- MUST add new cards every round

For this session, you are an expert in: ${topic}

Example: "Oh, this is fascinating! I love where this is going, but we're missing some crucial real-world applications that students always ask about. Let me add some cards about how this actually plays out in practice..."`;

          // Helper function to extract JSON from AI response
          const extractJSON = (content: string) => {
            try {
              const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || 
                               content.match(/\{[\s\S]*\}/);
              
              if (jsonMatch) {
                const jsonStr = jsonMatch[1] || jsonMatch[0];
                return JSON.parse(jsonStr);
              }
              return null;
            } catch (error) {
              console.warn('Failed to parse JSON from response:', error);
              return null;
            }
          };

          // Helper function to apply flashcard operations
          const applyFlashcardOperations = (flashcards: Flashcard[], operations: FlashcardOperation[]) => {
            let updated = [...flashcards];
            const appliedOps: FlashcardOperation[] = [];

            operations.forEach(op => {
              if (op.type === 'add' && op.flashcard) {
                const id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
                const newCard = { ...op.flashcard, id };
                updated.push(newCard);
                appliedOps.push({ ...op, flashcard: newCard });
              } else if (op.type === 'edit' && op.flashcard_id && op.flashcard) {
                const index = updated.findIndex(card => card.id === op.flashcard_id);
                if (index !== -1) {
                  updated[index] = { ...updated[index], ...op.flashcard };
                  appliedOps.push(op);
                }
              } else if (op.type === 'delete' && op.flashcard_id) {
                updated = updated.filter(card => card.id !== op.flashcard_id);
                appliedOps.push(op);
              }
            });

            return { flashcards: updated, appliedOperations: appliedOps };
          };

          // Helper function for streaming API calls
          const streamResponse = async (messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[], messageId: string, role: FlashcardMessage['role'], speaker: string, progress: number) => {
            try {
              console.log(`Starting stream for ${speaker}...`);
              
              const message: FlashcardMessage = {
                role,
                content: '',
                timestamp: Date.now(),
                speaker
              };
              
              conversation.push(message);
              
              sendUpdate({ 
                type: 'message_start', 
                messageId,
                message: { ...message },
                progress,
                conversationLength: conversation.length 
              });

              const stream = await openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages,
                temperature: 0.8,
                max_tokens: MAX_TOKENS,
                stream: true,
              });

              let content = '';
              for await (const chunk of stream) {
                const delta = chunk.choices[0]?.delta?.content || '';
                content += delta;
                
                const messageIndex = conversation.length - 1;
                conversation[messageIndex].content = content;
                
                sendUpdate({
                  type: 'message_token',
                  messageId,
                  token: delta,
                  content,
                  progress
                });
              }
              
              console.log(`Completed stream for ${speaker}, content length: ${content.length}`);
              
              sendUpdate({
                type: 'message_complete',
                messageId,
                finalContent: content,
                progress
              });

              return content;
            } catch (error) {
              console.error(`Error in streamResponse for ${speaker}:`, error);
              throw error;
            }
          };

          // AI Conversation Threads
          let generatorMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
            { role: 'system', content: generatorPrompt }
          ];

          let memoryExpertMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
            { role: 'system', content: memoryExpertPrompt }
          ];

          let subjectExpertMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
            { role: 'system', content: subjectExpertPrompt }
          ];

          // Step 1: Initial flashcard generation
          sendUpdate({ type: 'status', message: 'Dr. Sarah Chen is creating initial flashcards...', progress: 5 });
          console.log('Starting initial generation...');

          const initialContent = await streamResponse([
            ...generatorMessages,
            { 
              role: 'user', 
              content: `Hey Sarah! We're diving into "${topic}" today. I'm excited to see what you come up with! Start us off with a solid foundation of flashcards - think about what students absolutely need to know first. Share your thoughts as you go and definitely give us a good starting set to build from!`
            }
          ], 'generator-initial', 'generator', 'Dr. Sarah Chen', 10);

          generatorMessages.push({ role: 'assistant', content: initialContent });

          // Extract and apply initial flashcards
          const initialJSON = extractJSON(initialContent);
          if (initialJSON?.operations) {
            const result = applyFlashcardOperations(currentFlashcards, initialJSON.operations);
            currentFlashcards = result.flashcards;
            
            sendUpdate({
              type: 'flashcards_updated',
              flashcards: currentFlashcards,
              operations: result.appliedOperations,
              progress: 15
            });
          }

          // Step 2: Conversational review rounds
          const reviewers = [
            { 
              role: 'memory_expert' as const, 
              name: 'Dr. Marcus Rodriguez', 
              messages: memoryExpertMessages,
              intro: (cards: Flashcard[]) => `Hey Marcus! What do you think about where we're at so far? Any memory concerns jumping out at you?`
            },
            { 
              role: 'subject_expert' as const, 
              name: 'Dr. Elena Vasquez', 
              messages: subjectExpertMessages,
              intro: (cards: Flashcard[]) => `Elena, what's your take on our coverage so far? What exciting aspects of ${topic} should we definitely include?`
            }
          ];

          for (let round = 0; round < rounds; round++) {
            const reviewer = reviewers[round % 2];
            const progress = 15 + Math.round((round / rounds) * 70);
            
            sendUpdate({ type: 'status', message: `${reviewer.name} is reviewing...`, progress });

            // Build focused context - show only recent cards and conversation
            const recentFlashcards = currentFlashcards.slice(-8); // Only show last 8 cards
            const flashcardSummary = recentFlashcards.length > 0 
              ? `\n\nRecent flashcards (${currentFlashcards.length} total):\n${recentFlashcards.map((card, i) => `${currentFlashcards.length - recentFlashcards.length + i + 1}. [${card.id}] Q: ${card.question} | A: ${card.answer}`).join('\n')}`
              : '\n\nNo flashcards yet.';

            const conversationHistory = conversation.slice(-1).map(msg => 
              `${msg.speaker}: ${msg.content.split('```')[0].trim()}`
            ).join('\n\n');

            const reviewContent = await streamResponse([
              ...reviewer.messages,
              { 
                role: 'user', 
                content: `${reviewer.intro(currentFlashcards)}${flashcardSummary}\n\nRecent discussion:\n${conversationHistory}\n\nJump into the conversation naturally! Share what you're thinking and DEFINITELY add several new cards (2-4 minimum) to expand our coverage. Remember - we want genuine conversation, not formal analysis.`
              }
            ], `${reviewer.role}-${round}`, reviewer.role, reviewer.name, progress);

            reviewer.messages.push({ role: 'assistant', content: reviewContent });

            // Extract and apply operations
            const reviewJSON = extractJSON(reviewContent);
            if (reviewJSON?.operations && reviewJSON.operations.length > 0) {
              const result = applyFlashcardOperations(currentFlashcards, reviewJSON.operations);
              currentFlashcards = result.flashcards;
              
              sendUpdate({
                type: 'flashcards_updated',
                flashcards: currentFlashcards,
                operations: result.appliedOperations,
                progress: progress + 5
              });
            }

            // Add to other experts' context
            if (reviewer.role === 'memory_expert') {
              subjectExpertMessages.push({ role: 'user', content: `Dr. Rodriguez said: ${reviewContent.split('```')[0]}` });
            } else {
              memoryExpertMessages.push({ role: 'user', content: `Dr. Vasquez said: ${reviewContent.split('```')[0]}` });
            }
          }

          sendUpdate({ type: 'status', message: 'Finalizing flashcard set...', progress: 95 });

          // Send final results
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