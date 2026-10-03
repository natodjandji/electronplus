import { BadRequestException } from '@nestjs/common';
import { FakeFirestore } from '../../test/fake-firestore';
import { Collections } from '../../firebase/firestore-collections';
import { DiscountCodesService, todayInVenezuela } from './discount-codes.service';
import { DiscountType } from './entities/discount-code.entity';

describe('DiscountCodesService limits', () => {
  const redemptions = `${Collections.DISCOUNT_CODES}/PROMO/redemptions`;

  function build(code: Record<string, unknown>) {
    const firestore = new FakeFirestore();
    firestore.seed(Collections.DISCOUNT_CODES, 'PROMO', {
      code: 'PROMO',
      type: DiscountType.PERCENTAGE,
      value: 10,
      enabled: true,
      ...code,
    });
    const service = new DiscountCodesService(firestore as never);
    const tx = () => firestore.runTransaction(async (t) => t as never);
    return { firestore, service, tx };
  }

  it('works through its last day and not after', async () => {
    const lastDayToday = build({ expiresOn: todayInVenezuela() });
    await expect(lastDayToday.service.validate('promo', 100, 'u1')).resolves.toMatchObject({
      valid: true,
      discountAmount: 10,
    });

    const expired = build({ expiresOn: '2000-01-31' });
    await expect(expired.service.validate('PROMO', 100, 'u1')).resolves.toMatchObject({
      valid: false,
      message: 'Este código de descuento ya venció',
    });
  });

  it('reads the expiry in Venezuela time, not UTC', () => {
    // 02:00 UTC on the 16th is still 22:00 on the 15th in Caracas.
    expect(todayInVenezuela(new Date('2026-10-16T02:00:00Z'))).toBe('2026-10-15');
  });

  it('counts each checkout and refuses once maxUses is reached', async () => {
    const { firestore, service, tx } = build({ maxUses: 2, usedCount: 1 });

    const redeem = await service.beginRedemption(await tx(), 'PROMO', 'u1');
    expect(redeem(50, 'o1')).toEqual({ code: 'PROMO', discountAmount: 5 });
    expect(firestore.read(Collections.DISCOUNT_CODES, 'PROMO')?.usedCount).toBe(2);

    const redeemAgain = await service.beginRedemption(await tx(), 'PROMO', 'u2');
    expect(() => redeemAgain(50, 'o2')).toThrow('límite de usos');
    await expect(service.validate('PROMO', 50, 'u3')).resolves.toMatchObject({ valid: false });
  });

  it('lets each customer use a once-per-customer code on one order only', async () => {
    const { firestore, service, tx } = build({ oncePerCustomer: true });

    const redeem = await service.beginRedemption(await tx(), 'PROMO', 'u1');
    redeem(50, 'o1');
    expect(firestore.read(redemptions, 'u1')).toEqual({ orderIds: ['o1'] });

    const again = await service.beginRedemption(await tx(), 'PROMO', 'u1');
    expect(() => again(50, 'o2')).toThrow('Ya usaste este código');
    await expect(service.validate('PROMO', 50, 'u1')).resolves.toMatchObject({ valid: false });

    // Someone else still can.
    await expect(service.validate('PROMO', 50, 'u2')).resolves.toMatchObject({ valid: true });
  });

  it('records uses of unrestricted codes too, so switching to once-per-customer counts them', async () => {
    const { firestore, service, tx } = build({});
    (await service.beginRedemption(await tx(), 'PROMO', 'u1'))(50, 'o1');
    (await service.beginRedemption(await tx(), 'PROMO', 'u1'))(50, 'o2');
    expect(firestore.read(redemptions, 'u1')).toEqual({ orderIds: ['o1', 'o2'] });

    await service.update('PROMO', { oncePerCustomer: true });
    await expect(service.validate('PROMO', 50, 'u1')).resolves.toMatchObject({ valid: false });
  });

  it('gives a cancelled order its use back, for the total and for the customer', async () => {
    const { firestore, service, tx } = build({ maxUses: 1, oncePerCustomer: true });
    (await service.beginRedemption(await tx(), 'PROMO', 'u1'))(50, 'o1');

    const release = await service.beginRelease(await tx(), 'PROMO', 'u1', 'o1');
    release();

    expect(firestore.read(Collections.DISCOUNT_CODES, 'PROMO')?.usedCount).toBe(0);
    expect(firestore.read(redemptions, 'u1')).toBeUndefined();
    await expect(service.validate('PROMO', 50, 'u1')).resolves.toMatchObject({ valid: true });
  });

  it('skips the release for a code deleted since', async () => {
    const { firestore, service, tx } = build({});
    const release = await service.beginRelease(await tx(), 'GONE', 'u1', 'o1');
    release();
    expect(firestore.read(Collections.DISCOUNT_CODES, 'GONE')).toBeUndefined();
  });

  it('refuses a percentage above 100', async () => {
    const { service } = build({});
    await expect(service.update('PROMO', { value: 150 })).rejects.toThrow(BadRequestException);
    await expect(
      service.create({ code: 'BIG', type: DiscountType.PERCENTAGE, value: 101 }),
    ).rejects.toThrow(BadRequestException);
  });
});
