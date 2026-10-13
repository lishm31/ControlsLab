# Controls Lab

An interactive lab for the control theory half of my Dynamics and Control class at CU Boulder. Every lecture gets a module with a simulation, a visual, and practice problems that I work by hand and then check against the sim.

It runs fully in the browser (Vite, TypeScript, React, Three.js). The math lives in a small TypeScript library in `src/core` that is unit tested and cross-checked against scipy and python-control.

## Modules

| Code | Lecture | Module | Status |
|---|---|---|---|
| C-1 | Oct 13 | Linear Systems Explorer | planned |
| C-2 | Oct 15 | Reaction Wheel Slew | live |
| C-3 | Oct 20 | Laplace Workbench | planned |
| C-4 | Oct 22 | Block Diagram Builder | planned |
| C-5 | Oct 27 | Transfer Function Lab | planned |
| C-6 | Oct 29 | Stability Arena | planned |
| C-7 | Nov 3 | Spec Meter | planned |
| C-8 | Nov 5 | Design Challenges | planned |
| C-9 | Nov 10 | Spacecraft Attitude Lab | planned |
| C-10 | Nov 12 | Quadrotor Lab | planned |
| C-11 | Nov 17 | State Space Studio | planned |
| C-12 | Nov 19 | Exam Mode | planned |
| C-13 | Dec 1 | TF to SS Converter | planned |
| C-14 | Dec 3 | Failure Replays | planned |

Each live module has a writeup next to its code, for example [C-2 notes](src/modules/c02-reaction-wheel/notes.md).

## How the math is checked

- `src/core`: polynomials and roots, eigenvalues, matrix exponential, transfer functions, state space, exact discretized step/impulse/ramp responses, step metrics, Routh arrays, RK4.
- `verify/gen_golden.py` writes about 250 test cases from numpy, scipy, and python-control into `verify/golden/`. The TS tests compare against them. CI regenerates them and fails if anything drifted.
- Each module tests its sim against the closed-form theory from lecture, and runs every practice problem generator over 200 random seeds to make sure the hidden answer is right and that it plays out the same way in the sim.

## Running it

```
npm install
npm run dev        # local dev server
npm test           # all tests
npm run build      # production build into dist/
```

Regenerating the golden files (only needed if the cases change):

```
python -m venv .venv
.venv/bin/pip install -r verify/requirements.txt
.venv/bin/python verify/gen_golden.py
```

## Deploying

`.github/workflows/deploy.yml` runs tests on every push and deploys `main` to GitHub Pages. One time setup: repo Settings, Pages, Source: GitHub Actions.
