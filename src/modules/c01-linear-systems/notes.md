# C-1 Linear Systems Explorer

Lecture C-1 (Oct 13): linear dynamical systems and their solutions. Homework stretch: HW C-1, due Oct 23.

The point of this module: every unforced second order system is one of a handful of shapes, and you can read which one straight off the eigenvalues.

> Draft note: "what surprised me" is written from the sim results but needs to be rewritten in my own words before it goes in the portfolio.

## Model

$$\ddot x + 2\zeta\omega_n\dot x \pm \omega_n^2 x = 0$$

The plus sign is a normal spring. The minus sign is negative stiffness, which is what you get when you linearize about an unstable equilibrium (like an inverted pendulum). With the state $\mathbf x = [x,\ \dot x]^T$:

$$\dot{\mathbf x} = A\mathbf x, \qquad A = \begin{bmatrix} 0 & 1 \\ \mp\omega_n^2 & -2\zeta\omega_n \end{bmatrix}$$

The eigenvalues of A solve $\det(\lambda I - A) = \lambda^2 + 2\zeta\omega_n\lambda \pm \omega_n^2 = 0$, which is exactly the characteristic equation you get by plugging $e^{\lambda t}$ into the ODE. The code checks this both ways: the QR eigenvalue routine on A against the polynomial roots.

## The cases

| Eigenvalues | Name | Phase portrait |
|---|---|---|
| complex, Re < 0 | underdamped, 0 < ζ < 1 | stable spiral |
| repeated real < 0 | critically damped, ζ = 1 | degenerate node |
| two real < 0 | overdamped, ζ > 1 | stable node |
| purely imaginary | undamped, ζ = 0 | center (closed ellipse) |
| Re > 0 | negative damping | unstable spiral or node |
| one + and one − | negative stiffness | saddle |

Closed forms used in the code (and in the solution steps):

- Complex pair $-\sigma \pm j\omega_d$: $x(t) = e^{-\sigma t}\left(x_0\cos\omega_d t + \frac{v_0 + \sigma x_0}{\omega_d}\sin\omega_d t\right)$
- Double root λ: $x(t) = \left(x_0 + (v_0 - \lambda x_0)t\right)e^{\lambda t}$
- Distinct real roots: $x(t) = c_1e^{\lambda_1 t} + c_2e^{\lambda_2 t}$ with $c_1 = \frac{v_0 - \lambda_2 x_0}{\lambda_1 - \lambda_2}$, $c_2 = \frac{\lambda_1 x_0 - v_0}{\lambda_1 - \lambda_2}$

## How the sim works

No numerical integration at all. The sim steps the state with the matrix exponential, $\mathbf x_{k+1} = e^{A\Delta t}\mathbf x_k$, which is exact for a linear system no matter how big the step is. The matrix exponential itself is tested against scipy. The tests then check that the closed forms above match this exact sim to about 1e-9 in all six regimes, and that the undamped case conserves $\omega_n^2x^2 + \dot x^2$ at every sample.

## Linearization

The pendulum problem is the course description in one example. $mL^2\ddot\theta + c\dot\theta + mgL\sin\theta = 0$.

- About θ = 0, $\sin\theta \approx \delta\theta$: a normal oscillator with $\omega_n = \sqrt{g/L}$ and $\zeta = c/(2mL^2\omega_n)$.
- About θ = π, $\sin(\pi + \delta\theta) \approx -\delta\theta$: the stiffness flips sign and you get a saddle. One eigenvalue is always positive because the product of the roots is $-g/L < 0$.

The pendulum picture flags anything past 30 deg, because at 30 deg $\sin\theta$ is already 4.5% smaller than $\theta$ and the linear model starts lying.

## What surprised me

- "Critically damped never crosses zero" is only true starting from rest. With $\dot x(0) < -\omega_n x_0$ (throwing it hard toward zero), the double root solution crosses once and comes back. The formula says it directly: $x_0 + (v_0 + \omega_n x_0)t$ hits zero when the bracket changes sign.
- In the overdamped case, trajectories in the phase portrait first snap onto the slow eigenvector and then slide along it to the origin. The slow eigenvalue sets the settling time, which is why heavy damping makes things slower, not faster.
- Watching the eigenvalues as ζ sweeps: they move around a circle of radius ωn until they collide on the real axis at ζ = 1, then split and slide apart. ωn really is just the distance from the origin.
- The 2% envelope time is $\ln 50/\sigma \approx 3.9/\sigma$. The "4" in $4/\sigma$ is rounding up.

## Where theory and sim disagree

In this module they basically don't. Both the sim and the closed forms are exact, and they agree to around 1e-9. The only gaps are:

- Settling time: the actual response usually gets inside 2% a bit before the envelope does, because the sinusoid isn't at a peak when the envelope crosses 2%.
- The pendulum picture is driven by the linear model. Past about 30 deg the real pendulum would behave differently. That's the linearization breaking down, not a bug in the sim.

## Practice problems

Six types, in HW C-1 style, each tested over 200 seeds and played back through the sim:

1. m, c, k to ωn, ζ, ωd.
2. Eigenvalues of the state matrix (either a complex pair or two real ones).
3. Free response value $x(t_1)$ from initial conditions.
4. Linearize a pendulum about hanging or inverted.
5. Damped period, 2% envelope time, and ζ from eigenvalues.
6. Choose a damper c to meet a swing-past-zero limit and a settling deadline (judged by the sim, any valid c passes).
