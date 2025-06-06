import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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
          const flashcards: Flashcard[] = [];

          // System prompts for the two agents
          const explainerPrompt = `You are an Expert Explainer. Your role is to:
- Break down complex topics into clear, understandable concepts
- Identify key learning objectives and fundamental principles
- Propose flashcard questions that test understanding
- Focus on clarity and comprehensive coverage of the topic
- When responding, structure your thoughts and suggest specific flashcard Q&A pairs

Format flashcard suggestions as:
FLASHCARD: Q: [question] | A: [answer]`;

          const criticPrompt = `You are a Critical Reviewer. Your role is to:
- Challenge explanations for completeness and accuracy
- Identify edge cases, nuances, and potential misconceptions
- Suggest improvements to flashcard questions and answers
- Ensure flashcards test deeper understanding, not just memorization
- Point out missing subtopics or important details

When suggesting flashcard improvements, use the format:
FLASHCARD: Q: [question] | A: [answer]`;

          // Start the conversation
          let explainerMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
            { role: 'system', content: explainerPrompt },
            { role: 'user', content: `Please explain the topic "${topic}" and suggest initial flashcards for learning this subject.` }
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
              const response = await openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: explainerMessages,
                temperature: 0.7,
                max_tokens: 600,
              });

              const content = response.choices[0]?.message?.content || '';
              
              const message: FlashcardMessage = {
                role: 'explainer',
                content,
                timestamp: Date.now(),
              };
              
              conversation.push(message);
              
              // Send the new message immediately
              sendUpdate({ 
                type: 'message', 
                message, 
                progress,
                conversationLength: conversation.length 
              });

              explainerMessages.push({ role: 'assistant', content });
              criticMessages.push({ role: 'user', content: `The Explainer said: "${content}"\n\nPlease review this explanation and suggest improvements or additional flashcards. Point out any missing nuances or edge cases.` });

            } else {
              // Critic's turn
              sendUpdate({ type: 'status', message: 'Critical Reviewer is analyzing...', progress });
              const response = await openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: criticMessages,
                temperature: 0.7,
                max_tokens: 600,
              });

              const content = response.choices[0]?.message?.content || '';
              
              const message: FlashcardMessage = {
                role: 'critic',
                content,
                timestamp: Date.now(),
              };
              
              conversation.push(message);
              
              // Send the new message immediately
              sendUpdate({ 
                type: 'message', 
                message, 
                progress,
                conversationLength: conversation.length 
              });

              criticMessages.push({ role: 'assistant', content });
              explainerMessages.push({ role: 'user', content: `The Critic said: "${content}"\n\nPlease address their feedback and refine your explanations and flashcard suggestions accordingly.` });
            }
          }

          sendUpdate({ type: 'status', message: 'Extracting flashcards...', progress: 85 });

          // Extract flashcards from the conversation
          const flashcardRegex = /FLASHCARD:\s*Q:\s*(.+?)\s*\|\s*A:\s*(.+?)(?=\n|$)/gi;
          
          for (const message of conversation) {
            let match;
            while ((match = flashcardRegex.exec(message.content)) !== null) {
              flashcards.push({
                question: match[1].trim(),
                answer: match[2].trim(),
              });
            }
          }

          // Remove duplicates based on question similarity
          const uniqueFlashcards = flashcards.filter((card, index, arr) => 
            arr.findIndex(c => c.question.toLowerCase() === card.question.toLowerCase()) === index
          );

          sendUpdate({ type: 'status', message: 'Finalizing results...', progress: 95 });

          // Send final results
          sendUpdate({
            type: 'complete',
            data: {
              topic,
              conversation,
              flashcards: uniqueFlashcards,
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