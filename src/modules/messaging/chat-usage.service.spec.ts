import { Collections } from '../../firebase/firestore-collections';
import { FakeFirestore } from '../../test/fake-firestore';
import { estimateCostUsd } from './agent/model-pricing';
import { ChatUsageService, hourKey } from './chat-usage.service';
import { DEFAULT_MESSAGING_SETTINGS, type ChatReplyUsage } from './entities/chat.entity';

// 10:30 a.m. in Caracas on Oct 23 (UTC−4).
const NOW = new Date('2026-10-23T14:30:00Z');
const tokens = { input: 1_000, output: 200, cacheRead: 5_000, cacheWrite: 0 };

function setup() {
  const firestore = new FakeFirestore();
  return { firestore, usage: new ChatUsageService(firestore as never) };
}

describe('estimateCostUsd', () => {
  it('prices each kind of token at the model’s rate', () => {
    // Opus 5.5: 1000 × $4 + 200 × $20 + 5000 × $0.20 per million.
    expect(estimateCostUsd('claude-opus-5-5', tokens)).toBeCloseTo(0.009, 9);
    expect(estimateCostUsd('claude-haiku-5-5', tokens)).toBeCloseTo(0.00025, 9);
  });
});

describe('ChatUsageService', () => {
  it('counts replies per hour and per store day, starting over in a new one', async () => {
    const { firestore, usage } = setup();
    const conversation = { id: 'c1', replyUsage: null as ChatReplyUsage | null };
    const read = () =>
      (firestore.read(Collections.CHAT_CONVERSATIONS, 'c1') as { replyUsage: ChatReplyUsage })
        .replyUsage;

    await usage.record(conversation, 'claude-haiku-5-5', tokens, NOW);
    conversation.replyUsage = read();
    await usage.record(conversation, 'claude-haiku-5-5', tokens, NOW);
    expect(read()).toEqual({
      day: '2026-10-23',
      repliesToday: 2,
      costTodayUsd: expect.closeTo(0.0005, 9),
      hour: '2026-10-23T14',
      repliesThisHour: 2,
    });

    // An hour later the hour starts over; the day doesn't.
    conversation.replyUsage = read();
    await usage.record(conversation, 'claude-haiku-5-5', tokens, new Date('2026-10-23T15:05:00Z'));
    expect(read()).toEqual(
      expect.objectContaining({ repliesToday: 3, hour: '2026-10-23T15', repliesThisHour: 1 }),
    );

    // 9 p.m. in Caracas is already the next UTC day, but the same store day.
    conversation.replyUsage = read();
    await usage.record(conversation, 'claude-haiku-5-5', tokens, new Date('2026-10-24T01:00:00Z'));
    expect(read()).toEqual(expect.objectContaining({ day: '2026-10-23', repliesToday: 4 }));
    expect(await usage.today(NOW)).toEqual(
      expect.objectContaining({ day: '2026-10-23', replies: 4, inputTokens: 4_000 }),
    );
  });

  it('names the limit a chat has reached, the chat’s own before the day’s budget', async () => {
    const { firestore, usage } = setup();
    const settings = DEFAULT_MESSAGING_SETTINGS;
    const replyUsage = (counts: Partial<ChatReplyUsage>): ChatReplyUsage => ({
      day: '2026-10-23',
      repliesToday: 0,
      costTodayUsd: 0,
      hour: hourKey(NOW),
      repliesThisHour: 0,
      ...counts,
    });

    expect(await usage.limitReached({ replyUsage: null }, settings, NOW)).toBeNull();
    expect(
      await usage.limitReached({ replyUsage: replyUsage({ repliesThisHour: 20 }) }, settings, NOW),
    ).toBe('chat_hour');
    expect(
      await usage.limitReached({ replyUsage: replyUsage({ repliesToday: 60 }) }, settings, NOW),
    ).toBe('chat_day');

    firestore.seed(Collections.MESSAGING_USAGE, '2026-10-23', { costUsd: 5 });
    expect(await usage.limitReached({ replyUsage: null }, settings, NOW)).toBe('daily_budget');
    expect(
      await usage.limitReached({ replyUsage: replyUsage({ repliesThisHour: 20 }) }, settings, NOW),
    ).toBe('chat_hour');
  });
});
