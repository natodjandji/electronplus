import { round2 } from './money';

describe('round2', () => {
  it('rounds halves up, including the ones binary floats store just below', () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(0.145)).toBe(0.15);
    expect(round2(2.135)).toBe(2.14);
    expect(round2(10.005)).toBe(10.01);
    expect(round2(1.00499)).toBe(1);
    expect(round2(1.004)).toBe(1);
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(round2(82.645)).toBe(82.65);
    expect(round2(10)).toBe(10);
  });
});
