import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Firestore } from 'firebase-admin/firestore';
import * as QRCode from 'qrcode';
import { newestFirst, periodWhere } from '../../common/dto/period-query.dto';
import { slugify } from '../../common/utils/slug';
import { EnvConfig } from '../../config/env.validation';
import { FIRESTORE } from '../../firebase/firebase.constants';
import { Collections } from '../../firebase/firestore-collections';
import { FirestoreRepository } from '../../firebase/firestore.repository';
import { UsersService } from '../users/users.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { UpdateReviewSettingsDto } from './dto/update-review-settings.dto';
import {
  DEFAULT_REVIEW_SOURCES,
  OTHER_SOURCE,
  Review,
  ReviewSettings,
  ReviewSource,
} from './entities/review.entity';

const SETTINGS_DOC_ID = 'reviews';
/** The public form is read on every scan of the store's QR: one instance
 * reuses what it read for this long (an admin's edit on that same instance
 * shows at once). */
const FORM_MAX_AGE_MS = 60 * 1000;
/** Where the store's QR points (PUBLIC_SITE_URL + this). */
export const REVIEW_PAGE_PATH = '/resena';

/** A customer left a review — the admins get an email (EmailListener). */
export const REVIEW_CREATED_EVENT = 'review.created';
export type ReviewCreatedEvent = Omit<Review, 'id' | 'updatedAt'>;

export interface ReviewForm {
  /** The editable answers, then "Otro". */
  sources: ReviewSource[];
  /** Sellers a customer can say attended them — only their name. */
  sellers: { id: string; name: string }[];
}

/** Trimmed, and absent when empty. */
function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

@Injectable()
export class ReviewsService {
  private readonly repo: FirestoreRepository<Review>;
  private readonly settingsRepo: FirestoreRepository<ReviewSettings>;
  private formCache: { form: ReviewForm; at: number } | null = null;

  constructor(
    @Inject(FIRESTORE) firestore: Firestore,
    private readonly usersService: UsersService,
    private readonly config: ConfigService<EnvConfig, true>,
    private readonly events: EventEmitter2,
  ) {
    this.repo = new FirestoreRepository<Review>(firestore, Collections.REVIEWS);
    this.settingsRepo = new FirestoreRepository<ReviewSettings>(firestore, Collections.SETTINGS);
  }

  async form(): Promise<ReviewForm> {
    if (this.formCache && Date.now() - this.formCache.at < FORM_MAX_AGE_MS) {
      return this.formCache.form;
    }
    const [sources, sellers] = await Promise.all([this.sources(), this.sellers()]);
    const form = { sources: [...sources, OTHER_SOURCE], sellers };
    this.formCache = { form, at: Date.now() };
    return form;
  }

  /** A seller without a name in their profile isn't listed: the form never
   * shows an email. */
  private async sellers(): Promise<ReviewForm['sellers']> {
    const users = await this.usersService.findSellers();
    return users
      .filter((user) => user.active !== false && user.displayName?.trim())
      .map((user) => ({ id: user.id, name: user.displayName!.trim() }))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }

  private async sources(): Promise<ReviewSource[]> {
    const settings = await this.settingsRepo.findById(SETTINGS_DOC_ID);
    return settings?.sources ?? DEFAULT_REVIEW_SOURCES;
  }

  async create(dto: CreateReviewDto): Promise<void> {
    // Only a bot fills the hidden field: it gets the same answer as anyone,
    // and nothing is saved.
    if (dto.website?.trim()) return;

    const form = await this.form();
    const source = form.sources.find((s) => s.id === dto.sourceId);
    if (!source) throw new BadRequestException('Elige cómo llegaste a la tienda.');
    const seller = dto.sellerId ? form.sellers.find((s) => s.id === dto.sellerId) : undefined;
    if (dto.sellerId && !seller) throw new BadRequestException('Ese vendedor no está en la lista.');

    const saved = await this.repo.create({
      rating: dto.rating,
      sourceId: source.id,
      sourceLabel: source.label,
      sourceOther: source.id === OTHER_SOURCE.id ? clean(dto.sourceOther) : undefined,
      sellerId: seller?.id,
      sellerName: seller?.name,
      message: clean(dto.message),
      customerName: clean(dto.customerName),
      customerPhone: dto.customerPhone,
    });
    this.events.emit(REVIEW_CREATED_EVENT, {
      rating: saved.rating,
      sourceId: saved.sourceId,
      sourceLabel: saved.sourceLabel,
      sourceOther: saved.sourceOther,
      sellerId: saved.sellerId,
      sellerName: saved.sellerName,
      message: saved.message,
      customerName: saved.customerName,
      customerPhone: saved.customerPhone,
      // The moment it was sent: the saved doc's timestamp is the server's.
      createdAt: new Date(),
    } satisfies ReviewCreatedEvent);
  }

  async list(period: { from?: string; to?: string }): Promise<Review[]> {
    const reviews = await this.repo.findAll({
      where: periodWhere('createdAt', period, 'timestamp'),
    });
    return reviews.sort(newestFirst);
  }

  async delete(id: string): Promise<void> {
    await this.repo.getOrThrow(id, 'Reseña no encontrada');
    await this.repo.delete(id);
  }

  async settings(): Promise<{ sources: ReviewSource[] }> {
    return { sources: await this.sources() };
  }

  /** An answer keeps its id when renamed, so its past reviews stay grouped
   * with it; a new one gets an id from its name. */
  async updateSettings(dto: UpdateReviewSettingsDto): Promise<{ sources: ReviewSource[] }> {
    const ids = new Set<string>([OTHER_SOURCE.id]);
    const labels = new Set<string>([OTHER_SOURCE.label.toLocaleLowerCase('es')]);
    const sources = dto.sources.map((input) => {
      const label = input.label.trim().replace(/\s+/g, ' ');
      if (!label) throw new BadRequestException('Cada opción necesita un nombre.');
      const key = label.toLocaleLowerCase('es');
      if (key === OTHER_SOURCE.label.toLocaleLowerCase('es')) {
        throw new BadRequestException('"Otro" ya aparece solo, al final de la lista.');
      }
      if (labels.has(key)) throw new BadRequestException(`"${label}" está repetida.`);
      labels.add(key);

      const base = input.id?.trim() || slugify(label) || 'opcion';
      let id = base;
      for (let n = 2; ids.has(id); n++) id = `${base}-${n}`;
      ids.add(id);
      return { id, label };
    });

    await this.settingsRepo.update(SETTINGS_DOC_ID, { sources });
    this.formCache = null;
    return { sources };
  }

  /** The store's QR, ready to print. */
  async qr(): Promise<{ url: string; qrImageDataUrl: string }> {
    const site = this.config.get('PUBLIC_SITE_URL', { infer: true }).replace(/\/+$/, '');
    const url = `${site}${REVIEW_PAGE_PATH}`;
    return { url, qrImageDataUrl: await QRCode.toDataURL(url, { margin: 1, width: 512 }) };
  }
}
