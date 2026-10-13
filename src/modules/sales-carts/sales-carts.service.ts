import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import * as QRCode from 'qrcode';
import { Role } from '../../common/enums/role.enum';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { EnvConfig } from '../../config/env.validation';
import { FIRESTORE } from '../../firebase/firebase.constants';
import { Collections } from '../../firebase/firestore-collections';
import { FirestoreRepository, snapshotToEntity } from '../../firebase/firestore.repository';
import { ExchangeRateService } from '../exchange-rate/exchange-rate.service';
import { ProductsService } from '../products/products.service';
import { UsersService } from '../users/users.service';
import { AddSalesCartItemDto } from './dto/add-sales-cart-item.dto';
import { CompleteSalesCartDto } from './dto/complete-sales-cart.dto';
import { CreateSalesCartDto } from './dto/create-sales-cart.dto';
import { SalesCartCustomerDto } from './dto/sales-cart-customer.dto';
import { UpdateSalesCartDto } from './dto/update-sales-cart.dto';
import {
  PriceList,
  SalesCart,
  SalesCartCustomer,
  SalesCartStatus,
} from './entities/sales-cart.entity';
import { SharedQuote } from './entities/shared-quote.entity';
import { renderQuotePdf } from './quote-pdf';
import { computeSalesCartTotals } from './sales-cart-totals';

export const QUOTE_VALIDITY_DAYS = 3;
const QUOTE_COUNTER_ID = 'salesQuotes';
const STORE_TIME_ZONE = 'America/Caracas';

/** The store's calendar day for a moment, as YYYY-MM-DD. */
export function storeDay(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: STORE_TIME_ZONE }).format(date);
}

export interface SharedQuoteLink {
  token: string;
  number: number;
  url: string;
  validUntil: Date;
}

/**
 * Carts sellers build for walk-in customers: scan the labels, adjust, share
 * the result as a quote link or print it, then close it once the sale is
 * invoiced in Profit Plus. Each cart is one document, so a scan is one read
 * and one write.
 */
@Injectable()
export class SalesCartsService {
  private readonly logger = new Logger(SalesCartsService.name);
  private readonly repo: FirestoreRepository<SalesCart>;

  constructor(
    @Inject(FIRESTORE) private readonly firestore: Firestore,
    private readonly productsService: ProductsService,
    private readonly usersService: UsersService,
    private readonly exchangeRate: ExchangeRateService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {
    this.repo = new FirestoreRepository<SalesCart>(firestore, Collections.SALES_CARTS);
  }

  /**
   * Opens a cart for the seller — or hands back one of theirs that is still
   * blank (no products, customer or quote), so finishing a sale or tapping
   * "Nuevo carrito" twice doesn't pile up empty carts. Any other blank ones
   * they left behind are deleted on the way.
   */
  async create(user: AuthenticatedUser, dto: CreateSalesCartDto): Promise<SalesCart> {
    const customer = cleanCustomer(dto.customer);
    const open = await this.repo.findAll({
      where: [
        { field: 'sellerId', op: '==', value: user.id },
        { field: 'status', op: '==', value: SalesCartStatus.OPEN },
      ],
    });
    const [reuse, ...leftovers] = open
      .filter(isBlank)
      .sort((a, b) => time(b.updatedAt) - time(a.updatedAt));
    if (leftovers.length > 0) {
      const batch = this.firestore.batch();
      for (const cart of leftovers) batch.delete(this.repo.doc(cart.id));
      await batch.commit();
    }
    if (reuse) {
      // Also moves it to the top of the list (updatedAt).
      await this.repo.patch(reuse.id, { customer });
      return { ...reuse, customer, updatedAt: new Date() };
    }

    const profile = await this.usersService.findById(user.id).catch(() => null);
    return this.repo.create({
      sellerId: user.id,
      sellerName: profile?.displayName || user.email,
      status: SalesCartStatus.OPEN,
      customer,
      priceList: PriceList.RETAIL,
      discountPct: 0,
      items: [],
    });
  }

  /** A seller's own carts; admins see everyone's. "completed" means sales
   * finished today — the day's sales, not the whole history. */
  async list(user: AuthenticatedUser, status: 'open' | 'completed' = 'open'): Promise<SalesCart[]> {
    const where =
      status === 'open'
        ? [{ field: 'status', op: '==' as const, value: SalesCartStatus.OPEN }]
        : [
            { field: 'status', op: '==' as const, value: SalesCartStatus.COMPLETED },
            { field: 'closedDay', op: '==' as const, value: storeDay(new Date()) },
          ];
    if (user.role !== Role.ADMIN) {
      where.push({ field: 'sellerId', op: '==', value: user.id });
    }
    const carts = await this.repo.findAll({ where });
    return carts.sort((a, b) => time(b.updatedAt) - time(a.updatedAt));
  }

  async findOne(user: AuthenticatedUser, id: string): Promise<SalesCart> {
    const cart = await this.repo.findById(id);
    if (!cart || !canSee(user, cart)) throw new NotFoundException('Carrito no encontrado');
    return cart;
  }

  async update(user: AuthenticatedUser, id: string, dto: UpdateSalesCartDto): Promise<SalesCart> {
    // The customer comes whole, so a field left blank is cleared.
    return this.mutate(user, id, () => ({
      ...(dto.customer !== undefined && { customer: cleanCustomer(dto.customer) }),
      ...(dto.priceList !== undefined && { priceList: dto.priceList }),
      ...(dto.discountPct !== undefined && { discountPct: dto.discountPct }),
    }));
  }

  /** Adds units of a product — a scan adds one. Prices are taken the first
   * time the product goes in; adding it again only raises the quantity. */
  async addItem(user: AuthenticatedUser, id: string, dto: AddSalesCartItemDto): Promise<SalesCart> {
    const product = await this.productsService.findPublicById(dto.productId).catch(() => null);
    if (!product || !product.active) {
      throw new NotFoundException('Ese producto no está disponible en el catálogo');
    }
    const qty = dto.qty ?? 1;
    return this.mutate(user, id, (cart) => {
      const existing = cart.items.find((item) => item.productId === product.id);
      const items = existing
        ? cart.items.map((item) =>
            item.productId === product.id ? { ...item, qty: item.qty + qty } : item,
          )
        : [
            ...cart.items,
            {
              productId: product.id,
              sku: product.sku,
              name: product.name,
              qty,
              retailPrice: product.retailPrice,
              wholesalePrice: product.wholesalePrice,
            },
          ];
      return { items };
    });
  }

  setItemQty(
    user: AuthenticatedUser,
    id: string,
    productId: string,
    qty: number,
  ): Promise<SalesCart> {
    return this.mutate(user, id, (cart) => {
      if (!cart.items.some((item) => item.productId === productId)) {
        throw new NotFoundException('Ese producto no está en el carrito');
      }
      return {
        items:
          qty === 0
            ? cart.items.filter((item) => item.productId !== productId)
            : cart.items.map((item) => (item.productId === productId ? { ...item, qty } : item)),
      };
    });
  }

  complete(user: AuthenticatedUser, id: string, dto: CompleteSalesCartDto): Promise<SalesCart> {
    return this.mutate(user, id, (cart) => {
      if (cart.items.length === 0) {
        throw new BadRequestException('El carrito está vacío');
      }
      const now = new Date();
      const invoiceRef = dto.invoiceRef?.trim();
      return {
        status: SalesCartStatus.COMPLETED,
        ...(invoiceRef ? { invoiceRef } : {}),
        closedAt: now,
        closedDay: storeDay(now),
      };
    });
  }

  /** Drops an open cart that didn't become a sale — deleted outright, no
   * record kept. A quote already shared from it is the customer's own
   * document (sharedQuotes) and stays valid until it expires. */
  async cancel(user: AuthenticatedUser, id: string): Promise<void> {
    const ref = this.repo.doc(id);
    await this.firestore.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new NotFoundException('Carrito no encontrado');
      assertWritable(user, snapshotToEntity<SalesCart>(snap));
      tx.delete(ref);
    });
  }

  /**
   * Freezes the cart as a quote behind a public link. Sharing again keeps
   * the same link and number but refreshes its contents, prices and the
   * 3-day validity — the customer only ever sees what was shared.
   */
  async share(user: AuthenticatedUser, id: string): Promise<SharedQuoteLink> {
    const bcvRate = await this.exchangeRate
      .getBcvRate()
      .then((rate) => rate.rate)
      .catch((error: Error) => {
        this.logger.warn(`Quote shared without a BCV rate: ${error.message}`);
        return undefined;
      });
    const siteUrl = this.config.get('PUBLIC_SITE_URL', { infer: true }).replace(/\/+$/, '');
    const cartRef = this.repo.doc(id);
    const counterRef = this.firestore.collection(Collections.COUNTERS).doc(QUOTE_COUNTER_ID);

    return this.firestore.runTransaction(async (tx) => {
      const [cartSnap, counterSnap] = await tx.getAll(cartRef, counterRef);
      if (!cartSnap.exists) throw new NotFoundException('Carrito no encontrado');
      const cart = snapshotToEntity<SalesCart>(cartSnap);
      assertWritable(user, cart);
      if (cart.items.length === 0) {
        throw new BadRequestException('Agrega al menos un producto antes de compartir');
      }

      const token = cart.quoteToken ?? randomBytes(18).toString('base64url');
      let number = cart.quoteNumber;
      if (number === undefined) {
        number = ((counterSnap.data()?.value as number | undefined) ?? 0) + 1;
        tx.set(counterRef, { value: number }, { merge: true });
      }
      const url = `${siteUrl}/cotizacion/${token}`;
      const issuedAt = new Date();
      const validUntil = new Date(issuedAt.getTime() + QUOTE_VALIDITY_DAYS * 24 * 60 * 60 * 1000);
      const totals = computeSalesCartTotals(cart);
      const now = FieldValue.serverTimestamp();

      const quote: Omit<SharedQuote, 'id' | 'createdAt' | 'updatedAt'> = {
        cartId: cart.id,
        number,
        sellerName: cart.sellerName,
        customer: cart.customer,
        priceList: cart.priceList,
        lines: totals.lines.map((line) => ({
          sku: line.sku,
          name: line.name,
          qty: line.qty,
          unitPrice: line.unitPrice,
          lineTotal: line.lineTotal,
        })),
        subtotal: totals.subtotal,
        discountPct: cart.discountPct,
        discountAmount: totals.discountAmount,
        taxableBase: totals.taxableBase,
        taxAmount: totals.taxAmount,
        total: totals.total,
        ...(bcvRate !== undefined && { bcvRate }),
        issuedAt,
        validUntil,
        qrImageDataUrl: await QRCode.toDataURL(url, { margin: 1, width: 240 }),
      };
      tx.set(this.firestore.collection(Collections.SHARED_QUOTES).doc(token), {
        ...quote,
        createdAt: now,
        updatedAt: now,
      });
      tx.update(cartRef, { quoteToken: token, quoteNumber: number, updatedAt: now });
      return { token, number, url, validUntil };
    });
  }

  /** The public side of a shared quote — no account needed, so it carries
   * nothing internal (no cart id, stock or costs). */
  /** The shared quote as a letter-size PDF, to print or keep. */
  async sharedQuotePdf(token: string): Promise<{ number: number; pdf: Buffer }> {
    const quote = await this.findSharedQuote(token);
    return { number: quote.number, pdf: await renderQuotePdf(quote) };
  }

  async findSharedQuote(token: string): Promise<Omit<SharedQuote, 'cartId'>> {
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) {
      throw new NotFoundException('Cotización no encontrada');
    }
    const snap = await this.firestore.collection(Collections.SHARED_QUOTES).doc(token).get();
    if (!snap.exists) throw new NotFoundException('Cotización no encontrada');
    const { cartId: _cartId, ...quote } = snapshotToEntity<SharedQuote>(snap);
    return quote;
  }

  /** Read, check and write one cart in a transaction, so two quick scans
   * from the same phone can't overwrite each other's line. */
  private mutate(
    user: AuthenticatedUser,
    id: string,
    change: (cart: SalesCart) => Partial<SalesCart>,
  ): Promise<SalesCart> {
    const ref = this.repo.doc(id);
    return this.firestore.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new NotFoundException('Carrito no encontrado');
      const cart = snapshotToEntity<SalesCart>(snap);
      assertWritable(user, cart);
      const patch = change(cart);
      tx.update(ref, { ...patch, updatedAt: FieldValue.serverTimestamp() });
      return { ...cart, ...patch, updatedAt: new Date() };
    });
  }
}

/** Nothing in it yet worth keeping: no products, customer or shared quote. */
function isBlank(cart: SalesCart): boolean {
  const { name, taxId, phone } = cart.customer ?? {};
  return cart.items.length === 0 && !cart.quoteToken && !name && !taxId && !phone;
}

function time(date: Date | undefined): number {
  return date instanceof Date ? date.getTime() : 0;
}

function canSee(user: AuthenticatedUser, cart: SalesCart): boolean {
  return user.role === Role.ADMIN || cart.sellerId === user.id;
}

function assertWritable(user: AuthenticatedUser, cart: SalesCart): void {
  if (!canSee(user, cart)) throw new NotFoundException('Carrito no encontrado');
  if (cart.status !== SalesCartStatus.OPEN) {
    throw new ConflictException('Este carrito ya se cerró');
  }
}

/** Trimmed, with empty fields left out rather than stored as "". */
function cleanCustomer(customer: SalesCartCustomerDto | undefined): SalesCartCustomer {
  const cleaned: SalesCartCustomer = {};
  for (const key of ['name', 'taxId', 'phone'] as const) {
    const value = customer?.[key]?.trim();
    if (value) cleaned[key] = value;
  }
  return cleaned;
}
