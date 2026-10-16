import { removalAllowed } from './removal-guard';

describe('removalAllowed', () => {
  it('lets a few real deletions through', () => {
    expect(removalAllowed(12, 5438, 5426)).toBe(true);
    expect(removalAllowed(3, 10, 7)).toBe(true); // small catalog: the floor of 5
  });

  it('stops a drop too large to be real deletions', () => {
    expect(removalAllowed(600, 5438, 4838)).toBe(false);
  });

  it('retires nothing on an empty feed from a real catalog', () => {
    expect(removalAllowed(10, 10, 0)).toBe(false);
    expect(removalAllowed(5438, 5438, 0)).toBe(false);
  });

  it('lets an empty feed retire a catalog within the floor: its last items were deleted', () => {
    expect(removalAllowed(1, 1, 0)).toBe(true);
    expect(removalAllowed(5, 5, 0)).toBe(true);
    expect(removalAllowed(6, 6, 0)).toBe(false);
  });
});
