import { Inject, Injectable } from '@nestjs/common';
import type { Firestore } from 'firebase-admin/firestore';
import { FIRESTORE } from '../../firebase/firebase.constants';
import { Collections } from '../../firebase/firestore-collections';
import { FirestoreRepository, type FirestoreDoc } from '../../firebase/firestore.repository';
import { DEFAULT_MESSAGING_SETTINGS, type MessagingSettings } from './entities/chat.entity';

const SETTINGS_DOC_ID = 'messaging';
/** Read on every webhook and every reply; an admin's change shows up on
 * every instance within this long. */
const CACHE_TTL_MS = 30_000;

type SettingsDoc = FirestoreDoc & Partial<MessagingSettings>;

@Injectable()
export class MessagingSettingsService {
  private readonly repo: FirestoreRepository<SettingsDoc>;
  private cached: { value: MessagingSettings; at: number } | null = null;

  constructor(@Inject(FIRESTORE) firestore: Firestore) {
    this.repo = new FirestoreRepository<SettingsDoc>(firestore, Collections.SETTINGS);
  }

  async get(): Promise<MessagingSettings> {
    if (this.cached && Date.now() - this.cached.at < CACHE_TTL_MS) return this.cached.value;
    const doc = await this.repo.findById(SETTINGS_DOC_ID);
    const value: MessagingSettings = { ...DEFAULT_MESSAGING_SETTINGS };
    for (const key of Object.keys(DEFAULT_MESSAGING_SETTINGS) as (keyof MessagingSettings)[]) {
      if (doc?.[key] !== undefined) (value as unknown as Record<string, unknown>)[key] = doc[key];
    }
    this.cached = { value, at: Date.now() };
    return value;
  }

  async update(changes: Partial<MessagingSettings>): Promise<MessagingSettings> {
    await this.repo.patch(SETTINGS_DOC_ID, changes);
    this.cached = null;
    return this.get();
  }
}
