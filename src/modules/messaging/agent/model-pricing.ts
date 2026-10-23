import type { ChatModel } from '../entities/chat.entity';

/** Tokens one reply used, added up over its rounds. */
export interface TokenUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export const emptyUsage = (): TokenUsage => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });

/** Claude API list prices, US dollars per million tokens; cache writes at
 * the 5-minute TTL's 1.25× the input price. Haiku's are for prompts up to
 * 100K tokens, which a chat never reaches. For keeping the assistant inside
 * its budget, not for billing: the Anthropic console has the real bill. */
export const MODEL_PRICES: Record<
  ChatModel,
  { input: number; output: number; cacheRead: number; cacheWrite: number }
> = {
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
};

export function estimateCostUsd(model: ChatModel, usage: TokenUsage): number {
  const price = MODEL_PRICES[model] ?? MODEL_PRICES['claude-opus-5-5'];
  return (
    (usage.input * price.input +
      usage.output * price.output +
      usage.cacheRead * price.cacheRead +
      usage.cacheWrite * price.cacheWrite) /
    1_000_000
  );
}
