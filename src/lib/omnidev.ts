import { supabase } from '@/lib/supabase';

export interface OmniDevMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface OmniDevOrgContext {
  scoped: boolean;
  regionName?: string | null;
  divisionName?: string | null;
  regcode?: string | null;
  divcode?: string | null;
}

/** Thrown when the server-side GROQ_API_KEY has not been configured yet. */
export class OmniDevNotConfiguredError extends Error {
  constructor() {
    super('OmniDev AI is not configured yet — add the GROQ_API_KEY to finish setup.');
    this.name = 'OmniDevNotConfiguredError';
  }
}

/**
 * Thrown when the omnidev-ai edge function cannot be reached — most commonly
 * because it has not been deployed to the Supabase project yet. supabase-js
 * wraps the browser-blocked gateway 404 as a network-level fetch failure, so
 * this is detected from the known FunctionsFetchError message.
 */
export class OmniDevUnreachableError extends Error {
  constructor() {
    super('OmniDev AI cannot be reached — the edge function may not be deployed, or the connection was interrupted. Check your connection and try again.');
    this.name = 'OmniDevUnreachableError';
  }
}

/**
 * Maps a thrown value from a fetch/stream call into a friendly OmniDev error.
 * Browser network failures surface as raw `TypeError: Failed to fetch` (or
 * platform-specific messages) — those must never reach the UI verbatim.
 * Already-typed OmniDev errors pass through unchanged.
 */
function classifyStreamError(err: unknown): Error {
  if (
    err instanceof OmniDevQuotaError ||
    err instanceof OmniDevNotConfiguredError ||
    err instanceof OmniDevUnreachableError
  ) {
    return err;
  }
  if (
    err instanceof TypeError ||
    (err instanceof Error && /failed to fetch|networkerror|network error|load failed|fetch failed|terminated/i.test(err.message))
  ) {
    return new OmniDevUnreachableError();
  }
  return err instanceof Error ? err : new Error(String(err));
}

/**
 * Thrown when the AI provider's API key hit a quota / rate limit. Groq's free
 * tier is very generous (~14,400 chat requests/day), so reaching this means a
 * brief per-minute burst or the daily cap was genuinely hit. The edge function
 * retries transient bursts once before surfacing this.
 */
export class OmniDevQuotaError extends Error {
  constructor() {
    super(
      "The AI provider's free-tier quota is currently exhausted. It resets — or create a fresh Groq key, then run: supabase secrets set GROQ_API_KEY=…",
    );
    this.name = 'OmniDevQuotaError';
  }
}

function isQuotaMessage(text: string): boolean {
  return /quota|RESOURCE_EXHAUSTED|rate limit|billing/i.test(text);
}

/**
 * Send the conversation to the OmniDev AI assistant.
 * Now uses the built-in PostgreSQL ai_copilot function instead of
 * an external LLM edge function.
 */
export async function askOmniDev(
  messages: OmniDevMessage[],
  org: OmniDevOrgContext,
): Promise<string> {
  const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
  const question = lastUserMsg?.content ?? '';
  if (!question) throw new Error('No question provided.');

  const { data, error } = await supabase.rpc('ai_copilot', {
    p_question: question,
    p_org: org,
  });

  if (error) {
    throw new Error(`AI Copilot error: ${error.message}`);
  }

  const reply = typeof data?.reply === 'string' ? data.reply.trim() : '';
  if (!reply) throw new Error('AI Copilot returned an empty reply. Please try again.');
  return reply;
}

/**
 * Stream the assistant's answer. Now uses the built-in PostgreSQL ai_copilot
 * function and simulates streaming by emitting text in word-sized chunks
 * for a smooth typing effect.
 */
export async function askOmniDevStream(
  messages: OmniDevMessage[],
  org: OmniDevOrgContext,
  onDelta: (text: string) => void,
): Promise<string> {
  const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
  const question = lastUserMsg?.content ?? '';
  if (!question) throw new Error('No question provided.');

  const { data, error } = await supabase.rpc('ai_copilot', {
    p_question: question,
    p_org: org,
  });

  if (error) {
    throw new Error(`AI Copilot error: ${error.message}`);
  }

  const fullReply = typeof data?.reply === 'string' ? data.reply.trim() : '';
  if (!fullReply) throw new Error('AI Copilot returned an empty reply. Please try again.');

  // Simulate streaming by emitting words progressively for a typing effect
  const words = fullReply.split(/(\s+)/);
  let accumulated = '';
  for (let i = 0; i < words.length; i++) {
    accumulated += words[i];
    onDelta(accumulated);
    // Small delay every few words for natural feel; skip for very short replies
    if (fullReply.length > 100 && i % 3 === 0) {
      await new Promise((r) => setTimeout(r, 15));
    }
  }

  return fullReply;
}
