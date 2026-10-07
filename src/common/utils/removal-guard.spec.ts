import { removalAllowed } from './removal-guard';

describe('removalAllowed', () => {
  it('lets a few real deletions through', () => {
    expect(removalAllowed(12, 5438, 5426)).toBe(true);
    expect(removalAllowed(3, 10, 7)).toBe(true); // small catalog: the floor of 5
  });

  it('stops a drop too large to be real deletions', () => {
    expect(removalAllowed(600, 5438, 4838)).toBe(false);
  });

  it('never retires anything on an empty feed', () => {
    expect(removalAllowed(0, 0, 0)).toBe(false);
    expect(removalAllowed(2, 10, 0)).toBe(false);
  });
});
