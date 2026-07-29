import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { Firestore } from 'firebase-admin/firestore';
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
    const id = dto.code.trim().toUpperCase();
    const existing = await this.repo.findById(id);
    if (existing) throw new BadRequestException(`Discount code "${id}" already exists`);
    return this.repo.create(
      { code: id, type: dto.type, value: dto.value, enabled: dto.enabled ?? true },
      id,
    );
  }

  async update(id: string, dto: UpdateDiscountCodeDto): Promise<DiscountCode> {
    await this.repo.getOrThrow(id, 'Discount code not found');
    return this.repo.update(id, dto);
  }

  async delete(id: string): Promise<void> {
    await this.repo.getOrThrow(id, 'Discount code not found');
    await this.repo.delete(id);
  }

  async validate(code: string, subtotal: number): Promise<DiscountValidation> {
    const found = await this.repo.findById(code.trim().toUpperCase());
    if (!found || !found.enabled) {
      return { valid: false, discountAmount: 0, message: 'Código de descuento inválido' };
    }
    const discountAmount =
      found.type === DiscountType.PERCENTAGE
        ? Math.round(((subtotal * found.value) / 100) * 100) / 100
        : Math.min(found.value, subtotal);
    return { valid: true, code: found.code, type: found.type, value: found.value, discountAmount };
  }
}
