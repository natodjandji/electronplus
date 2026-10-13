import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import type { Firestore } from 'firebase-admin/firestore';
import { renderQuotePdf } from '../../common/pdf/quote-pdf';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { FIRESTORE } from '../../firebase/firebase.constants';
import { Collections } from '../../firebase/firestore-collections';
import { FirestoreRepository } from '../../firebase/firestore.repository';
import { ExchangeRateService } from '../exchange-rate/exchange-rate.service';
import { customerQuoteLabel, customerQuotePdf } from './customer-quote-pdf';
import { Quote } from './entities/quote.entity';
import { QuotesService } from './quotes.service';

/**
 * Customers' quotes as PDFs. The PDF is fetched by plain navigation (so a
 * phone hands it to its viewer), which can't carry the Bearer token — so its
 * owner or an admin first gets an unguessable link, the same way a seller's
 * shared quote works. The PDF shows the quote as it is when opened.
 */
@Injectable()
export class QuotePdfService {
  private readonly logger = new Logger(QuotePdfService.name);
  private readonly repo: FirestoreRepository<Quote>;

  constructor(
    @Inject(FIRESTORE) firestore: Firestore,
    private readonly quotesService: QuotesService,
    private readonly exchangeRate: ExchangeRateService,
  ) {
    this.repo = new FirestoreRepository<Quote>(firestore, Collections.QUOTES);
  }

  async pdfLink(id: string, user: AuthenticatedUser): Promise<{ token: string }> {
    const quote = await this.quotesService.findOneForUser(id, user);
    if (quote.pdfToken) return { token: quote.pdfToken };
    const token = randomBytes(18).toString('base64url');
    await this.repo.patch(quote.id, { pdfToken: token });
    return { token };
  }

  async pdfByToken(token: string): Promise<{ label: string; pdf: Buffer }> {
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(token))
      throw new NotFoundException('Cotización no encontrada');
    const quote = await this.repo.findOne([{ field: 'pdfToken', op: '==', value: token }]);
    if (!quote) throw new NotFoundException('Cotización no encontrada');
    const bcvRate = await this.exchangeRate
      .getBcvRate()
      .then((rate) => rate.rate)
      .catch((error: Error) => {
        this.logger.warn(`Quote PDF without a BCV rate: ${error.message}`);
        return undefined;
      });
    return {
      label: customerQuoteLabel(quote),
      pdf: await renderQuotePdf(customerQuotePdf(quote, bcvRate)),
    };
  }
}
