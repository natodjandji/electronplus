import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { DocumentReference, Firestore, Transaction } from 'firebase-admin/firestore';
import { FIRESTORE } from '../../firebase/firebase.constants';
import { Collections } from '../../firebase/firestore-collections';
import { FirestoreRepository } from '../../firebase/firestore.repository';
import { CreateDiscountCodeDto } from './dto/create-discount-code.dto';
import { UpdateDiscountCodeDto } from './dto/update-discount-code.dto';
import {
  DISCOUNT_REDEMPTIONS_SUBCOLLECTION,
  DiscountCode,
  DiscountRedemption,
  DiscountType,
} from './entities/discount-code.entity';

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

/** Why a code can't be used right now by this customer (whose past uses of
 * it are `redemption`) — undefined when it can. */
function unusableReason(
  found: DiscountCode | null | undefined,
  redemption: DiscountRedemption | undefined,
): string | undefined {
  if (!found || !found.enabled) return 'Código de descuento inválido';
  if (found.expiresOn && found.expiresOn < todayInVenezuela()) {
    return 'Este código de descuento ya venció';
  }
  if (found.maxUses != null && (found.usedCount ?? 0) >= found.maxUses) {
    return 'Este código de descuento ya alcanzó su límite de usos';
  }
  if (found.oncePerCustomer && (redemption?.orderIds.length ?? 0) > 0) {
    return 'Ya usaste este código de descuento en otro pedido';
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

  constructor(@Inject(FIRESTORE) private readonly firestore: Firestore) {
    this.repo = new FirestoreRepository<DiscountCode>(firestore, Collections.DISCOUNT_CODES);
  }

  private redemptionRef(code: string, userId: string): DocumentReference {
    return this.repo.doc(code).collection(DISCOUNT_REDEMPTIONS_SUBCOLLECTION).doc(userId);
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
        oncePerCustomer: dto.oncePerCustomer ?? false,
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
    // Its redemptions too: a code re-created later under the same name is
    // a new promotion, not one every past customer already used.
    await this.firestore.recursiveDelete(this.repo.doc(id));
  }

  /** The cart's "Aplicar" check. Advisory only — checkout re-checks and
   * counts the use atomically (beginRedemption). */
  async validate(code: string, subtotal: number, userId: string): Promise<DiscountValidation> {
    const found = await this.repo.findById(normalize(code));
    const redemption = found?.oncePerCustomer
      ? ((await this.redemptionRef(found.code, userId).get()).data() as
          DiscountRedemption | undefined)
      : undefined;
    const reason = unusableReason(found, redemption);
    if (!found || reason) return { valid: false, discountAmount: 0, message: reason };
    return {
      valid: true,
      code: found.code,
      type: found.type,
      value: found.value,
      discountAmount: discountFor(found, subtotal),
    };
  }

  /** Using a code at checkout, in two halves: this reads it (and this
   * customer's past uses of it) inside the order's transaction — Firestore
   * wants every read before the first write — and the returned `redeem`
   * checks it against the order's subtotal and records the use in that
   * same transaction. Two checkouts racing for a code's last use, or one
   * customer's two tabs racing for a once-per-customer code, can't both
   * get it. Uses are recorded for every code, so switching one to
   * once-per-customer later still counts them. */
  async beginRedemption(
    tx: Transaction,
    code: string,
    userId: string,
  ): Promise<(subtotal: number, orderId: string) => { code: string; discountAmount: number }> {
    const ref = this.repo.doc(normalize(code));
    const redemptionRef = this.redemptionRef(normalize(code), userId);
    const [snap, redemptionSnap] = await tx.getAll(ref, redemptionRef);
    const found = snap.exists ? ({ ...snap.data(), id: snap.id } as DiscountCode) : undefined;
    const redemption = redemptionSnap.data() as DiscountRedemption | undefined;
    return (subtotal, orderId) => {
      const reason = unusableReason(found, redemption);
      if (!found || reason) throw new BadRequestException(reason);
      tx.update(ref, { usedCount: (found.usedCount ?? 0) + 1 });
      tx.set(redemptionRef, {
        orderIds: [...(redemption?.orderIds ?? []), orderId],
      } satisfies DiscountRedemption);
      return { code: found.code, discountAmount: discountFor(found, subtotal) };
    };
  }

  /** Gives back the use a cancelled order took — same two halves as
   * beginRedemption: read now, write once the caller starts writing. */
  async beginRelease(
    tx: Transaction,
    code: string,
    userId: string,
    orderId: string,
  ): Promise<() => void> {
    const ref = this.repo.doc(normalize(code));
    const redemptionRef = this.redemptionRef(normalize(code), userId);
    const [snap, redemptionSnap] = await tx.getAll(ref, redemptionRef);
    return () => {
      // A code deleted since has no count left to give back to.
      if (!snap.exists) return;
      const usedCount = (snap.data() as DiscountCode).usedCount ?? 0;
      tx.update(ref, { usedCount: Math.max(0, usedCount - 1) });

      const orderIds = (redemptionSnap.data() as DiscountRedemption | undefined)?.orderIds ?? [];
      const remaining = orderIds.filter((id) => id !== orderId);
      if (remaining.length > 0) {
        tx.set(redemptionRef, { orderIds: remaining } satisfies DiscountRedemption);
      } else if (redemptionSnap.exists) {
        tx.delete(redemptionRef);
      }
    };
  }
}

function assertValidValue(type: DiscountType, value: number): void {
  if (type === DiscountType.PERCENTAGE && value > 100) {
    throw new BadRequestException('Un descuento porcentual no puede superar el 100 %');
  }
}
