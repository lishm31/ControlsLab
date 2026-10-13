import { describe, expect, it } from 'vitest';
import { clean, fix, sig } from '../format';

describe('display formatting', () => {
  it('uses a real minus sign, so never feed display strings back into Number()', () => {
    expect(fix(-1.5, 1)).toBe('−1.5');
    expect(Number(sig(-0.5, 3))).toBeNaN();
  });
  it('drops trailing zeros in clean()', () => {
    expect(clean(5)).toBe('5');
    expect(clean(0.035)).toBe('0.035');
    expect(clean(12.5)).toBe('12.5');
  });
  it('does not print negative zero', () => expect(fix(-0.00001, 2)).toBe('0.00'));
});
