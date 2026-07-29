import { Inject, Injectable } from '@nestjs/common';
import type { Firestore } from 'firebase-admin/firestore';
import { slugify } from '../../common/utils/slug';
import { FIRESTORE } from '../../firebase/firebase.constants';
import { Collections } from '../../firebase/firestore-collections';
import { FirestoreRepository } from '../../firebase/firestore.repository';
import { PaymentMethod } from '../payments/entities/payment.entity';
import { CreatePaymentMethodDto } from './dto/create-payment-method.dto';
import { UpdatePaymentMethodDto } from './dto/update-payment-method.dto';
import { PaymentMethodConfig } from './entities/payment-method.entity';

const DISPLAY_ORDER = ['transferencia', 'pago-movil', 'efectivo', 'credito', 'paypal'];

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
  // Confirmed via PayPal itself, not a reference/proof upload — no manual
  // admin verification step, so neither flag applies.
  paypal: {
    backendMethod: PaymentMethod.PAYPAL,
    label: 'PayPal',
    details: ['Pagas de forma segura a través de PayPal.'],
    needsReference: false,
    needsProof: false,
    enabled: true,
  },
};

@Injectable()
export class PaymentMethodsService {
  private readonly repo: FirestoreRepository<PaymentMethodConfig>;

  constructor(@Inject(FIRESTORE) firestore: Firestore) {
    this.repo = new FirestoreRepository<PaymentMethodConfig>(
      firestore,
      Collections.PAYMENT_METHODS,
    );
  }

  /** Seeds the built-in defaults only the very first time this collection
   * is touched (empty). Previously this checked each default id
   * individually and recreated whichever was missing — which meant an
   * admin deleting one of these (e.g. "Efectivo en tienda") only ever
   * looked deleted until the next findAll()/list() call (every one of
   * which runs ensureSeeded() first) silently recreated it. Once anything
   * exists in the collection — a surviving default or an admin-created
   * method — this does nothing, so deletions and edits actually stick. */
  private async ensureSeeded(): Promise<void> {
    const anyExisting = await this.repo.findAll({ limit: 1 });
    if (anyExisting.length > 0) return;
    await Promise.all(
      Object.entries(DEFAULTS).map(([id, data]) => this.repo.create(data, id)),
    );
  }

  async list(): Promise<PaymentMethodConfig[]> {
    await this.ensureSeeded();
    const all = await this.repo.findAll();
    return all.sort((a, b) => {
      const ai = DISPLAY_ORDER.indexOf(a.id);
      const bi = DISPLAY_ORDER.indexOf(b.id);
      if (ai !== -1 || bi !== -1)
        return (ai === -1 ? DISPLAY_ORDER.length : ai) - (bi === -1 ? DISPLAY_ORDER.length : bi);
      return a.createdAt.getTime() - b.createdAt.getTime();
    });
  }

  /** Every method an admin adds through this endpoint is reconciled the same
   * way (an admin checks the reference/proof against their own records and
   * verifies or rejects it) — so it always gets PaymentMethod.OTHER rather
   * than asking the admin to pick from an enum that exists for the
   * *processing* differences (PayPal's own API confirmation, Credit B2B's
   * auto-verification) those built-in seeded methods need, not this one. */
  async create(dto: CreatePaymentMethodDto): Promise<PaymentMethodConfig> {
    const id = await this.uniqueIdFor(dto.label);
    return this.repo.create(
      {
        backendMethod: PaymentMethod.OTHER,
        label: dto.label,
        details: dto.details,
        needsReference: dto.needsReference,
        needsProof: dto.needsProof,
        enabled: dto.enabled ?? true,
      },
      id,
    );
  }

  /** Slugifies the label into a checkout key, appending -2/-3/... on collision. */
  private async uniqueIdFor(label: string): Promise<string> {
    const base = slugify(label) || 'metodo';
    let id = base;
    let suffix = 2;
    while (await this.repo.findById(id)) {
      id = `${base}-${suffix++}`;
    }
    return id;
  }

  async update(id: string, dto: UpdatePaymentMethodDto): Promise<PaymentMethodConfig> {
    await this.ensureSeeded();
    await this.repo.getOrThrow(id, 'Payment method not found');
    return this.repo.update(id, dto);
  }

  async delete(id: string): Promise<void> {
    await this.ensureSeeded();
    await this.repo.getOrThrow(id, 'Payment method not found');
    await this.repo.delete(id);
  }
}
