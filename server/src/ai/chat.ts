import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { convertToModelMessages, jsonSchema, pipeUIMessageStreamToResponse, streamText, tool, toUIMessageStream, type ToolSet, type UIMessage } from 'ai';
import type { Request, RequestHandler, Response } from 'express';
import { AI_SYSTEM_PROMPT, AI_TOOLS } from '@classinteract/shared';
import type { Config } from '../config';
import { AppError, badRequest } from '../lib/errors';

/** Most messages of history we will forward, and most tool round trips after the last thing the user typed. */
const MAX_MESSAGES = 80;
const MAX_STEPS_PER_TURN = 30;

/**
 * The tools the model may call. They have no `execute`: the presentation lives in the editor, so the browser runs
 * them (against the same validation as JSON import) and sends the results back on the next request. Defining them
 * here, rather than trusting a list sent by the client, means a client can never give the model extra powers.
 */
const tools: ToolSet = Object.fromEntries(
  AI_TOOLS.map((t) => [t.name, tool({ description: t.description, inputSchema: jsonSchema(t.parameters as any) })]),
);

function stepsSinceUser(messages: UIMessage[]): number {
  let steps = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === 'user') break;
    if (m.role === 'assistant') steps += m.parts.filter((p) => typeof p.type === 'string' && p.type.startsWith('tool-')).length;
  }
  return steps;
}

function validMessages(body: unknown): UIMessage[] {
  const messages = (body as { messages?: unknown } | null)?.messages;
  if (!Array.isArray(messages) || messages.length === 0) throw badRequest('Send a "messages" array.');
  if (messages.length > MAX_MESSAGES) throw new AppError(413, 'CONVERSATION_TOO_LONG', 'This conversation is too long. Start a new chat.');
  for (const m of messages) {
    if (typeof m !== 'object' || m === null || !['user', 'assistant'].includes((m as UIMessage).role) || !Array.isArray((m as UIMessage).parts)) {
      throw badRequest('Every message needs a role of "user" or "assistant" and a list of parts.');
    }
  }
  return messages as UIMessage[];
}

/** POST /api/studio/ai/chat: streams the assistant's reply in the AI SDK UI-message format. */
export function aiChatHandler(config: Config): RequestHandler {
  const provider = config.aiApiKey
    ? createOpenAICompatible({
        name: 'aimlapi',
        baseURL: config.aiBaseUrl,
        apiKey: config.aiApiKey,
        // some CDNs refuse requests that do not identify themselves
        headers: { 'User-Agent': 'ClassInteract/1.0 (+https://github.com/YouTubeATP/class-interact)' },
      })
    : null;

  return async (req: Request, res: Response) => {
    if (!provider) throw new AppError(503, 'AI_DISABLED', 'The AI assistant is not set up on this server. Set AIMLAPI_KEY to turn it on.');
    const messages = validMessages(req.body);
    if (stepsSinceUser(messages) > MAX_STEPS_PER_TURN) {
      throw new AppError(429, 'TOO_MANY_STEPS', 'The assistant made too many changes for one request. Ask it to continue.');
    }

    let modelMessages;
    try {
      modelMessages = await convertToModelMessages(messages, { tools });
    } catch {
      throw badRequest('Those messages could not be read.');
    }

    // stop paying for a reply nobody is waiting for
    const abort = new AbortController();
    res.on('close', () => { if (!res.writableEnded) abort.abort(); });

    const result = streamText({
      model: provider.chatModel(config.aiModel),
      system: AI_SYSTEM_PROMPT,
      messages: modelMessages,
      tools,
      abortSignal: abort.signal,
      maxOutputTokens: 12_000,
      maxRetries: 1,
      temperature: 0.4,
      onError: () => undefined, // reported once, below, in a form that cannot leak details
    });

    await pipeUIMessageStreamToResponse({
      response: res,
      stream: toUIMessageStream({
        stream: result.stream,
        // what the browser sees of a failure: never the upstream's message, URL or anything about the key
        onError: (error) => {
          console.warn('[ai] upstream error:', error instanceof Error ? error.message : 'unknown');
          return 'The AI service had a problem. Try again in a moment.';
        },
      }),
    });
  };
}
