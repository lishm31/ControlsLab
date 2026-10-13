/**
 * Partial fractions and inverse Laplace transforms of rational functions.
 *
 *   F(s) = k(s) + sum over poles p, powers j = 1..m of  r_{p,j} / (s - p)^j
 *
 * Repeated poles are found by clustering roots within a tolerance (scipy.signal.residue
 * does the same, tol = 1e-3) and averaging the cluster. Residues come from a Taylor
 * expansion of (s - p)^m F(s) around p, which avoids numerical differentiation.
 */
import { type Complex, cabs, cadd, cdiv, cmul, csub, cx, cscale, ZERO } from './complex';
import { type Poly, pdiv, ptrim } from './poly';
import { roots, sortRoots } from './roots';

export interface PFTerm {
  pole: Complex;
  power: number; // j in r / (s - p)^j
  coeff: Complex;
}

export interface PartialFractions {
  direct: Poly; // polynomial part k(s), [0] when F is strictly proper
  terms: PFTerm[];
}

export interface PoleCluster {
  pole: Complex;
  mult: number;
}

export function clusterRoots(rs: Complex[], tol = 1e-3): PoleCluster[] {
  const used = new Array(rs.length).fill(false);
  const out: PoleCluster[] = [];
  for (let i = 0; i < rs.length; i++) {
    if (used[i]) continue;
    const group = [rs[i]];
    used[i] = true;
    for (let j = i + 1; j < rs.length; j++)
      if (!used[j] && cabs(csub(rs[i], rs[j])) <= tol * Math.max(1, cabs(rs[i]))) {
        group.push(rs[j]);
        used[j] = true;
      }
    const mean = cscale(group.reduce(cadd, ZERO), 1 / group.length);
    // Snap tiny imaginary parts so real repeated poles stay real.
    out.push({ pole: Math.abs(mean.im) < 1e-9 * Math.max(1, cabs(mean)) ? cx(mean.re) : mean, mult: group.length });
  }
  return out;
}

/** Complex polynomial from roots, highest power first. */
function cpolyFromRoots(rs: Complex[], lead: number): Complex[] {
  let p: Complex[] = [cx(lead)];
  for (const z of rs) {
    const next: Complex[] = new Array(p.length + 1).fill(ZERO);
    for (let i = 0; i < p.length; i++) {
      next[i] = cadd(next[i], p[i]);
      next[i + 1] = csub(next[i + 1], cmul(p[i], z));
    }
    p = next;
  }
  return p;
}

/** Taylor coefficients of P(p + h) in ascending powers of h, by repeated synthetic division. */
function taylorAt(P: Complex[], p: Complex, count: number): Complex[] {
  let q = P.slice();
  const out: Complex[] = [];
  for (let k = 0; k < count; k++) {
    if (q.length === 0) {
      out.push(ZERO);
      continue;
    }
    const quot: Complex[] = [];
    let acc: Complex = ZERO;
    for (let i = 0; i < q.length; i++) {
      acc = cadd(cmul(acc, p), q[i]);
      if (i < q.length - 1) quot.push(acc);
    }
    out.push(acc);
    q = quot;
  }
  return out;
}

export function partialFractions(num: Poly, den: Poly, tol = 1e-3): PartialFractions {
  const d = ptrim(den);
  const n = ptrim(num);
  const { q, r } = d.length <= n.length ? pdiv(n, d) : { q: [0], r: n };
  const lead = d[0];
  const clusters = clusterRoots(roots(d), tol);
  const rem = r.map((c) => cx(c));
  const terms: PFTerm[] = [];
  for (const c of clusters) {
    // D_p(s) = lead * prod over the other poles (s - q)^m_q
    const others: Complex[] = [];
    for (const o of clusters) if (o !== c) for (let i = 0; i < o.mult; i++) others.push(o.pole);
    const Dp = cpolyFromRoots(others, lead);
    const nT = taylorAt(rem, c.pole, c.mult);
    const dT = taylorAt(Dp, c.pole, c.mult);
    const cs: Complex[] = [];
    for (let j = 0; j < c.mult; j++) {
      let acc = nT[j];
      for (let i = 1; i <= j; i++) acc = csub(acc, cmul(dT[i], cs[j - i]));
      cs.push(cdiv(acc, dT[0]));
    }
    // c_j multiplies 1 / (s - p)^(m - j)
    for (let j = 0; j < c.mult; j++) terms.push({ pole: c.pole, power: c.mult - j, coeff: cs[j] });
  }
  terms.sort((a, b) => a.pole.re - b.pole.re || a.pole.im - b.pole.im || a.power - b.power);
  return { direct: ptrim(q), terms };
}

/** A real time-domain term from one real pole or one conjugate pair. */
export type TimeTerm =
  | { kind: 'real'; a: number; p: number; k: number } // a t^(k-1)/(k-1)! e^{p t}
  | { kind: 'osc'; A: number; B: number; sigma: number; omega: number; k: number }; // t^(k-1)/(k-1)! e^{sigma t}(A cos wt + B sin wt)

const fact = (k: number): number => (k <= 1 ? 1 : k * fact(k - 1));

/** Group conjugate terms into real cosine/sine terms (the inverse Laplace transform, t >= 0). */
export function timeTerms(pf: PartialFractions): TimeTerm[] {
  const out: TimeTerm[] = [];
  for (const t of pf.terms) {
    if (Math.abs(t.pole.im) < 1e-12) out.push({ kind: 'real', a: t.coeff.re, p: t.pole.re, k: t.power });
    else if (t.pole.im > 0)
      // r e^{pt} + conj = 2 Re(r e^{pt}) = e^{st}(2 Re r cos wt - 2 Im r sin wt)
      out.push({ kind: 'osc', A: 2 * t.coeff.re, B: -2 * t.coeff.im, sigma: t.pole.re, omega: t.pole.im, k: t.power });
  }
  return out;
}

export function evalTimeTerm(term: TimeTerm, t: number): number {
  const tk = term.k === 1 ? 1 : t ** (term.k - 1) / fact(term.k - 1);
  if (term.kind === 'real') return term.a * tk * Math.exp(term.p * t);
  return tk * Math.exp(term.sigma * t) * (term.A * Math.cos(term.omega * t) + term.B * Math.sin(term.omega * t));
}

/** Inverse Laplace transform for t > 0 (impulses from a direct term are not included). */
export function ilaplace(num: Poly, den: Poly) {
  const pf = partialFractions(num, den);
  const terms = timeTerms(pf);
  return { pf, terms, f: (t: number) => terms.reduce((s, term) => s + evalTimeTerm(term, t), 0) };
}

export { sortRoots };
