import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { FIRESTORE } from '../../firebase/firebase.constants';
import { Collections } from '../../firebase/firestore-collections';
import { FirestoreRepository } from '../../firebase/firestore.repository';
import { CreateDiscountCodeDto } from './dto/create-discount-code.dto';
import { UpdateDiscountCodeDto } from './dto/update-discount-code.dto';
import { DiscountCode, DiscountType } from './entities/discount-code.entity';

export interface DiscountValidation {
  valid: boolean;
  code?: string;
  type?: DiscountType;
  value?: number;
  discountAmount: number;
  message?: string;
}

/** Today in Venezuela as YYYY-MM-DD: a code valid "until the 15th" works the
 * whole 15th there, not only until 8 p.m. (midnight UTC). */
export function todayInVenezuela(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(now);
}

function normalize(code: string): string {
  return code.trim().toUpperCase();
}

/** Why a code can't be used right now — undefined when it can. */
function unusableReason(found: DiscountCode | null | undefined): string | undefined {
  if (!found || !found.enabled) return 'Código de descuento inválido';
  if (found.expiresOn && found.expiresOn < todayInVenezuela()) {
    return 'Este código de descuento ya venció';
  }
  if (found.maxUses != null && (found.usedCount ?? 0) >= found.maxUses) {
    return 'Este código de descuento ya alcanzó su límite de usos';
  }
  return undefined;
}

/** Capped at the subtotal either way: a discount can never make a total negative. */
function discountFor(found: DiscountCode, subtotal: number): number {
  return Math.min(
    subtotal,
    found.type === DiscountType.PERCENTAGE
      ? Math.round(((subtotal * found.value) / 100) * 100) / 100
      : found.value,
  );
}

@Injectable()
export class DiscountCodesService {
  private readonly repo: FirestoreRepository<DiscountCode>;

  constructor(@Inject(FIRESTORE) firestore: Firestore) {
    this.repo = new FirestoreRepository<DiscountCode>(firestore, Collections.DISCOUNT_CODES);
  }

  async list(): Promise<DiscountCode[]> {
    const all = await this.repo.findAll();
    return all.sort((a, b) => a.code.localeCompare(b.code));
  }

  async create(dto: CreateDiscountCodeDto): Promise<DiscountCode> {
    assertValidValue(dto.type, dto.value);
    const id = normalize(dto.code);
    const existing = await this.repo.findById(id);
    if (existing) throw new BadRequestException(`Discount code "${id}" already exists`);
    return this.repo.create(
      {
        code: id,
        type: dto.type,
        value: dto.value,
        enabled: dto.enabled ?? true,
        expiresOn: dto.expiresOn ?? null,
        maxUses: dto.maxUses ?? null,
        usedCount: 0,
      },
      id,
    );
  }

  async update(id: string, dto: UpdateDiscountCodeDto): Promise<DiscountCode> {
    const current = await this.repo.getOrThrow(id, 'Discount code not found');
    assertValidValue(dto.type ?? current.type, dto.value ?? current.value);
    return this.repo.update(id, dto);
  }

  async delete(id: string): Promise<void> {
    await this.repo.getOrThrow(id, 'Discount code not found');
    await this.repo.delete(id);
  }

  /** The cart's "Aplicar" check. Advisory only — checkout re-checks and
   * counts the use atomically (beginRedemption). */
  async validate(code: string, subtotal: number): Promise<DiscountValidation> {
    const found = await this.repo.findById(normalize(code));
    const reason = unusableReason(found);
    if (!found || reason) return { valid: false, discountAmount: 0, message: reason };
    return {
      valid: true,
      code: found.code,
      type: found.type,
      value: found.value,
      discountAmount: discountFor(found, subtotal),
    };
  }

  /** Using a code at checkout, in two halves: this reads it inside the
   * order's transaction (Firestore wants every read before the first
   * write), and the returned `redeem` checks it against the order's
   * subtotal and counts the use in that same transaction — two checkouts
   * racing for a code's last use can't both get it. */
  async beginRedemption(
    tx: Transaction,
    code: string,
  ): Promise<(subtotal: number) => { code: string; discountAmount: number }> {
    const ref = this.repo.doc(normalize(code));
    const snap = await tx.get(ref);
    const found = snap.exists ? ({ ...snap.data(), id: snap.id } as DiscountCode) : undefined;
    return (subtotal) => {
      const reason = unusableReason(found);
      if (!found || reason) throw new BadRequestException(reason);
      tx.update(ref, { usedCount: (found.usedCount ?? 0) + 1 });
      return { code: found.code, discountAmount: discountFor(found, subtotal) };
    };
  }

  /** Gives back the use a cancelled order took — same two halves as
   * beginRedemption: read now, write once the caller starts writing. */
  async beginRelease(tx: Transaction, code: string): Promise<() => void> {
    const ref = this.repo.doc(normalize(code));
    const snap = await tx.get(ref);
    return () => {
      // A code deleted since has no count left to give back to.
      if (!snap.exists) return;
      const usedCount = (snap.data() as DiscountCode).usedCount ?? 0;
      tx.update(ref, { usedCount: Math.max(0, usedCount - 1) });
    };
  }
}

function assertValidValue(type: DiscountType, value: number): void {
  if (type === DiscountType.PERCENTAGE && value > 100) {
    throw new BadRequestException('Un descuento porcentual no puede superar el 100 %');
  }
}
