/**
 * Parse polynomials in s typed the way you would write them on paper:
 *   "s^2 + 2s + 5", "(s+1)(s+2)", "10(s + 0.5)", "s(s+3)^2", "-2s^3 + s".
 * Returns coefficients highest power first. Throws ParseError with a position on bad input.
 */
import { type Poly, padd, pmul, pscale, ptrim } from './poly';

export class ParseError extends Error {
  constructor(
    msg: string,
    readonly pos: number,
  ) {
    super(msg);
  }
}

type Tok = { t: 'num'; v: number; p: number } | { t: 's'; p: number } | { t: 'op'; v: string; p: number } | { t: 'end'; p: number };

function lex(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (/[0-9.]/.test(c)) {
      const m = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(src.slice(i));
      if (!m) throw new ParseError(`Bad number at ${i + 1}`, i);
      out.push({ t: 'num', v: Number(m[0]), p: i });
      i += m[0].length;
      continue;
    }
    if (c === 's' || c === 'S') {
      out.push({ t: 's', p: i });
      i++;
      continue;
    }
    if ('+-*^()'.includes(c) || c === '−') {
      out.push({ t: 'op', v: c === '−' ? '-' : c, p: i });
      i++;
      continue;
    }
    throw new ParseError(`Unexpected "${c}" at ${i + 1}`, i);
  }
  out.push({ t: 'end', p: src.length });
  return out;
}

export function parsePoly(src: string): Poly {
  if (!src.trim()) throw new ParseError('Empty', 0);
  const toks = lex(src);
  let k = 0;
  const peek = () => toks[k];
  const isOp = (v: string) => {
    const t = peek();
    return t.t === 'op' && t.v === v;
  };
  const expr = (): Poly => {
    let acc = term();
    while (isOp('+') || isOp('-')) {
      const neg = (peek() as { v: string }).v === '-';
      k++;
      const r = term();
      acc = padd(acc, neg ? pscale(r, -1) : r);
    }
    return acc;
  };
  const startsFactor = () => {
    const t = peek();
    return t.t === 'num' || t.t === 's' || (t.t === 'op' && t.v === '(');
  };
  const term = (): Poly => {
    let acc = unary();
    for (;;) {
      if (isOp('*')) {
        k++;
        acc = pmul(acc, unary());
      } else if (startsFactor()) acc = pmul(acc, power());
      else break;
    }
    return acc;
  };
  const unary = (): Poly => {
    if (isOp('-')) {
      k++;
      return pscale(unary(), -1);
    }
    if (isOp('+')) {
      k++;
      return unary();
    }
    return power();
  };
  const power = (): Poly => {
    const base = primary();
    if (isOp('^')) {
      k++;
      const t = peek();
      if (t.t !== 'num' || !Number.isInteger(t.v) || t.v < 0 || t.v > 20) throw new ParseError(`Exponent must be a whole number 0 to 20 (at ${t.p + 1})`, t.p);
      k++;
      let r: Poly = [1];
      for (let i = 0; i < t.v; i++) r = pmul(r, base);
      return r;
    }
    return base;
  };
  const primary = (): Poly => {
    const t = peek();
    if (t.t === 'num') {
      k++;
      return [t.v];
    }
    if (t.t === 's') {
      k++;
      return [1, 0];
    }
    if (t.t === 'op' && t.v === '(') {
      k++;
      const e = expr();
      if (!isOp(')')) throw new ParseError(`Missing ")" at ${peek().p + 1}`, peek().p);
      k++;
      return e;
    }
    throw new ParseError(t.t === 'end' ? 'Expression ends early' : `Unexpected token at ${t.p + 1}`, t.p);
  };
  const out = expr();
  if (peek().t !== 'end') throw new ParseError(`Unexpected input at ${peek().p + 1}`, peek().p);
  return ptrim(out.map((c) => (Object.is(c, -0) ? 0 : c)));
}
