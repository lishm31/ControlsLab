"""
Generate golden test cases for the TypeScript core from numpy, scipy, and python-control.

Run from the repo root:
    .venv/bin/python verify/gen_golden.py            # writes verify/golden/*.json
    .venv/bin/python verify/gen_golden.py --out DIR  # writes somewhere else (used by compare_golden.py)

Everything is seeded, so the output only changes if the cases or the library versions change.
Polynomials are coefficient lists, highest power first. Complex numbers are [re, im].
"""

import argparse
import warnings
import json
import pathlib

import control
import numpy as np
import scipy
import scipy.linalg
import scipy.signal

HERE = pathlib.Path(__file__).resolve().parent
warnings.filterwarnings("ignore", message="System has direct feedthrough")


def cplx(zs):
    zs = sorted(np.asarray(zs, dtype=complex).tolist(), key=lambda z: (z.real, z.imag))
    return [[float(z.real), float(z.imag)] for z in zs]


def mat(a):
    return np.asarray(a, dtype=float).tolist()


def random_stable_poly(rng, n, allow_rhp=False):
    rs = []
    while len(rs) < n:
        lo = -6.0
        hi = 2.0 if allow_rhp else -0.2
        if n - len(rs) >= 2 and rng.random() < 0.5:
            re = rng.uniform(lo, hi)
            im = rng.uniform(0.3, 6.0)
            rs += [complex(re, im), complex(re, -im)]
        else:
            rs.append(complex(rng.uniform(lo, hi), 0))
    return np.real(np.poly(rs))


# ---------------------------------------------------------------- roots
def gen_roots(rng):
    fixed = [
        [1, 3, 2],
        [1, 2, 5],
        [1, 6, 11, 6],
        [1, 0, -7, 6],
        [1, 1, 5, 4, 4],
        [2, 3, 4, 5, 6, 7],
        [1, 0, 0, 0, 1],
        [1, -2, 3, -4, 5, -6, 7],
    ]
    cases = [{"coeffs": c, "roots": cplx(np.roots(c)), "tol": 1e-9} for c in fixed]
    for _ in range(40):
        n = int(rng.integers(3, 11))
        p = random_stable_poly(rng, n, allow_rhp=True) * rng.uniform(0.5, 3)
        cases.append({"coeffs": p.tolist(), "roots": cplx(np.roots(p)), "tol": 1e-7})
    # Repeated roots: both numpy and Aberth lose accuracy here, so the tolerance is loose.
    for p in ([1, 4, 6, 4, 1], np.poly([-2, -2, -1 + 1j, -1 - 1j]).real.tolist()):
        cases.append({"coeffs": list(map(float, p)), "roots": cplx(np.roots(p)), "tol": 1e-3})
    return cases


# ---------------------------------------------------------------- eig, expm
def gen_matrices(rng):
    eig_cases, expm_cases = [], []
    g = 9.81
    quad_long = [[0, 1, 0, 0], [0, 0, -g, 0], [0, 0, 0, 1], [0, 0, 0, 0]]
    fixed = [
        [[0, 1], [-4, -1]],
        [[0, 1], [0, 0]],
        [[-1, 2, 0], [0, -1, 3], [0, 0, -2]],
        [[0.3, -1.2, 0.5], [2, -0.4, 0.1], [-0.7, 0.9, -1.5]],
    ]
    for A in fixed:
        eig_cases.append({"A": mat(A), "eig": cplx(np.linalg.eigvals(A)), "tol": 1e-9})
        expm_cases.append({"A": mat(A), "expm": mat(scipy.linalg.expm(A))})
    expm_cases.append({"A": mat(quad_long), "expm": mat(scipy.linalg.expm(quad_long))})
    for _ in range(30):
        n = int(rng.integers(2, 9))
        A = rng.normal(size=(n, n))
        eig_cases.append({"A": mat(A), "eig": cplx(np.linalg.eigvals(A)), "tol": 1e-8})
        expm_cases.append({"A": mat(A * rng.uniform(0.1, 3)), "expm": None})
    for c in expm_cases:
        if c["expm"] is None:
            c["expm"] = mat(scipy.linalg.expm(c["A"]))
    return eig_cases, expm_cases


# ---------------------------------------------------------------- transfer functions
def tfd(sys):
    num = np.atleast_1d(np.squeeze(sys.num[0][0])).astype(float)
    den = np.atleast_1d(np.squeeze(sys.den[0][0])).astype(float)
    lead = den[0]
    return {"num": (num / lead).tolist(), "den": (den / lead).tolist()}


def gen_tf(rng):
    cases = []
    pairs = [
        (([1], [1, 1]), ([1], [1, 2])),
        (([4], [1, 1, 0]), ([1], [1, 5])),
        (([1, 3], [1, 3, 2]), ([2], [1])),
        (([10, 20], [1, 4, 8, 0]), ([1, 1], [1, 10])),
    ]
    for _ in range(20):
        n = int(rng.integers(1, 5))
        m = int(rng.integers(0, n + 1))
        k = int(rng.integers(1, 3))
        G = (rng.uniform(-3, 3, size=m + 1).tolist(), random_stable_poly(rng, n, allow_rhp=True).tolist())
        H = (rng.uniform(0.2, 3, size=1).tolist(), random_stable_poly(rng, k).tolist())
        pairs.append((G, H))
    for (gn, gd), (hn, hd) in pairs:
        G = control.tf(gn, gd)
        H = control.tf(hn, hd)
        dc = control.dcgain(G)
        cases.append(
            {
                "G": {"num": list(map(float, gn)), "den": list(map(float, gd))},
                "H": {"num": list(map(float, hn)), "den": list(map(float, hd))},
                "series": tfd(control.series(G, H)),
                "parallel": tfd(control.parallel(G, H)),
                "feedback": tfd(control.feedback(G, H)),
                "poles": cplx(control.poles(G)),
                "zeros": cplx(control.zeros(G)),
                "dcgain": float(dc) if np.isfinite(dc) else None,
            }
        )
    return cases


# ---------------------------------------------------------------- conversions
def gen_convert(rng):
    tf2ss_cases, ss2tf_cases = [], []
    fixed = [([1, 3], [1, 3, 2]), ([2, 1, 1], [1, 3, 2]), ([5], [1, 4, 6, 4]), ([1, 0], [2, 3, 1])]
    for _ in range(20):
        n = int(rng.integers(1, 6))
        m = int(rng.integers(0, n + 1))
        fixed.append((rng.uniform(-3, 3, size=m + 1).tolist(), random_stable_poly(rng, n, allow_rhp=True).tolist()))
    for num, den in fixed:
        A, B, C, D = scipy.signal.tf2ss(num, den)
        tf2ss_cases.append(
            {"num": list(map(float, num)), "den": list(map(float, den)), "A": mat(A), "B": mat(B), "C": mat(C), "D": mat(D)}
        )
    for _ in range(25):
        n = int(rng.integers(1, 7))
        A = rng.normal(size=(n, n))
        B = rng.normal(size=(n, 1))
        C = rng.normal(size=(1, n))
        D = rng.normal(size=(1, 1)) if rng.random() < 0.3 else np.zeros((1, 1))
        num, den = scipy.signal.ss2tf(A, B, C, D)
        ss2tf_cases.append({"A": mat(A), "B": mat(B), "C": mat(C), "D": mat(D), "num": num[0].tolist(), "den": den.tolist()})
    return tf2ss_cases, ss2tf_cases


# ---------------------------------------------------------------- time responses and metrics
def gen_responses(rng):
    systems = [
        ([1], [1, 1], 8),
        ([4], [1, 1.6, 4], 12),
        ([9], [1, 0.6, 9], 25),
        ([1, 2], [1, 3, 2], 8),
        ([-1, 2], [1, 3, 2], 8),  # RHP zero: undershoot
        ([2, 1, 1], [1, 3, 2], 8),  # biproper, D != 0
        ([5], [1, 4, 6, 4], 15),
        ([10], [1, 2, 10], 8),
    ]
    for _ in range(12):
        n = int(rng.integers(2, 5))
        den = random_stable_poly(rng, n)
        num = [float(den[-1])]  # unity DC gain
        p = np.roots(den)
        tend = float(min(60.0, 8.0 / np.min(-p.real)))
        systems.append((num, den.tolist(), tend))
    cases = []
    for num, den, tend in systems:
        G = control.tf(num, den)
        T = np.linspace(0, tend, 1001)
        _, ys = control.step_response(G, T)
        _, yi = control.impulse_response(G, T)
        info = control.step_info(G, T=T)
        yfinal = float(control.dcgain(G))
        cases.append(
            {
                "num": list(map(float, num)),
                "den": list(map(float, den)),
                "tEnd": tend,
                "n": len(T),
                "step": np.squeeze(ys).tolist(),
                "impulse": np.squeeze(yi).tolist(),
                "yFinal": yfinal,
                "info": {
                    "riseTime": float(info["RiseTime"]),
                    "settlingTime": float(info["SettlingTime"]),
                    "overshoot": float(info["Overshoot"]),
                    "undershoot": float(info["Undershoot"]),
                    "peak": float(info["Peak"]),
                    "peakTime": float(info["PeakTime"]),
                    "steadyState": float(info["SteadyStateValue"]),
                },
            }
        )
    return cases


# ---------------------------------------------------------------- Routh (checked against root counts)
def gen_routh(rng):
    cases = []
    for _ in range(40):
        n = int(rng.integers(2, 9))
        p = random_stable_poly(rng, n, allow_rhp=True)
        r = np.roots(p)
        if np.min(np.abs(r.real)) < 0.05:
            continue
        cases.append({"coeffs": p.tolist(), "rhp": int(np.sum(r.real > 0))})
    return cases


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(HERE / "golden"))
    args = ap.parse_args()
    out = pathlib.Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(20261013)

    eig_cases, expm_cases = gen_matrices(rng)
    tf2ss_cases, ss2tf_cases = gen_convert(rng)
    files = {
        "roots.json": gen_roots(rng),
        "eig.json": eig_cases,
        "expm.json": expm_cases,
        "tf.json": gen_tf(rng),
        "tf2ss.json": tf2ss_cases,
        "ss2tf.json": ss2tf_cases,
        "responses.json": gen_responses(rng),
        "routh.json": gen_routh(rng),
    }
    meta = {"numpy": np.__version__, "scipy": scipy.__version__, "control": control.__version__}
    for name, data in files.items():
        payload = {"generator": "verify/gen_golden.py", "versions": meta, "cases": data}
        (out / name).write_text(json.dumps(payload, indent=1, sort_keys=True) + "\n")
        print(f"wrote {name}: {len(data)} cases")


if __name__ == "__main__":
    main()
