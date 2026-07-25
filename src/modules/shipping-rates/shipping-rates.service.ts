import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { Firestore } from 'firebase-admin/firestore';
import { FIRESTORE } from '../../firebase/firebase.constants';
import { Collections } from '../../firebase/firestore-collections';
import { FirestoreRepository } from '../../firebase/firestore.repository';
import { CreateShippingRateDto } from './dto/create-shipping-rate.dto';
import { UpdateShippingRateDto } from './dto/update-shipping-rate.dto';
import { ShippingRate } from './entities/shipping-rate.entity';

/** Strips combining diacritical marks left behind by NFD normalization. */
function stripDiacritics(value: string): string {
  return Array.from(value)
    .filter((ch) => {
      const code = ch.codePointAt(0)!;
      return code < 0x0300 || code > 0x036f;
    })
    .join('');
}

function slug(value: string): string {
  return stripDiacritics(value.normalize('NFD'))
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function rateId(state: string, city: string): string {
  return `${slug(state)}--${city === '*' ? '*' : slug(city)}`;
}

export interface ShippingQuote {
  amount: number;
  matched: boolean;
}

@Injectable()
export class ShippingRatesService {
  private readonly repo: FirestoreRepository<ShippingRate>;

  constructor(@Inject(FIRESTORE) firestore: Firestore) {
    this.repo = new FirestoreRepository<ShippingRate>(firestore, Collections.SHIPPING_RATES);
  }

  async list(): Promise<ShippingRate[]> {
    const all = await this.repo.findAll();
    return all.sort((a, b) => a.state.localeCompare(b.state) || a.city.localeCompare(b.city));
  }

  async create(dto: CreateShippingRateDto): Promise<ShippingRate> {
    const id = rateId(dto.state, dto.city);
    const existing = await this.repo.findById(id);
    if (existing) {
      throw new BadRequestException(
        `A shipping rate for ${dto.state} / ${dto.city} already exists`,
      );
    }
    return this.repo.create(dto, id);
  }

  async update(id: string, dto: UpdateShippingRateDto): Promise<ShippingRate> {
    await this.repo.getOrThrow(id, 'Shipping rate not found');
    return this.repo.update(id, dto);
  }

  async delete(id: string): Promise<void> {
    await this.repo.getOrThrow(id, 'Shipping rate not found');
    await this.repo.delete(id);
  }

  /** Exact (state, city) match first, then the state-wide "*" default, else unmatched (amount 0). */
  async quote(state: string, city: string): Promise<ShippingQuote> {
    const exact = await this.repo.findById(rateId(state, city));
    if (exact) return { amount: exact.amount, matched: true };
    const stateDefault = await this.repo.findById(rateId(state, '*'));
    if (stateDefault) return { amount: stateDefault.amount, matched: true };
    return { amount: 0, matched: false };
  }
}
