/** Matrix exponential by Pade(13) scaling and squaring (Higham 2005), the same method as scipy.linalg.expm. */
import { type Matrix, eye, matAdd, matMul, matScale, norm1, solve } from './linalg';

const B13 = [
  64764752532480000, 32382376266240000, 7771770303897600, 1187353796428800, 129060195264000,
  10559470521600, 670442572800, 33522128640, 1323241920, 40840800, 960960, 16380, 182, 1,
];
const THETA13 = 5.371920351148152;

export function expm(A: Matrix): Matrix {
  const n = A.length;
  if (n === 0) return [];
  const nrm = norm1(A);
  const s = nrm > THETA13 ? Math.ceil(Math.log2(nrm / THETA13)) : 0;
  const As = s > 0 ? matScale(A, 2 ** -s) : A;
  const I = eye(n);
  const A2 = matMul(As, As);
  const A4 = matMul(A2, A2);
  const A6 = matMul(A4, A2);
  const lin = (terms: [number, Matrix][]) => terms.reduce((acc, [c, M]) => matAdd(acc, matScale(M, c)), matScale(I, 0));
  const U = matMul(
    As,
    matAdd(matMul(A6, lin([[B13[13], A6], [B13[11], A4], [B13[9], A2]])), lin([[B13[7], A6], [B13[5], A4], [B13[3], A2], [B13[1], I]])),
  );
  const V = matAdd(matMul(A6, lin([[B13[12], A6], [B13[10], A4], [B13[8], A2]])), lin([[B13[6], A6], [B13[4], A4], [B13[2], A2], [B13[0], I]]));
  let R = solve(matAdd(V, matScale(U, -1)), matAdd(V, U));
  for (let k = 0; k < s; k++) R = matMul(R, R);
  return R;
}
