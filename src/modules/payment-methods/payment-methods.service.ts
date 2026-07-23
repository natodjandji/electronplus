import { Inject, Injectable } from '@nestjs/common';
import type { Firestore } from 'firebase-admin/firestore';
import { FIRESTORE } from '../../firebase/firebase.constants';
import { Collections } from '../../firebase/firestore-collections';
import { FirestoreRepository } from '../../firebase/firestore.repository';
import { PaymentMethod } from '../payments/entities/payment.entity';
import { UpdatePaymentMethodDto } from './dto/update-payment-method.dto';
import { PaymentMethodConfig } from './entities/payment-method.entity';

const DISPLAY_ORDER = ['transferencia', 'pago-movil', 'efectivo', 'credito'];

/** Seed data — placeholders until an admin customizes them via the payment-methods panel. */
const DEFAULTS: Record<string, Omit<PaymentMethodConfig, 'id' | 'createdAt' | 'updatedAt'>> = {
  transferencia: {
    backendMethod: PaymentMethod.BANK_TRANSFER,
    label: 'Transferencia bancaria',
    details: [
      'Banco: Banesco',
      'Cuenta corriente: 0134-0000-00-0000000000',
      'Titular: Electron Plus, C.A.',
      'RIF: J-000000000',
    ],
    needsReference: true,
    needsProof: true,
    enabled: true,
  },
  'pago-movil': {
    backendMethod: PaymentMethod.PAGO_MOVIL,
    label: 'Pago móvil',
    details: ['Banco: Banesco (0134)', 'Teléfono: 0414-0000000', 'RIF/Cédula: J-000000000'],
    needsReference: true,
    needsProof: true,
    enabled: true,
  },
  efectivo: {
    backendMethod: PaymentMethod.CASH,
    label: 'Efectivo en tienda',
    details: ['Paga en efectivo al retirar tu pedido en tienda o al recibirlo.'],
    needsReference: false,
    needsProof: false,
    enabled: true,
  },
  credito: {
    backendMethod: PaymentMethod.CREDIT_B2B,
    label: 'Crédito B2B (mayoristas)',
    details: ['Se factura a tu línea de crédito aprobada — sin pago inmediato.'],
    needsReference: false,
    needsProof: false,
    enabled: true,
  },
};

@Injectable()
export class PaymentMethodsService {
  private readonly repo: FirestoreRepository<PaymentMethodConfig>;

  constructor(@Inject(FIRESTORE) firestore: Firestore) {
    this.repo = new FirestoreRepository<PaymentMethodConfig>(firestore, Collections.PAYMENT_METHODS);
  }

  private async ensureSeeded(): Promise<void> {
    await Promise.all(
      Object.entries(DEFAULTS).map(async ([id, data]) => {
        const existing = await this.repo.findById(id);
        if (!existing) await this.repo.create(data, id);
      }),
    );
  }

  async list(): Promise<PaymentMethodConfig[]> {
    await this.ensureSeeded();
    const all = await this.repo.findAll();
    return all.sort((a, b) => DISPLAY_ORDER.indexOf(a.id) - DISPLAY_ORDER.indexOf(b.id));
  }

  async update(id: string, dto: UpdatePaymentMethodDto): Promise<PaymentMethodConfig> {
    await this.ensureSeeded();
    await this.repo.getOrThrow(id, 'Payment method not found');
    return this.repo.update(id, dto);
  }
}
