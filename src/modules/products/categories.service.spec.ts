import { FakeFirestore } from '../../test/fake-firestore';
import { Collections } from '../../firebase/firestore-collections';
import { CategoriesService } from './categories.service';

describe('CategoriesService.findOrCreateForErp', () => {
  function setup(seed: Record<string, Record<string, unknown>> = {}) {
    const firestore = new FakeFirestore();
    for (const [id, data] of Object.entries(seed)) {
      firestore.seed(Collections.CATEGORIES, id, { createdAt: new Date(), ...data });
    }
    const service = new CategoriesService(firestore as never);
    const all = async () =>
      (await firestore.collection(Collections.CATEGORIES).get()).docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));
    return { service, all };
  }

  it("creates a category keyed by Profit's code, with a readable URL code", async () => {
    const { service } = setup();
    const category = await service.findOrCreateForErp('07', 'Iluminación');
    expect(category).toMatchObject({ code: 'iluminacion', label: 'Iluminación', erpCode: '07' });
  });

  it('keeps a renamed category the same one: new label, same id and URL', async () => {
    const { service, all } = setup({
      c1: { code: 'iluminacion', label: 'Iluminacion', erpCode: '07' },
    });
    const category = await service.findOrCreateForErp('07', 'Iluminación LED');
    expect(category).toMatchObject({ id: 'c1', code: 'iluminacion', label: 'Iluminación LED' });
    expect(await all()).toHaveLength(1);
  });

  it('adopts a category already made from the same name instead of duplicating it', async () => {
    const { service, all } = setup({ c1: { code: 'cables', label: 'Cables' } });
    const category = await service.findOrCreateForErp('03', 'Cables');
    expect(category).toMatchObject({ id: 'c1', code: 'cables', erpCode: '03' });
    expect(await all()).toHaveLength(1);
  });

  it('keeps two Profit categories with the same name apart', async () => {
    const { service } = setup({ c1: { code: 'cables', label: 'Cables', erpCode: '03' } });
    const category = await service.findOrCreateForErp('17', 'CABLES');
    expect(category.id).not.toBe('c1');
    expect(category).toMatchObject({ code: 'cables-17', label: 'CABLES', erpCode: '17' });
  });

  it("falls back to the name when Profit doesn't send a code", async () => {
    const { service, all } = setup({ c1: { code: 'sin-categoria', label: 'Sin categoría' } });
    const category = await service.findOrCreateForErp(undefined, 'Sin categoría');
    expect(category.id).toBe('c1');
    expect(await all()).toHaveLength(1);
  });
});
