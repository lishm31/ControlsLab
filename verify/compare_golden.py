"""
Regenerate the goldens into a temp folder and compare them with the committed ones.
Numbers are compared with a relative tolerance, because different BLAS builds can
change the last few bits. Exits non-zero if anything drifted.
"""

import json
import math
import pathlib
import subprocess
import sys
import tempfile

HERE = pathlib.Path(__file__).resolve().parent
RTOL = 1e-8
ATOL = 1e-10


def same(a, b, path):
    if isinstance(a, dict):
        if set(a) != set(b):
            raise AssertionError(f"{path}: keys differ")
        for k in a:
            if k != "versions":
                same(a[k], b[k], f"{path}.{k}")
    elif isinstance(a, list):
        if len(a) != len(b):
            raise AssertionError(f"{path}: length {len(a)} vs {len(b)}")
        for i, (x, y) in enumerate(zip(a, b)):
            same(x, y, f"{path}[{i}]")
    elif isinstance(a, float) or isinstance(b, float):
        if a is None or b is None or not math.isclose(a, b, rel_tol=RTOL, abs_tol=ATOL):
            raise AssertionError(f"{path}: {a} vs {b}")
    elif a != b:
        raise AssertionError(f"{path}: {a!r} vs {b!r}")


def main():
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run([sys.executable, str(HERE / "gen_golden.py"), "--out", tmp], check=True)
        bad = 0
        for f in sorted((HERE / "golden").glob("*.json")):
            try:
                same(json.loads(f.read_text()), json.loads((pathlib.Path(tmp) / f.name).read_text()), f.name)
                print(f"ok   {f.name}")
            except AssertionError as e:
                bad += 1
                print(f"DIFF {e}")
        sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
