import Anthropic from '@anthropic-ai/sdk';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ChatChannel, ChatMessage, MessagingSettings } from '../entities/chat.entity';
import { emptyUsage, estimateCostUsd, type TokenUsage } from './model-pricing';
import {
  clipReply,
  keepKnownLinks,
  linkHost,
  linkHosts,
  truncateCustomerText,
} from './reply-guards';
import { formatRef, runSalesTool, SALES_TOOLS, type SalesToolDeps } from './sales-tools';
import { chatContext, SALES_SYSTEM_PROMPT } from './system-prompt';

export const ANTHROPIC_CLIENT = 'ANTHROPIC_CLIENT';

/** Rounds of tool calls in one reply. A sale takes two or three (search,
 * send, cart); past this something is looping. */
export const MAX_ROUNDS = 6;
/** Thinking counts against this too; a chat reply itself is short. */
const MAX_TOKENS = 6_000;
/** A reply that has cost this much is going in circles: it stops before the
 * next round. A normal one costs about 2 cents on Opus and a twentieth of a
 * cent on Haiku. */
export const MAX_REPLY_COST_USD = 0.25;
/** Messages one reply sends at most; more than this is rambling. */
export const MAX_TEXTS_PER_REPLY = 3;

export interface CustomerImage {
  data: Buffer;
  mimeType: string;
}

export interface SalesTurnInput {
  channel: ChatChannel;
  customerName?: string | null;
  /** The chat so far, oldest first, ending with the messages to answer. */
  history: ChatMessage[];
  /** Photos among the messages to answer, by message id. */
  images: Map<string, CustomerImage>;
  settings: MessagingSettings;
  now: Date;
  tools: SalesToolDeps;
  /** Sends a text to the customer right away. */
  sendText(text: string): Promise<void>;
  /** Where the tokens add up as each round comes back, so a run that fails
   * halfway still counts what it used. */
  usage?: TokenUsage;
}

export interface SalesTurnResult {
  repliedWithText: boolean;
  handedOver: boolean;
  /** Claude's, or "cost_limit" when the reply hit MAX_REPLY_COST_USD. */
  stopReason: string | null;
  usage: TokenUsage;
}

/**
 * One reply in a chat, by Claude with the sales tools. Every run starts from
 * the stored chat as plain text and only appends within itself (each
 * response, thinking included, goes back unchanged with its tool results),
 * so thinking stays valid across the run and the instructions plus tools
 * stay a cached prefix shared by every chat.
 */
@Injectable()
export class SalesAgentService {
  private readonly logger = new Logger(SalesAgentService.name);

  constructor(@Inject(ANTHROPIC_CLIENT) private readonly client: Anthropic | null) {}

  isConfigured(): boolean {
    return this.client !== null;
  }

  async reply(input: SalesTurnInput): Promise<SalesTurnResult> {
    if (!this.client) throw new Error('ANTHROPIC_API_KEY no está configurada');
    const messages = buildConversation(input.history, input.images);
    const result: SalesTurnResult = {
      repliedWithText: false,
      handedOver: false,
      stopReason: null,
      usage: input.usage ?? emptyUsage(),
    };
    if (messages.length === 0 || messages[messages.length - 1].role !== 'user') return result;
    // Links the reply may carry: the store's pages, plus whatever its tools
    // return during the run.
    const allowedHosts = new Set(
      [linkHost(input.tools.siteUrl)].filter((h): h is string => h !== null),
    );
    let textsSent = 0;

    const system: Anthropic.TextBlockParam[] = [
      { type: 'text', text: SALES_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
      {
        type: 'text',
        text: chatContext({
          channel: input.channel,
          customerName: input.customerName,
          now: input.now,
          extraInstructions: input.settings.extraInstructions,
        }),
      },
    ];

    for (let round = 0; round < MAX_ROUNDS; round++) {
      if (estimateCostUsd(input.settings.model, result.usage) >= MAX_REPLY_COST_USD) {
        this.logger.warn(`Reply stopped at its cost limit after ${round} rounds`);
        result.stopReason = 'cost_limit';
        break;
      }
      const response = await this.client.messages.create({
        model: input.settings.model,
        max_tokens: MAX_TOKENS,
        system,
        tools: SALES_TOOLS,
        messages,
        output_config: { effort: input.settings.effort },
        // Caches the conversation so far, so each tool round re-reads it cheaply.
        cache_control: { type: 'ephemeral' },
      });
      addUsage(result.usage, response.usage);
      result.stopReason = response.stop_reason;

      // A refusal can cut a tool call off mid-input: never run that turn's tools.
      if (response.stop_reason === 'refusal') break;

      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text.trim())
        .filter(Boolean)
        .join('\n\n');
      const { text: safe, removed } = keepKnownLinks(text, allowedHosts);
      if (removed.length > 0) {
        this.logger.warn(`Removed links the store didn't provide: ${removed.join(', ')}`);
      }
      if (safe && textsSent < MAX_TEXTS_PER_REPLY) {
        await input.sendText(clipReply(safe));
        textsSent++;
        result.repliedWithText = true;
      }

      const calls = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
      );
      // A tool input cut off at max_tokens can parse as a valid partial object.
      if (calls.length === 0 || response.stop_reason !== 'tool_use') break;

      messages.push({ role: 'assistant', content: response.content });
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const call of calls) {
        let outcome;
        try {
          outcome = await runSalesTool(call.name, call.input, input.tools);
        } catch (error) {
          this.logger.error(`Tool ${call.name} failed`, error as Error);
          outcome = {
            content: 'La herramienta falló. Intenta de nuevo o pasa con un asesor.',
            isError: true,
          };
        }
        if (outcome.handedOver) result.handedOver = true;
        for (const host of linkHosts(outcome.content)) allowedHosts.add(host);
        results.push({
          type: 'tool_result',
          tool_use_id: call.id,
          content: outcome.content,
          ...(outcome.isError ? { is_error: true } : {}),
        });
      }
      messages.push({ role: 'user', content: results });
    }
    return result;
  }
}

function addUsage(total: TokenUsage, usage: Anthropic.Usage): void {
  total.input += usage.input_tokens;
  total.output += usage.output_tokens;
  total.cacheRead += usage.cache_read_input_tokens ?? 0;
  total.cacheWrite += usage.cache_creation_input_tokens ?? 0;
}

const CLAUDE_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const;
type ClaudeImageType = (typeof CLAUDE_IMAGE_TYPES)[number];

/** The stored chat as Claude turns: the customer is the user; the assistant
 * and the staff are the assistant (staff messages labeled as such). Turns of
 * the same side merge, and the conversation starts at the customer's first
 * message. */
export function buildConversation(
  history: ChatMessage[],
  images: Map<string, CustomerImage>,
): Anthropic.MessageParam[] {
  const turns: { role: 'user' | 'assistant'; blocks: Anthropic.ContentBlockParam[] }[] = [];
  for (const message of history) {
    const role = message.author === 'customer' ? 'user' : 'assistant';
    const blocks: Anthropic.ContentBlockParam[] = [];
    if (message.author === 'customer') {
      const image = images.get(message.id);
      if (image && (CLAUDE_IMAGE_TYPES as readonly string[]).includes(image.mimeType)) {
        blocks.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: image.mimeType as ClaudeImageType,
            data: image.data.toString('base64'),
          },
        });
      }
      const text = message.text.trim() || (message.kind === 'image' ? (image ? '' : '[Foto]') : '');
      if (text) blocks.push({ type: 'text', text: truncateCustomerText(text) });
    } else if (message.kind === 'products' && message.products?.length) {
      const list = message.products
        .map((p) => `${p.name} (id ${p.id}, ${formatRef(p.price)})`)
        .join('; ');
      blocks.push({ type: 'text', text: `[Tarjetas de producto enviadas: ${list}]` });
    } else if (message.text.trim()) {
      blocks.push({
        type: 'text',
        text:
          message.author === 'human'
            ? `[Respondió una persona de la tienda] ${message.text.trim()}`
            : message.text.trim(),
      });
    }
    if (blocks.length === 0) continue;
    const last = turns[turns.length - 1];
    if (last?.role === role) last.blocks.push(...blocks);
    else if (turns.length > 0 || role === 'user') turns.push({ role, blocks });
  }
  return turns.map((t) => ({ role: t.role, content: t.blocks }));
}
