# Controls Lab: working conventions

Controls Lab is an interactive web lab for the control theory half of a Dynamics and Control course (CU Boulder, ASEN). One module per lecture (C-1 to C-14). Each module has a sim, a visual, and practice problems you solve by hand and then check against the sim. It is also a portfolio piece, so the math must be correct, tested, and defensible.

## Commands

```
npm install            # once
npm run dev            # local dev server
npm test               # all Vitest suites (core, golden, engine, modules)
npm run typecheck      # tsc, strict
npm run build          # typecheck + production build into dist/
python -m venv .venv && .venv/bin/pip install -r verify/requirements.txt
.venv/bin/python verify/gen_golden.py   # regenerate golden JSON (deterministic)
```

## Layout

- `src/core/` pure TypeScript math. No DOM, no React, no Three imports (a test enforces this). Everything here is unit tested, and the numerical pieces are also tested against `verify/golden/*.json`.
- `src/engine/` the shared practice problem engine: types, tolerance checking, progress storage, generator registry.
- `src/ui/` design system primitives. `src/plot/` the SVG plot system. `src/viz3d/` the Three.js scene kit (spacecraft, environment).
- `src/app/` shell: router, layout, theme, module index.
- `src/modules/<cNN-name>/` one self-contained folder per lecture: `model.ts`, `sim.ts`, `problems.ts`, `Lab.tsx`, `visual/`, `notes.md`, `__tests__/`. Modules import from core, engine, ui, plot, viz3d, never from another module.
- `src/modules/manifest.ts` the catalog of all 14 modules and their lecture dates.
- `verify/` Python (scipy, python-control) scripts that write golden JSON. The goldens are committed. CI regenerates them and fails if they drift.

## Definition of done for a module

1. Model, sim, visual, and problems built.
2. Tests pass: sim vs closed-form theory, physical invariants (momentum, saturation limits), and every problem generator over 200 seeds (`check(solve())` passes, `toSim(solve())` reproduces the answer in the sim, design problems have a valid answer).
3. `notes.md` has the portfolio writeup: derivation, results, what surprised me, where theory and sim disagreed and why.

## Math conventions

- SI units internally. Angles in rad internally, shown in deg in the UI. Wheel speed shown in rpm.
- Polynomials are coefficient arrays, highest power first (same as numpy and MATLAB).
- Settling time uses a 2% band, rise time is 10 to 90%. Same definitions as `control.step_info`.
- Any formula shown in the UI or in a solution step must have a test that checks it against the sim or a golden file.

## Practice problems

- Generators are seeded (`core/rng.ts`), so `generatorId + seed` reproduces a problem.
- Never render the answer unless the student clicks reveal and confirms. Revealing counts as not solved.
- Design problems are judged by running the sim against specs, so any valid answer passes.
- Problem style mirrors the homework for that stretch: given numbers with units, find quantities with units.

## Visual rules

- Mission control / flight software look. Dark default, light theme available.
- Fonts: IBM Plex Sans Condensed (UI), JetBrains Mono (all numerics, units, telemetry).
- One accent color (signal amber, `--accent`). Semantic colors (`--ok`, `--caution`, `--alarm`) only for status, always with a text label.
- No emoji. No gradients for decoration. No centered hero. No rounded-card look: square corners (2px max), 1px rules, tight 8px grid.
- Motion only when it carries information. Respect `prefers-reduced-motion`.
- Works at phone width (390px). Keyboard focus is always visible.
- Anything that moves in 3D is tied to the physics (the reaction wheel spin is the integral of the simulated wheel speed).

## Writing voice (notes.md, README, UI copy)

Plain student voice, casual and direct. No hype words (no "powerful", "seamless", "cutting-edge", etc.). No em dashes. Short sentences are fine.

## Process

- One commit per meaningful step, clear message.
- Ask before adding any dependency beyond: react, react-dom, three, katex, vite, @vitejs/plugin-react, typescript, vitest, and their @types.
- Failure Replays (C-14) are simplified, clearly labeled educational reconstructions with cited sources. Never claim to reproduce actual flight software.
- Deploys to GitHub Pages from `main` via `.github/workflows/deploy.yml` (Settings > Pages > Source must be "GitHub Actions").
