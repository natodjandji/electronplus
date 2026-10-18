import { BadRequestException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { FakeFirestore } from '../../test/fake-firestore';
import { Collections } from '../../firebase/firestore-collections';
import { REVIEW_CREATED_EVENT, ReviewsService } from './reviews.service';

describe('ReviewsService', () => {
  const sellers = [
    { id: 'u2', displayName: 'José Rodríguez', active: true },
    { id: 'u1', displayName: ' María Pérez ', active: true },
    { id: 'u3', displayName: '', active: true },
    { id: 'u4', displayName: 'Dado de baja', active: false },
  ];

  function setup() {
    const firestore = new FakeFirestore();
    const events = new EventEmitter2();
    const created = jest.fn();
    events.on(REVIEW_CREATED_EVENT, created);
    const service = new ReviewsService(
      firestore as never,
      { findSellers: async () => sellers } as never,
      { get: () => 'https://electronplus.com.ve/' } as never,
      events,
    );
    const reviews = async () =>
      (await firestore.collection(Collections.REVIEWS).get()).docs.map((d) => d.data());
    return { firestore, service, reviews, created };
  }

  it('offers the default answers, then "Otro", and only named, active sellers', async () => {
    const { service } = setup();
    const form = await service.form();
    expect(form.sources[0]).toEqual({ id: 'instagram', label: 'Instagram' });
    expect(form.sources.at(-1)).toEqual({ id: 'otro', label: 'Otro' });
    expect(form.sellers).toEqual([
      { id: 'u2', name: 'José Rodríguez' },
      { id: 'u1', name: 'María Pérez' },
    ]);
  });

  it('saves a review with the answer and seller names copied in, and announces it', async () => {
    const { service, reviews, created } = setup();
    await service.create({
      rating: 5,
      sourceId: 'instagram',
      sourceOther: 'ignorado',
      sellerId: 'u1',
      message: '  Muy buena atención  ',
      customerName: '',
      customerPhone: '0414-1234567',
    });
    expect(await reviews()).toEqual([
      expect.objectContaining({
        rating: 5,
        sourceId: 'instagram',
        sourceLabel: 'Instagram',
        sellerId: 'u1',
        sellerName: 'María Pérez',
        message: 'Muy buena atención',
        customerPhone: '0414-1234567',
      }),
    ]);
    const [saved] = await reviews();
    // Only "Otro" keeps its text; a blank name isn't stored.
    expect(saved.sourceOther).toBeUndefined();
    expect(saved.customerName).toBeUndefined();
    // The admins' email is built from the event.
    expect(created).toHaveBeenCalledTimes(1);
    expect(created).toHaveBeenCalledWith(
      expect.objectContaining({
        rating: 5,
        sourceLabel: 'Instagram',
        sellerName: 'María Pérez',
        message: 'Muy buena atención',
        customerPhone: '0414-1234567',
        createdAt: expect.any(Date),
      }),
    );
  });

  it('keeps what the customer wrote for "Otro"', async () => {
    const { service, reviews } = setup();
    await service.create({ rating: 4, sourceId: 'otro', sourceOther: 'Un volante' });
    expect(await reviews()).toEqual([
      expect.objectContaining({ sourceId: 'otro', sourceLabel: 'Otro', sourceOther: 'Un volante' }),
    ]);
  });

  it('refuses an unknown answer or seller, and quietly drops what a bot sends', async () => {
    const { service, reviews, created } = setup();
    await expect(service.create({ rating: 3, sourceId: 'radio' })).rejects.toThrow(
      BadRequestException,
    );
    await expect(service.create({ rating: 3, sourceId: 'google', sellerId: 'u4' })).rejects.toThrow(
      BadRequestException,
    );
    await service.create({ rating: 1, sourceId: 'google', website: 'http://spam.example' });
    expect(await reviews()).toEqual([]);
    expect(created).not.toHaveBeenCalled();
  });

  it('edits the answers: a renamed one keeps its id, a new one gets one from its name', async () => {
    const { service } = setup();
    const { sources } = await service.updateSettings({
      sources: [
        { id: 'instagram', label: 'Instagram  o  Reels' },
        { label: 'Radio Éxitos' },
        { label: 'Volante' },
        { id: 'volante', label: 'Volante en la calle' },
      ],
    });
    expect(sources).toEqual([
      { id: 'instagram', label: 'Instagram o Reels' },
      { id: 'radio-exitos', label: 'Radio Éxitos' },
      { id: 'volante', label: 'Volante' },
      { id: 'volante-2', label: 'Volante en la calle' },
    ]);
    // The public form shows the change right away, with "Otro" still last.
    expect((await service.form()).sources.map((s) => s.id)).toEqual([
      'instagram',
      'radio-exitos',
      'volante',
      'volante-2',
      'otro',
    ]);
    await expect(
      service.updateSettings({ sources: [{ label: 'Radio' }, { label: 'radio' }] }),
    ).rejects.toThrow(/repetida/);
    await expect(service.updateSettings({ sources: [{ label: 'otro' }] })).rejects.toThrow(/Otro/);
  });

  it("lists a month's reviews, newest first", async () => {
    const { firestore, service } = setup();
    const at = (iso: string) => ({ rating: 5, sourceId: 'google', createdAt: new Date(iso) });
    firestore.seed(Collections.REVIEWS, 'sept', at('2026-09-30T23:00:00Z'));
    firestore.seed(Collections.REVIEWS, 'oct-1', at('2026-10-02T12:00:00Z'));
    firestore.seed(Collections.REVIEWS, 'oct-2', at('2026-10-15T12:00:00Z'));
    const list = await service.list({
      from: '2026-10-01T04:00:00.000Z',
      to: '2026-11-01T04:00:00.000Z',
    });
    expect(list.map((r) => r.id)).toEqual(['oct-2', 'oct-1']);
  });

  it('builds the QR for the review page', async () => {
    const { service } = setup();
    const { url, qrImageDataUrl } = await service.qr();
    expect(url).toBe('https://electronplus.com.ve/resena');
    expect(qrImageDataUrl).toMatch(/^data:image\/png;base64,/);
  });
});
