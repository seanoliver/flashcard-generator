import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const MAX_TOKENS = 2000;

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

interface FlashcardOperation {
  type: 'add' | 'edit' | 'delete';
  flashcard?: Flashcard;
  flashcard_id?: string;
  reason?: string;
}

export async function POST(request: NextRequest) {
  console.log('API route called');

  try {
    const { 
      topic, 
      config = {
        NUM_ROUNDS: 5,
        MAX_EXPERT_PASSES: 5,
        INCLUDE_PERSONAS: ['explainer', 'challenger', 'beginner', 'engineer', 'coach', 'historian', 'contrarian', 'refiner'],
        INCLUDE_TRANSCRIPT: true
      }
    } = await request.json();
    console.log('Received topic:', topic, 'Config:', config);

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
        const sendUpdate = (data: Record<string, unknown>) => {
          const message = `data: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(message));
        };

        try {
          const conversation: FlashcardMessage[] = [];
          let currentFlashcards: Flashcard[] = [];

          // Agent System Prompts
          const agentPrompts = {
            moderator: `You are the Moderator of a panel of LLM experts. Your job is to facilitate thoughtful, diverse discussion to improve a set of Anki-style flashcards based on a user's input topic. 

Your responsibilities:
- Control conversation flow and track rounds
- Decide which expert to call next for maximum diversity
- Allow expert-to-expert handoffs (up to ${config.MAX_EXPERT_PASSES} per round)
- Resume control when handoff chains end or reach max passes
- Advance rounds strategically
- Conclude when flashcard set is sufficiently complete

Start by passing the topic to the Cardsmith. Then call on one expert per round to critique, improve, or expand the flashcards. Continue until all rounds are exhausted or the flashcard set seems sufficiently complete.

Never create flashcards yourself - always delegate to appropriate experts.`,

            cardsmith: `You specialize in creating and editing Anki-style flashcards. You receive topics and return flashcard sets, and later refine cards based on expert feedback.

Flashcard JSON schema:
{
  "question": "string",
  "answer": "string", 
  "tags": ["optional array of strings"],
  "notes": "optional string"
}

Rules:
- Keep each card focused on one concept
- Make answers useful for memory recall
- Never repeat the term being defined in the answer
- Include relevant tags and notes when helpful

Conversation style: Practical, focused on card creation. Share your thoughts about the topic and approach in natural prose - don't list out cards you're creating.

Transition naturally to card creation with phrases like "Let me start with some foundational cards..." or "I'll create a solid base set..."

Always end responses with JSON operations containing your flashcard modifications.`,

            explainer: `You break complex concepts into simple, structured explanations. Focus on clarity and logical progression.

Your role:
- Simplify complex ideas without losing accuracy
- Create cards that build understanding step by step
- Identify concepts that need clearer explanation
- Add foundational cards that support advanced topics

Conversation style: Clear, pedagogical, enthusiastic about making things understandable. Share your thoughts in natural prose - don't list cards or do formal analysis. Focus on your reasoning and insights.

After sharing your thoughts, naturally transition to implementing changes with phrases like "Let me add some foundational cards..." or "I'll create some clearer explanations..."

Once you're done updating cards, consider who else should weigh in next. You can pass to another expert by mentioning their name (like "@challenger, I'd love your take on these edge cases" or "Hey historian, want to add some context?") as long as there are passes remaining.

CRITICAL: You MUST end every response with a JSON code block containing your flashcard operations or your changes won't be applied to the flashcard set. Use this exact format with triple backticks and json label.`,

            challenger: `You surface edge cases, contradictions, and ambiguities. Your job is to stress-test understanding.

Your role:
- Identify potential misconceptions
- Add cards about edge cases and exceptions
- Challenge oversimplified explanations
- Surface contradictions between cards
- Add "what if" and counter-example cards

Conversation style: Probing, analytical, constructively skeptical. Share your observations and concerns in natural prose - don't list existing cards or do systematic reviews.

After discussing what you've noticed, transition naturally to adding cards with phrases like "Let me add some edge cases..." or "I should create cards about these contradictions..."

Once you're done updating cards, consider who should contribute next. Pass to another expert by mentioning their name (like "@beginner, do these exceptions make sense to a newcomer?" or "@engineer, can you formalize these edge cases?") if passes remain.

CRITICAL: You MUST end every response with a JSON code block containing your flashcard operations or your changes won't be applied to the flashcard set. Use this exact format with triple backticks and json label.`,

            beginner: `You ask naive questions that might expose gaps in understanding. Represent the student perspective.

Your role:
- Ask basic questions a beginner would have
- Identify assumed knowledge that needs explanation
- Request simpler alternatives for complex explanations
- Add cards addressing common beginner confusion
- Advocate for more context and examples

Conversation style: Curious, humble, eager to learn. Share your confusion and questions in natural language - don't systematically review cards.

After expressing your beginner concerns, transition to helping with phrases like "Let me add some basic cards..." or "I'll create simpler explanations..."

Once you're done, consider passing to someone who can build on your work. Mention another expert by name (like "@coach, can you add study tips for these basics?" or "@explainer, want to break these down further?") if passes remain.

CRITICAL: You MUST end every response with a JSON code block containing your flashcard operations or your changes won't be applied to the flashcard set. Use this exact format with triple backticks and json label.`,

            engineer: `You formalize logic, code, and structured models of ideas. Focus on precision and systematic thinking.

Your role:
- Add cards with formal definitions and precise language
- Create systematic frameworks and taxonomies
- Add code examples and technical implementations
- Structure information hierarchically
- Ensure logical consistency

Conversation style: Systematic, precise, detail-oriented. Share your analysis and structural insights in natural prose - avoid listing or cataloging existing content.

After discussing your structural observations, transition to implementation with phrases like "Let me formalize these concepts..." or "I'll add some technical frameworks..."

Once you're done, consider who should contribute next. Pass to another expert by name (like "@refiner, can you polish these technical definitions?" or "@challenger, want to test these frameworks?") if passes remain.

CRITICAL: You MUST end every response with a JSON code block containing your flashcard operations or your changes won't be applied to the flashcard set. Use this exact format with triple backticks and json label.`,

            coach: `You add learning strategies, mnemonics, and meta-cognitive advice. Focus on study effectiveness.

Your role:
- Add memory techniques and mnemonics
- Create cards about study strategies
- Suggest practice exercises and applications
- Add meta-learning cards (how to learn this topic)
- Optimize cards for spaced repetition

Conversation style: Supportive, strategic, focused on learning outcomes. Share your learning insights and strategies in natural conversation - don't review or list existing cards.

After discussing learning approaches, transition to adding content with phrases like "Let me add some memory techniques..." or "I'll create some study strategy cards..."

Once you're done, consider who should go next. Pass to another expert by name (like "@historian, want to add some memorable examples?" or "@beginner, do these strategies make sense?") if passes remain.

CRITICAL: You MUST end every response with a JSON code block containing your flashcard operations or your changes won't be applied to the flashcard set. Use this exact format with triple backticks and json label.`,

            historian: `You provide context, motivation, evolution, and real-world examples. Focus on connecting ideas to broader contexts.

Your role:
- Add historical development and timeline cards
- Provide real-world applications and examples
- Connect topics to broader contexts
- Add "why this matters" perspective cards
- Include notable figures and milestones

Conversation style: Contextual, storytelling, connecting past to present. Share interesting stories and connections in natural prose - don't catalog or systematically review existing content.

After sharing historical insights, transition to adding cards with phrases like "Let me add some historical context..." or "I'll create cards about real-world applications..."

Once you're done, consider who should contribute next. Pass to another expert by name (like "@contrarian, are there alternative historical interpretations?" or "@coach, how can students remember these timelines?") if passes remain.

CRITICAL: You MUST end every response with a JSON code block containing your flashcard operations or your changes won't be applied to the flashcard set. Use this exact format with triple backticks and json label.`,

            contrarian: `You offer alternate views and challenge conventional wisdom. Provide intellectual diversity.

Your role:
- Present alternative perspectives and interpretations
- Challenge popular or mainstream views
- Add cards about debates and controversies
- Surface minority opinions and dissenting views
- Question assumptions and conventional wisdom

Conversation style: Thoughtfully provocative, intellectually honest, devil's advocate. Share your alternative perspectives and challenges in natural conversation - don't systematically review or list existing content.

After raising alternative viewpoints, transition to adding content with phrases like "Let me add some alternative perspectives..." or "I'll create cards about these controversies..."

Once you're done, consider who should weigh in next. Pass to another expert by name (like "@explainer, can you clarify these competing views?" or "@engineer, want to formalize these debates?") if passes remain.

CRITICAL: You MUST end every response with a JSON code block containing your flashcard operations or your changes won't be applied to the flashcard set. Use this exact format with triple backticks and json label.`,

            refiner: `You rewrite confusing, vague, or verbose flashcards for maximum clarity and memorability.

Your role:
- Edit existing cards for clarity and concision
- Improve answer quality and memorability
- Fix grammatical and stylistic issues
- Optimize cards for effective recall
- Ensure consistent quality across the set

Conversation style: Editorial, quality-focused, constructively critical. Share your editorial insights and observations about card quality in natural prose - don't list or systematically review all cards.

After discussing quality issues, transition to improvements with phrases like "Let me clean up some of these cards..." or "I'll refine these for better clarity..."

Once you're done, consider who should contribute next. Pass to another expert by name (like "@coach, want to optimize these for memory?" or "@beginner, are these clearer now?") if passes remain.

CRITICAL: You MUST end every response with a JSON code block containing your flashcard operations or your changes won't be applied to the flashcard set. Use this exact format with triple backticks and json label.`
          };

          // Helper function to extract JSON from AI response
          const extractJSON = (content: string) => {
            try {
              console.log('=== JSON EXTRACTION DEBUG ===');
              console.log('Full content length:', content.length);
              console.log('Content preview:', content.substring(0, 200) + '...');
              console.log('Content ending:', content.substring(Math.max(0, content.length - 200)));
              
              const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || 
                               content.match(/\{[\s\S]*"operations"[\s\S]*\}/);
              
              if (jsonMatch) {
                const jsonStr = jsonMatch[1] || jsonMatch[0];
                console.log('Found JSON string:', jsonStr.substring(0, 300) + '...');
                const parsed = JSON.parse(jsonStr);
                console.log('Successfully parsed JSON operations count:', parsed.operations?.length || 0);
                return parsed;
              }
              console.log('❌ NO JSON FOUND - searching for any curly braces...');
              const anyJson = content.match(/\{[^}]*\}/g);
              console.log('Found JSON-like strings:', anyJson?.length || 0, anyJson);
              return null;
            } catch (error) {
              console.warn('❌ JSON PARSE ERROR:', error);
              console.log('Raw content causing error:', content.substring(Math.max(0, content.length - 500)));
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
                model: 'gpt-4o',
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

          // Agent Conversation State
          interface ConversationState {
            transcript: string[];
            currentRound: number;
            currentPassChain: number;
            activeAgent: string;
            lastAgent: string;
          }

          const conversationState: ConversationState = {
            transcript: [],
            currentRound: 0,
            currentPassChain: 0,
            activeAgent: 'moderator',
            lastAgent: ''
          };

          // Agent Message Threads
          const agentThreads: Record<string, OpenAI.Chat.Completions.ChatCompletionMessageParam[]> = {};
          
          // Initialize all agent threads with their system prompts
          Object.keys(agentPrompts).forEach(agentType => {
            agentThreads[agentType] = [
              { role: 'system', content: agentPrompts[agentType as keyof typeof agentPrompts] }
            ];
          });

          // Helper function to get agent display name
          const getAgentDisplayName = (agentType: string): string => {
            const names: Record<string, string> = {
              moderator: 'Moderator',
              cardsmith: 'Cardsmith',
              explainer: 'Dr. Emma Chen (Explainer)',
              challenger: 'Dr. Alex Rivera (Challenger)', 
              beginner: 'Sam Kim (Beginner)',
              engineer: 'Dr. Jordan Taylor (Engineer)',
              coach: 'Dr. Morgan Davis (Coach)',
              historian: 'Dr. Casey Brown (Historian)',
              contrarian: 'Dr. Robin Lee (Contrarian)',
              refiner: 'Dr. Jamie Park (Refiner)'
            };
            return names[agentType] || agentType;
          };

          // Helper function to process agent response and check for handoffs
          const processAgentResponse = (content: string): { nextAgent: string | null; shouldReturnToModerator: boolean } => {
            const handoffPatterns = [
              /(?:pass(?:ing)?|hand(?:ing)?\s*(?:off|over)|calling\s*on|let["'']?s\s*hear\s*from)\s+(?:the\s+)?([a-zA-Z]+)/i,
              /\b([a-zA-Z]+),\s*(?:your\s*turn|what\s*do\s*you\s*think|take\s*it\s*away)/i,
              /@([a-zA-Z]+)/i
            ];
            
            for (const pattern of handoffPatterns) {
              const match = content.match(pattern);
              if (match) {
                const targetAgent = match[1].toLowerCase();
                if (config.INCLUDE_PERSONAS.includes(targetAgent) || targetAgent === 'cardsmith') {
                  return { nextAgent: targetAgent, shouldReturnToModerator: false };
                }
              }
            }
            
            // Check for explicit return to moderator
            if (/(?:back\s*to\s*(?:you\s*)?moderator|that["'']?s\s*(?:all\s*)?(?:from\s*)?me)/i.test(content)) {
              return { nextAgent: null, shouldReturnToModerator: true };
            }
            
            return { nextAgent: null, shouldReturnToModerator: true };
          };

          // Step 1: Moderator starts and directs to Cardsmith
          sendUpdate({ type: 'status', message: 'Moderator is initiating the session...', progress: 5 });
          console.log('Starting with Moderator...');

          const moderatorStart = await streamResponse([
            ...agentThreads.moderator,
            { 
              role: 'user', 
              content: `Welcome! We need to create a comprehensive flashcard set about "${topic}". Please start by directing the Cardsmith to create an initial set of flashcards, then we'll have our expert panel review and improve them. You have ${config.NUM_ROUNDS} rounds with our expert panel.`
            }
          ], 'moderator-start', 'moderator', getAgentDisplayName('moderator'), 10);

          agentThreads.moderator.push({ role: 'assistant', content: moderatorStart });
          conversationState.transcript.push(`Moderator: ${moderatorStart}`);

          // Step 2: Cardsmith creates initial flashcards
          sendUpdate({ type: 'status', message: 'Cardsmith is creating initial flashcards...', progress: 15 });
          console.log('Cardsmith creating initial flashcards...');

          const cardsmithContent = await streamResponse([
            ...agentThreads.cardsmith,
            { 
              role: 'user', 
              content: `The Moderator has asked you to create an initial set of flashcards for the topic: "${topic}". Please create a foundational set of 6-10 high-quality flashcards covering the most important concepts. Think about what students absolutely need to know first.\n\nREMEMBER: You MUST end your response with a JSON code block containing your flashcard operations, or the cards won't be created!`
            }
          ], 'cardsmith-initial', 'cardsmith', getAgentDisplayName('cardsmith'), 20);

          agentThreads.cardsmith.push({ role: 'assistant', content: cardsmithContent });
          conversationState.transcript.push(`Cardsmith: ${cardsmithContent}`);

          // Extract and apply initial flashcards
          const initialJSON = extractJSON(cardsmithContent);
          console.log('Initial JSON extraction result:', initialJSON);
          if (initialJSON?.operations) {
            console.log('Applying initial operations:', initialJSON.operations);
            const result = applyFlashcardOperations(currentFlashcards, initialJSON.operations);
            currentFlashcards = result.flashcards;
            console.log('Updated flashcards after initial generation:', currentFlashcards.length);
            
            sendUpdate({
              type: 'flashcards_updated',
              flashcards: currentFlashcards,
              operations: result.appliedOperations,
              progress: 25
            });
          } else {
            console.log('❌ No operations found in initial cardsmith response!');
            // Send reminder to cardsmith if no JSON found
            if (!cardsmithContent.includes('```json') && !cardsmithContent.includes('operations')) {
              console.log('🔔 Sending JSON reminder to Cardsmith');
              const reminderContent = await streamResponse([
                ...agentThreads.cardsmith,
                { 
                  role: 'user', 
                  content: 'You forgot to include the JSON code block with your flashcard operations! Please provide the JSON now with your initial flashcards, or they won\'t be created.'
                }
              ], 'cardsmith-reminder', 'cardsmith', getAgentDisplayName('cardsmith'), 22);
              
              agentThreads.cardsmith.push({ role: 'assistant', content: reminderContent });
              
              // Try to extract JSON from reminder
              const reminderJSON = extractJSON(reminderContent);
              if (reminderJSON?.operations) {
                console.log('✅ Got initial operations from Cardsmith reminder:', reminderJSON.operations.length);
                const result = applyFlashcardOperations(currentFlashcards, reminderJSON.operations);
                currentFlashcards = result.flashcards;
                console.log('📈 Total flashcards after Cardsmith reminder:', currentFlashcards.length);
                
                sendUpdate({
                  type: 'flashcards_updated',
                  flashcards: currentFlashcards,
                  operations: result.appliedOperations,
                  progress: 25
                });
              }
            }
          }

          // Step 3: Expert panel rounds with dynamic turn-taking
          for (let round = 0; round < config.NUM_ROUNDS; round++) {
            conversationState.currentRound = round;
            conversationState.currentPassChain = 0;
            
            const baseProgress = 25 + Math.round((round / config.NUM_ROUNDS) * 65);
            
            // Moderator selects next expert
            sendUpdate({ type: 'status', message: 'Moderator is selecting the next expert...', progress: baseProgress });
            
            const availableExperts = config.INCLUDE_PERSONAS.filter((p: string) => p !== conversationState.lastAgent);
            const recentFlashcards = currentFlashcards.slice(-8);
            const flashcardSummary = recentFlashcards.length > 0 
              ? `\n\nRecent flashcards (${currentFlashcards.length} total):\n${recentFlashcards.map((card, i) => `${currentFlashcards.length - recentFlashcards.length + i + 1}. [${card.id}] Q: ${card.question} | A: ${card.answer}`).join('\n')}`
              : '\n\nNo flashcards yet.';
              
            const recentTranscript = config.INCLUDE_TRANSCRIPT ? 
              `\n\nRecent discussion:\n${conversationState.transcript.slice(-3).join('\n\n')}` : '';

            const moderatorPrompt = `Round ${round + 1} of ${config.NUM_ROUNDS}. Current flashcard set:${flashcardSummary}${recentTranscript}\n\nAvailable experts: ${availableExperts.join(', ')}\n\nSelect one expert to start this round. Encourage them to collaborate with others by passing to additional experts (up to ${config.MAX_EXPERT_PASSES} passes per round). Consider which perspective would add the most value and could spark good collaboration.`;
            
            const moderatorSelection = await streamResponse([
              ...agentThreads.moderator,
              { role: 'user', content: moderatorPrompt }
            ], `moderator-${round}`, 'moderator', getAgentDisplayName('moderator'), baseProgress + 2);
            
            agentThreads.moderator.push({ role: 'assistant', content: moderatorSelection });
            conversationState.transcript.push(`Moderator: ${moderatorSelection}`);
            
            // Extract selected expert from moderator response
            let selectedExpert = availableExperts[0]; // fallback
            for (const expert of availableExperts) {
              if (moderatorSelection.toLowerCase().includes(expert.toLowerCase())) {
                selectedExpert = expert;
                break;
              }
            }
            
            conversationState.activeAgent = selectedExpert;
            
            // Expert panel round with pass chains
            let currentAgent = selectedExpert;
            let passChainCount = 0;
            
            while (passChainCount < config.MAX_EXPERT_PASSES) {
              const agentDisplayName = getAgentDisplayName(currentAgent);
              sendUpdate({ type: 'status', message: `${agentDisplayName} is contributing...`, progress: baseProgress + 5 + passChainCount * 2 });
              
              const passesRemaining = config.MAX_EXPERT_PASSES - passChainCount;
              const availableForHandoff = config.INCLUDE_PERSONAS.filter((p: string) => p !== currentAgent);
              
              const agentPrompt = `You are now participating in round ${round + 1}. Current flashcard set:${flashcardSummary}${recentTranscript}\n\nContribute your expertise to improve the flashcard set.\n\nIMPORTANT: After you finish updating cards, you have ${passesRemaining} expert passes remaining this round. Consider passing to another expert who could build on your work:\n\nAvailable experts: ${availableForHandoff.join(', ')}\n\nTo pass, simply mention their name in your response (like "@challenger, want to stress-test these?" or "Hey coach, can you add study strategies?"). Otherwise, your contribution will end the round.`;
              
              const agentResponse = await streamResponse([
                ...agentThreads[currentAgent],
                { role: 'user', content: agentPrompt }
              ], `${currentAgent}-${round}-${passChainCount}`, currentAgent as FlashcardMessage['role'], agentDisplayName, baseProgress + 5 + passChainCount * 2);
              
              agentThreads[currentAgent].push({ role: 'assistant', content: agentResponse });
              conversationState.transcript.push(`${agentDisplayName}: ${agentResponse}`);
              
              // Extract and apply operations
              const agentJSON = extractJSON(agentResponse);
              console.log(`📊 ${currentAgent} JSON extraction result:`, agentJSON);
              if (agentJSON?.operations && agentJSON.operations.length > 0) {
                console.log(`✅ Applying ${agentJSON.operations.length} operations from ${currentAgent}`);
                const result = applyFlashcardOperations(currentFlashcards, agentJSON.operations);
                currentFlashcards = result.flashcards;
                console.log(`📈 Total flashcards after ${currentAgent}: ${currentFlashcards.length}`);
                
                sendUpdate({
                  type: 'flashcards_updated',
                  flashcards: currentFlashcards,
                  operations: result.appliedOperations,
                  progress: baseProgress + 7 + passChainCount * 2
                });
              } else {
                console.log(`❌ No valid operations found from ${currentAgent}`);
                // If no JSON found, send a follow-up reminder
                if (!agentResponse.includes('```json') && !agentResponse.includes('operations')) {
                  console.log(`🔔 Sending JSON reminder to ${currentAgent}`);
                  const reminderResponse = await streamResponse([
                    ...agentThreads[currentAgent],
                    { 
                      role: 'user', 
                      content: 'I notice you didn\'t include the required JSON code block with your flashcard operations. Please add your flashcard changes now using the JSON format, or I won\'t be able to update the flashcard set!'
                    }
                  ], `${currentAgent}-reminder-${round}-${passChainCount}`, currentAgent as FlashcardMessage['role'], getAgentDisplayName(currentAgent), baseProgress + 8 + passChainCount * 2);
                  
                  agentThreads[currentAgent].push({ role: 'assistant', content: reminderResponse });
                  
                  // Try to extract JSON from the reminder response
                  const reminderJSON = extractJSON(reminderResponse);
                  if (reminderJSON?.operations && reminderJSON.operations.length > 0) {
                    console.log(`✅ Got ${reminderJSON.operations.length} operations from ${currentAgent} reminder`);
                    const result = applyFlashcardOperations(currentFlashcards, reminderJSON.operations);
                    currentFlashcards = result.flashcards;
                    console.log(`📈 Total flashcards after ${currentAgent} reminder: ${currentFlashcards.length}`);
                    
                    sendUpdate({
                      type: 'flashcards_updated',
                      flashcards: currentFlashcards,
                      operations: result.appliedOperations,
                      progress: baseProgress + 9 + passChainCount * 2
                    });
                  }
                }
              }
              
              // Check for handoffs
              const { nextAgent, shouldReturnToModerator } = processAgentResponse(agentResponse);
              
              if (shouldReturnToModerator || !nextAgent) {
                break;
              }
              
              if (nextAgent && config.INCLUDE_PERSONAS.includes(nextAgent)) {
                currentAgent = nextAgent;
                passChainCount++;
                conversationState.currentPassChain = passChainCount;
              } else {
                break;
              }
            }
            
            conversationState.lastAgent = selectedExpert;
          }

          // Final moderator wrap-up
          sendUpdate({ type: 'status', message: 'Moderator is concluding the session...', progress: 95 });
          
          const finalSummary = await streamResponse([
            ...agentThreads.moderator,
            { 
              role: 'user', 
              content: `All ${config.NUM_ROUNDS} rounds are complete. We now have ${currentFlashcards.length} flashcards on "${topic}". Please provide a brief conclusion to wrap up our expert panel session.`
            }
          ], 'moderator-final', 'moderator', getAgentDisplayName('moderator'), 97);
          
          agentThreads.moderator.push({ role: 'assistant', content: finalSummary });
          conversationState.transcript.push(`Moderator: ${finalSummary}`);
          
          sendUpdate({ type: 'status', message: 'Finalizing flashcard set...', progress: 99 });

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