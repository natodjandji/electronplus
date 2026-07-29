import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { Firestore } from 'firebase-admin/firestore';
import { FIRESTORE } from '../../firebase/firebase.constants';
import { Collections } from '../../firebase/firestore-collections';
import { FirestoreRepository } from '../../firebase/firestore.repository';
import { Role } from '../../common/enums/role.enum';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { PaymentMethod } from '../payments/entities/payment.entity';
import { PricingService } from '../products/pricing.service';
import { ProductsService } from '../products/products.service';
import { AddQuoteLineDto } from './dto/add-quote-line.dto';
import { CreateQuoteDto } from './dto/create-quote.dto';
import { UpdateQuoteLineDto } from './dto/update-quote-line.dto';
import { Quote, QuoteItem, QuoteStatus } from './entities/quote.entity';

@Injectable()
export class QuotesService {
  private readonly repo: FirestoreRepository<Quote>;

  constructor(
    @Inject(FIRESTORE) private readonly firestore: Firestore,
    private readonly productsService: ProductsService,
    private readonly pricingService: PricingService,
  ) {
    this.repo = new FirestoreRepository<Quote>(firestore, Collections.QUOTES);
  }

  async create(user: AuthenticatedUser, dto: CreateQuoteDto): Promise<Quote> {
    return this.repo.create({
      userId: user.id,
      customerName: dto.customerName,
      customerTaxId: dto.customerTaxId,
      expectedPaymentMethod: dto.expectedPaymentMethod,
      status: QuoteStatus.DRAFT,
      globalDiscountPct: 0,
      items: [],
    });
  }

  findMine(user: AuthenticatedUser): Promise<Quote[]> {
    return this.repo.findAll({
      where: [{ field: 'userId', op: '==', value: user.id }],
      orderBy: { field: 'createdAt', direction: 'desc' },
      limit: 500,
    });
  }

  findAll(userId?: string): Promise<Quote[]> {
    return this.repo.findAll({
      where: userId ? [{ field: 'userId', op: '==', value: userId }] : [],
      orderBy: { field: 'createdAt', direction: 'desc' },
      limit: 500,
    });
  }

  async findOneForUser(id: string, user: AuthenticatedUser): Promise<Quote> {
    const quote = await this.repo.getOrThrow(id, 'Quote not found');
    if (quote.userId !== user.id && user.role !== Role.ADMIN) {
      throw new ForbiddenException('This quote does not belong to you');
    }
    return quote;
  }

  /** Every line mutation below (add/update/remove/discount) reads the whole
   * `items` array, mutates it in memory, and writes the entire array back —
   * so it MUST run inside a transaction. A plain read-then-write let two
   * concurrent edits (a fast double-click, or two open tabs on the same
   * quote) both read the same pre-mutation array; the second write silently
   * clobbered the first with no error to either caller. */
  async addLine(id: string, user: AuthenticatedUser, dto: AddQuoteLineDto): Promise<Quote> {
    const product = await this.productsService.findById(dto.productId);
    const unitPrice = this.pricingService.priceFor(product);
    const item: QuoteItem = {
      id: randomUUID(),
      productId: product.id,
      sku: product.sku,
      name: product.name,
      qty: dto.qty,
      unitPrice,
      wholesalePrice: product.wholesalePrice,
      discountPct: dto.discountPct ?? 0,
    };

    return this.withEditableQuoteTransaction(id, user, (quote) => ({
      items: [...quote.items, item],
    }));
  }

  async updateLine(
    id: string,
    lineId: string,
    user: AuthenticatedUser,
    dto: UpdateQuoteLineDto,
  ): Promise<Quote> {
    return this.withEditableQuoteTransaction(id, user, (quote) => {
      const items = quote.items.map((item) =>
        item.id === lineId
          ? { ...item, qty: dto.qty ?? item.qty, discountPct: dto.discountPct ?? item.discountPct }
          : item,
      );
      if (!items.some((i) => i.id === lineId)) {
        throw new NotFoundException('Quote line not found');
      }
      return { items };
    });
  }

  async removeLine(id: string, lineId: string, user: AuthenticatedUser): Promise<Quote> {
    return this.withEditableQuoteTransaction(id, user, (quote) => ({
      items: quote.items.filter((i) => i.id !== lineId),
    }));
  }

  /** Draft only — lets the customer state (or change) how they expect to pay
   * before sending, so the admin can weigh that against the price/discount to offer. */
  async setPaymentMethod(
    id: string,
    user: AuthenticatedUser,
    expectedPaymentMethod: PaymentMethod,
  ): Promise<Quote> {
    await this.assertEditable(id, user);
    return this.repo.update(id, { expectedPaymentMethod });
  }

  /** Drafts only — once sent, a quote is a real request under review and can't be deleted. */
  async remove(id: string, user: AuthenticatedUser): Promise<void> {
    await this.assertEditable(id, user);
    await this.repo.delete(id);
  }

  /** Admin-only (enforced by @Roles on the controller) — grants the "special discount" while reviewing a request. */
  async setGlobalDiscount(
    id: string,
    user: AuthenticatedUser,
    globalDiscountPct: number,
  ): Promise<Quote> {
    return this.withNotFinalizedQuoteTransaction(id, user, () => ({ globalDiscountPct }));
  }

  /** Admin-only — sets each line's discount so its effective price matches that
   * product's wholesale price exactly (retail:wholesale ratio varies per product,
   * so a single flat % can't reproduce this). Clears globalDiscountPct so it
   * doesn't stack a second discount on top of wholesale. */
  async applyWholesalePricing(id: string, user: AuthenticatedUser): Promise<Quote> {
    return this.withNotFinalizedQuoteTransaction(id, user, (quote) => ({
      items: quote.items.map((item) => ({
        ...item,
        discountPct:
          item.unitPrice > 0
            ? Math.round(Math.max(0, (1 - item.wholesalePrice / item.unitPrice) * 10000)) / 100
            : 0,
      })),
      globalDiscountPct: 0,
    }));
  }

  /** Admin-only — reverts applyWholesalePricing back to full retail pricing. */
  async resetToRetailPricing(id: string, user: AuthenticatedUser): Promise<Quote> {
    return this.withNotFinalizedQuoteTransaction(id, user, (quote) => ({
      items: quote.items.map((item) => ({ ...item, discountPct: 0 })),
      globalDiscountPct: 0,
    }));
  }

  /** draft -> sent: the customer submits their quote request for admin review. */
  async send(id: string, user: AuthenticatedUser): Promise<Quote> {
    await this.assertEditable(id, user);
    return this.repo.update(id, { status: QuoteStatus.SENT });
  }

  /** sent -> approved: admin-only, records that the request was accepted. */
  async approve(id: string, user: AuthenticatedUser): Promise<Quote> {
    const quote = await this.findOneForUser(id, user);
    if (quote.status !== QuoteStatus.SENT) {
      throw new ForbiddenException('Only sent quotes can be approved');
    }
    return this.repo.update(id, { status: QuoteStatus.APPROVED });
  }

  /** sent -> rejected: admin-only, with an optional reason shown to the customer. */
  async reject(id: string, user: AuthenticatedUser, reason?: string): Promise<Quote> {
    const quote = await this.findOneForUser(id, user);
    if (quote.status !== QuoteStatus.SENT) {
      throw new ForbiddenException('Only sent quotes can be rejected');
    }
    return this.repo.update(id, { status: QuoteStatus.REJECTED, rejectionReason: reason });
  }

  private async assertEditable(id: string, user: AuthenticatedUser): Promise<Quote> {
    const quote = await this.findOneForUser(id, user);
    if (quote.status !== QuoteStatus.DRAFT) {
      throw new ForbiddenException('Only draft quotes can be edited');
    }
    return quote;
  }

  /** Discount can still be adjusted right up until a final decision is recorded. */
  private async assertNotFinalized(id: string, user: AuthenticatedUser): Promise<Quote> {
    const quote = await this.findOneForUser(id, user);
    if (quote.status === QuoteStatus.APPROVED || quote.status === QuoteStatus.REJECTED) {
      throw new ForbiddenException('Cannot change the discount on a finalized quote');
    }
    return quote;
  }

  private assertOwnership(quote: Quote, user: AuthenticatedUser): void {
    if (quote.userId !== user.id && user.role !== Role.ADMIN) {
      throw new ForbiddenException('This quote does not belong to you');
    }
  }

  /** Shared by every line/discount mutation: reads the quote inside the
   * transaction (not before it), so the ownership/status check and the
   * write both see the same snapshot — a concurrent edit either lands
   * fully before or fully after this one, never interleaved. */
  private async withQuoteTransaction(
    id: string,
    user: AuthenticatedUser,
    assertStatus: (quote: Quote) => void,
    mutate: (quote: Quote) => Partial<Quote>,
  ): Promise<Quote> {
    const ref = this.repo.doc(id);
    return this.firestore.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new NotFoundException('Quote not found');
      const quote = { ...snap.data(), id: snap.id } as Quote;
      this.assertOwnership(quote, user);
      assertStatus(quote);
      const patch = mutate(quote);
      tx.update(ref, patch);
      return { ...quote, ...patch };
    });
  }

  private withEditableQuoteTransaction(
    id: string,
    user: AuthenticatedUser,
    mutate: (quote: Quote) => Partial<Quote>,
  ): Promise<Quote> {
    return this.withQuoteTransaction(
      id,
      user,
      (quote) => {
        if (quote.status !== QuoteStatus.DRAFT) {
          throw new ForbiddenException('Only draft quotes can be edited');
        }
      },
      mutate,
    );
  }

  private withNotFinalizedQuoteTransaction(
    id: string,
    user: AuthenticatedUser,
    mutate: (quote: Quote) => Partial<Quote>,
  ): Promise<Quote> {
    return this.withQuoteTransaction(
      id,
      user,
      (quote) => {
        if (quote.status === QuoteStatus.APPROVED || quote.status === QuoteStatus.REJECTED) {
          throw new ForbiddenException('Cannot change the discount on a finalized quote');
        }
      },
      mutate,
    );
  }
}
