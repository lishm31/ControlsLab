# C-2 Reaction Wheel Slew

Lecture C-2 (Oct 15): feedback control basics. Homework stretch: HW C-1, due Oct 23.

The question this module answers: if I want to turn a spacecraft 30 degrees about one axis, why not just fire the wheel one way and then the other (open loop), and what does feedback buy me?

> Draft note: the "what surprised me" section is written from the sim results, but it should be in my own words. Rewrite those lines before this goes in the portfolio.

## Model

One axis, rigid body, no coupling to the other axes:

$$I\ddot\theta = u + d$$

`u` is the torque from the reaction wheel and `d` is a constant disturbance torque (solar pressure, gravity gradient, a stuck thruster, whatever). The wheel makes torque by spinning up the other way, so the wheel obeys

$$I_w\dot\omega_w = -u$$

Adding the two equations and integrating from rest:

$$I_w\omega_w + I\dot\theta = \int_0^t d\,dt$$

With no disturbance that is just $I_w\omega_w = -I\dot\theta$, the total momentum stays zero. The sim integrates the wheel as its own state instead of using that shortcut, and a test checks that the bookkeeping holds at every sample. With a disturbance the wheel slowly picks up the momentum the disturbance dumps in, which is why real spacecraft need momentum dumping.

`I` is the inertia the controller was designed with. The true inertia is $I_a = I(1+e)$. The controller and the open loop plan only know `I`. That gap is the whole point of the inertia error slider.

Default numbers are small sat sized: I = 50 kg m², wheel Iw = 0.02 kg m², torque limit 0.2 N m, 30 deg slew.

## Open loop: bang-bang

Push with $+u^*$ for a time $t_s$, then $-u^*$ for another $t_s$. By symmetry half the angle is covered while speeding up:

$$\frac{\theta_1}{2} = \frac{1}{2}\frac{u^*}{I}t_s^2 \quad\Rightarrow\quad t_s = \sqrt{\frac{I\theta_1}{u^*}}$$

Peak rate is at the switch, $\dot\theta_{max} = u^* t_s / I$, and the peak wheel speed is $I\dot\theta_{max}/I_w$.

If the real inertia is $I(1+e)$, both phases still take the same time and use the same torque, so the rate still comes back to exactly zero. It just covers less angle:

$$\theta_f = \frac{u^*}{I_a}t_s^2 = \frac{\theta_1}{1+e}$$

So the spacecraft stops, looks perfectly calm, and is pointed at the wrong thing. Nothing in the open loop law can notice.

## Feedback: PD

$$u = K_p(\theta_1 - \theta) - K_D\dot\theta$$

Plug in and rearrange:

$$I\ddot\theta + K_D\dot\theta + K_p\theta = K_p\theta_1 + d$$

Matching to $s^2 + 2\zeta\omega_n s + \omega_n^2$:

$$\omega_n = \sqrt{K_p/I}, \qquad \zeta = \frac{K_D}{2\sqrt{K_p I}}$$

Overshoot is $100\,e^{-\pi\zeta/\sqrt{1-\zeta^2}}$ and the usual settling estimate is $4/(\zeta\omega_n)$.

At steady state the rate and acceleration are zero, so $K_p(\theta_1 - \theta_{ss}) + d = 0$, which gives an offset of

$$\theta_{ss} - \theta_1 = d/K_p$$

KD has no effect on it. Only a stiffer Kp shrinks it (or integral action, which is a later lecture).

I also worked out the peak body rate for the ideal response so the table has a theory value for the wheel. The rate is $\theta_1\frac{\omega_n}{\sqrt{1-\zeta^2}}e^{-\zeta\omega_n t}\sin(\omega_d t)$, its max is where $\tan(\omega_d t^*) = \sqrt{1-\zeta^2}/\zeta$, and the peak wheel speed is $I\dot\theta_{max}/I_w$.

## How the sim works

- RK4, 4000 steps over a window that scales with the slowest pole.
- PD is evaluated inside every RK stage, so it behaves like the analog law from lecture.
- Bang-bang uses a step size that puts the switch time exactly on the grid, so the piecewise constant torque is integrated exactly. That is why the bang-bang tests pass to about 1e-12.
- Metrics (overshoot, peak time, 2% settling) use the same definitions as python-control's `step_info`. The core library is checked against scipy and python-control golden files.

## Results (default numbers)

PD with Kp = 0.5 N m/rad, KD = 7 N m s/rad, so wn = 0.1 rad/s and zeta = 0.7:

| | Theory | Sim |
|---|---|---|
| Overshoot | 4.60 % | 4.60 % |
| Peak time | 43.99 s | 43.98 s |
| 2% settling | 57.1 s (estimate) | 59.8 s |
| Peak torque | 0.262 N m | 0.262 N m |
| Peak wheel speed | 573 rpm | 573 rpm |

Bang-bang with u* = 0.1 N m: switch at 16.18 s, done at 32.4 s, ends at 30.000 deg with zero rate, peak wheel 773 rpm.

Same bang-bang with the true inertia 20% high: stops dead at 25.000 deg, which is exactly 30/1.2.

Same bang-bang with d = 0.001 N m: 30.6 deg at the end of the maneuver and still drifting, 31.5 deg by the end of the window. PD with the same disturbance settles at 30.115 deg, which is d/Kp = 0.002 rad = 0.115 deg.

## What surprised me

- The 2% settling estimate 4/(zeta wn) is rougher than I expected. Across zeta from 0.2 to 0.9 the real settling time was anywhere from 0.75x to 1.06x the estimate, and it jumps around instead of drifting smoothly. The reason is that the response leaves the 2% band at a peak or a trough, so a tiny change in zeta can skip a whole half oscillation. For zeta = 1 the estimate is 30% too short and for zeta = 1.5 it is 4x too short, because the slow real pole dominates and 4/(zeta wn) does not even use the right pole.
- In bang-bang, the peak wheel speed does not depend on the true inertia at all. The wheel only sees torque times time, $I_w\omega_w = u^* t_s$, and both are set by the plan. The body turns slower but the wheel spins up exactly the same.
- Turning on the torque limit made overshoot go down, not up (4.60% to 3.84% at 0.05 N m), while settling got longer (59.8 s to 68.8 s). Saturation cuts the initial kick, so the spacecraft builds up less speed, and the derivative term has an easier time braking.
- Running the PD law as a digital controller at 1 Hz instead of continuously barely changed anything (4.60% to 4.62% overshoot). The loop is so slow (wn = 0.1 rad/s) that a one second hold is nothing. This will matter a lot more for the quadrotor.

## Where theory and sim disagree, and why

The theory vs measured table flags these live:

- **Settling time.** Always a little off because 4/(zeta wn) is an envelope estimate, not a measurement. Way off when zeta >= 1.
- **Torque limit.** The formulas assume the controller gets whatever torque it asks for. Once the command clips, the response is no longer second order and none of the formulas strictly apply.
- **Inertia error.** All theory values use the nominal I, because that is what a real engineer would have on paper. The sim uses the true one. For PD, the closed loop poles move (the pole plot shows both sets), so wn, zeta, overshoot, and peak time all shift. For bang-bang the final angle is off by theta1/(1+e).
- **Disturbance.** Shifts the final value by d/Kp. Overshoot is still measured against the new final value, so it barely changes.

## Practice problems

Six types, randomized, styled like HW C-1. Every generator is tested over 200 seeds, and its answer is played back through the sim in the tests:

1. Read the gains: wn, zeta, overshoot, settling estimate from I, Kp, KD.
2. Gains from wn and zeta.
3. Meet a spec: design Kp and KD for an overshoot and settling spec. The sim judges it, so any design that meets both passes.
4. Plan a bang-bang slew: switch time, peak rate, peak wheel rpm.
5. Inertia error: where an open loop slew actually stops.
6. Disturbance: steady-state offset, and the smallest Kp that keeps it under a limit.
