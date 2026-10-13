import { expect } from 'vitest';
import { type Complex, cabs, csub } from '../complex';

/** Compare two root sets as multisets with greedy nearest matching. */
export function expectRootsClose(actual: Complex[], expected: Complex[], tol = 1e-9) {
  expect(actual.length).toBe(expected.length);
  const left = expected.slice();
  for (const a of actual) {
    let bi = -1;
    let bd = Infinity;
    left.forEach((e, i) => {
      const d = cabs(csub(a, e));
      if (d < bd) {
        bd = d;
        bi = i;
      }
    });
    const scale = Math.max(1, cabs(left[bi]));
    expect(bd / scale, `root ${a.re}+${a.im}j vs ${left[bi].re}+${left[bi].im}j`).toBeLessThanOrEqual(tol);
    left.splice(bi, 1);
  }
}

export function expectClose(a: number, b: number, rel = 1e-9, abs = 1e-12, msg?: string) {
  const ok = Math.abs(a - b) <= Math.max(abs, rel * Math.abs(b));
  expect(ok, msg ?? `${a} vs ${b}`).toBe(true);
}

export function expectArrayClose(a: ArrayLike<number>, b: ArrayLike<number>, rel = 1e-9, abs = 1e-12, msg = '') {
  expect(a.length, `${msg} length`).toBe(b.length);
  for (let i = 0; i < a.length; i++) expectClose(a[i], b[i], rel, abs, `${msg}[${i}]: ${a[i]} vs ${b[i]}`);
}
