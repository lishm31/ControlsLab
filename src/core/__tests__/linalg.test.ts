import { describe, expect, it } from 'vitest';
import { cx } from '../complex';
import { eigvals } from '../eig';
import { expm } from '../expm';
import { det, eye, inv, matClose, matMul, rank, singularValues, solveVec } from '../linalg';
import { pfromRoots } from '../poly';
import { makeRng } from '../rng';
import { roots } from '../roots';
import { expectArrayClose, expectClose, expectRootsClose } from './helpers';

describe('linalg', () => {
  const A = [
    [4, -2, 1],
    [3, 6, -4],
    [2, 1, 8],
  ];
  it('computes determinant', () => expectClose(det(A), 4 * (48 + 4) + 2 * (24 + 8) + (3 - 12)));
  it('inverts', () => expect(matClose(matMul(A, inv(A)), eye(3), 1e-12, 1e-12)).toBe(true));
  it('solves', () => {
    const x = solveVec(A, [1, 2, 3]);
    const b = A.map((r) => r.reduce((s, a, j) => s + a * x[j], 0));
    expectArrayClose(b, [1, 2, 3], 1e-12);
  });
  it('throws on singular solve', () => expect(() => inv([[1, 2], [2, 4]])).toThrow());
  it('finds singular values and rank', () => {
    expectArrayClose(singularValues([[3, 0], [0, -4]]), [4, 3]);
    expect(rank([[1, 2], [2, 4]])).toBe(1);
    expect(rank([[0, 1, 0], [0, 0, 1], [1, 0, 0]])).toBe(3);
    expect(rank([[1, 2, 3], [4, 5, 6], [7, 8, 9]])).toBe(2);
  });
});

describe('eigvals', () => {
  it('handles diagonal, triangular, and rotation matrices', () => {
    expectRootsClose(eigvals([[2, 0], [0, -3]]), [cx(2), cx(-3)]);
    expectRootsClose(eigvals([[1, 5, 7], [0, 2, 9], [0, 0, 3]]), [cx(1), cx(2), cx(3)]);
    expectRootsClose(eigvals([[0, 1], [-1, 0]]), [cx(0, 1), cx(0, -1)]);
  });
  it('matches the poles of a companion-form second order system', () => {
    // x'' + 2 zeta wn x' + wn^2 x = 0 with wn = 2, zeta = 0.25
    const ev = eigvals([[0, 1], [-4, -1]]);
    expectRootsClose(ev, roots([1, 1, 4]));
  });
  it('agrees with polynomial roots for random companion matrices', () => {
    const rng = makeRng(7);
    for (let t = 0; t < 100; t++) {
      const n = rng.int(2, 9);
      const rs = [];
      while (rs.length < n) {
        if (n - rs.length >= 2 && rng.next() < 0.5) {
          const re = rng.uniform(-4, 1);
          const im = rng.uniform(0.3, 5);
          rs.push(cx(re, im), cx(re, -im));
        } else rs.push(cx(rng.uniform(-6, 2)));
      }
      const p = pfromRoots(rs);
      const C = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === 0 ? -p[j + 1] : j === i - 1 ? 1 : 0)));
      expectRootsClose(eigvals(C), rs, 1e-6);
    }
  });
  it('is invariant under similarity transforms', () => {
    const rng = makeRng(11);
    for (let t = 0; t < 50; t++) {
      const n = rng.int(2, 8);
      const D = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? i - 3.5 : 0)));
      const T = Array.from({ length: n }, () => Array.from({ length: n }, () => rng.uniform(-1, 1)));
      const M = matMul(matMul(T, D), inv(T));
      expectRootsClose(eigvals(M), D.map((r, i) => cx(r[i])), 1e-7);
    }
  });
  it('handles the 12 state quadrotor A matrix (all zero eigenvalues)', () => {
    const g = 9.81;
    const A = Array.from({ length: 12 }, () => new Array(12).fill(0));
    for (let i = 0; i < 3; i++) A[i][i + 3] = 1;
    A[3][6] = -g;
    A[4][7] = g;
    for (let i = 0; i < 3; i++) A[6 + i][9 + i] = 1;
    const ev = eigvals(A);
    expect(ev).toHaveLength(12);
    for (const e of ev) expect(Math.hypot(e.re, e.im)).toBeLessThan(1e-6);
  });
});

describe('expm', () => {
  it('matches closed forms', () => {
    // Rotation generator
    const t = 0.7;
    expect(matClose(expm([[0, t], [-t, 0]]), [[Math.cos(t), Math.sin(t)], [-Math.sin(t), Math.cos(t)]], 1e-13, 1e-14)).toBe(true);
    // Nilpotent double integrator: e^{At} = [[1, t], [0, 1]]
    expect(matClose(expm([[0, 2.5], [0, 0]]), [[1, 2.5], [0, 1]], 1e-14, 1e-14)).toBe(true);
    // Diagonal
    expect(matClose(expm([[1, 0], [0, -20]]), [[Math.E, 0], [0, Math.exp(-20)]], 1e-13, 1e-20)).toBe(true);
  });
  it('handles large norms via scaling and squaring', () => {
    const E = expm([[-50, 1], [0, -60]]);
    expectClose(E[0][0], Math.exp(-50), 1e-10, 0);
    expectClose(E[0][1], (Math.exp(-50) - Math.exp(-60)) / 10, 1e-9, 0);
  });
  it('satisfies e^{A} e^{-A} = I', () => {
    const A = [[0.3, -1.2, 0.5], [2, -0.4, 0.1], [-0.7, 0.9, -1.5]];
    const P = matMul(expm(A), expm(A.map((r) => r.map((a) => -a))));
    expect(matClose(P, eye(3), 1e-12, 1e-12)).toBe(true);
  });
});
