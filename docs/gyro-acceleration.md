# Gyro acceleration guide

How gyro acceleration works on the Alpakka (custom firmware), what every setting
does, and which values to start from.

---

## 1. What acceleration does

Without acceleration, the gyro is linear: turning the controller twice as fast
moves the camera exactly twice as fast. A 180° in-game turn always needs the
same amount of wrist rotation, no matter how quickly you do it.

With acceleration, the controller multiplies its output by a **gain** that
depends on **how fast you are rotating it**:

- **Slow movements** (aiming, tracking): gain stays around **1×**, so aim is
  precise and predictable.
- **Fast movements** (flicks, turns): gain rises, up to several times, so a
  small wrist snap produces a big turn.

The result: precise aim *and* 180 / 360 turns without moving your hands much.

Speed is measured in **degrees per second (°/s)** of real controller rotation.
For reference:

| Movement | Typical speed |
|---|---|
| Holding on a target / micro-adjustments | 0 – 10 °/s |
| Tracking a moving enemy | 20 – 80 °/s |
| Quick re-aim to a nearby target | 100 – 200 °/s |
| Fast flick / turn-around snap | 250 – 500 °/s |

> **Sensor limit:** the gyro measures up to about **570 °/s**. Anything faster
> registers as 570 °/s, so gain settings beyond that are never reached.

---

## 2. The settings

All acceleration settings are **per profile**, in the app under
**Profiles → (profile) → Gyro settings** (the gyro mode must be *Always on*,
*Touch on* or *Touch off*; absolute mode does not use acceleration).

| Setting | What it means | Typical range |
|---|---|---|
| **Acceleration** | The curve type (see section 3). *Off* = stock linear gyro. | – |
| **Low-speed gain** | Multiplier for slow movements, below the start speed. | 0.7× – 1.0× |
| **High-speed gain** | Multiplier for fast movements, at and above the full-gain speed. **This decides how big your flick turns are.** | 2× – 6× |
| **Acceleration starts at** | Speed where the gain begins to rise. Below it, aim is untouched. **Keep it above your tracking speed.** | 60 – 120 °/s |
| **Full gain at** | Speed where the high-speed gain is reached. | 250 – 450 °/s |
| **Curve shape** | How the gain rises between the two speeds (meaning depends on the curve). | see section 3 |
| **Speed smoothing** | Averages the measured speed over this time, so the gain does not jitter. Does **not** delay your movement, only how quickly the gain reacts. | 8 – 15 ms |
| **Vertical acceleration** | How much of the boost applies to up / down movement. 100% = same as horizontal, 0% = vertical always uses the low-speed gain. | 30 – 60% |

The app shows a live **graph** (gain vs. speed), the gain at four example
speeds, and an estimate of how much wrist rotation a fast flick needs for 180°.

### The formula

For readers who like the exact math:

```
t    = (speed − start) / (full − start), clamped to 0…1
gain = low + (high − low) × shape(t)
output = gyro × DPI × axis sensitivity × gain

vertical gain = low + (gain − low) × vertical acceleration
```

`shape(t)` depends on the curve (next section). The same math runs in the
firmware and in the app graph, so the graph is exactly what the controller does.

### Real-world calibration (optional)

By default, gyro speed comes from the global *mouse sensitivity*, so the same
setting feels different in every game. With **Real-world calibration** (Gyro
settings, per profile) you set sensitivity in real degrees instead:

- **Counts per 360°**: how many mouse counts the game needs for a full turn at
  your in-game sensitivity. Measure it with **Calibrate in game**: switch to the
  game, press **R2** to turn, adjust with the **D-pad** (→ / ← ±1%,
  ↑ / ↓ ±0.1%) until one turn ends exactly where it started, then **Save** in
  the app. **Home** cancels.
- **Ratio**: in-game degrees per controller degree. 1.0 = natural, 2 – 3 is
  common. The first calibration picks the ratio that matches your current feel.

Use the same ratio in every game profile and every game feels the same.
Acceleration multiplies on top: at 1× gain you get exactly the ratio, so
`turn = controller rotation × ratio × gain`. Re-calibrate if you change the
in-game sensitivity.

---

## 3. The curves

All curves go from the low-speed gain (at the start speed) to the high-speed
gain (at the full-gain speed). They differ in **how** they get there.

| Curve | Shape | Curve shape value means | Feel |
|---|---|---|---|
| **Linear** | Straight ramp. | – (not used) | Simple and predictable, but medium-speed tracking already gets boosted. |
| **Power** (classic) | Gentle at first, steeper at the top (`t^shape`). | Exponent. 1 = linear, 1.5 – 2 = classic, higher = boost only near the top. | Like classic mouse acceleration. Default shape 2. |
| **Natural** | Rises quickly, then eases into the max (`1 − e^(−shape·t)`). | Ramp speed. Higher = reaches max gain earlier. Default 3. | Smooth and forgiving. Good if you dislike sudden changes. |
| **Sigmoid** (S-curve) | Flat → fast transition in the middle → flat. | Steepness. 5 = soft, 10 = clear switch, 15+ = almost on/off. Default 10. | Clear **precision zone** and **flick zone**. Best for shooters. |

**Why Sigmoid is usually best for shooters:** with Power and Linear, the gain
already starts rising in the middle of normal tracking speeds, so the same hand
movement can move the camera by different amounts depending on speed. That hurts
muscle memory. A Sigmoid keeps tracking at a constant 1×, then switches
decisively into the boost only for real flicks.

---

## 4. Presets

The app includes four presets (Gyro settings → Preset). Gain at different
rotation speeds:

| Preset | 30°/s | 60°/s | 100°/s | 150°/s | 200°/s | 300°/s | 400°/s | 500°/s |
|---|---|---|---|---|---|---|---|---|
| **Subtle** | 1.00× | 1.22× | 1.53× | 1.76× | 1.89× | 2.00× | 2.00× | 2.00× |
| **Balanced** | 1.00× | 1.00× | 1.09× | 1.43× | 2.16× | 2.97× | 3.00× | 3.00× |
| **Flick turns** | 1.00× | 1.00× | 1.08× | 1.51× | 2.15× | 3.85× | 6.00× | 6.00× |
| **Precision + flick** | 0.70× | 0.71× | 0.84× | 1.58× | 3.12× | 4.00× | 4.00× | 4.00× |
| *Sigmoid flick* (custom, see below) | 1.00× | 1.00× | 1.00× | 1.25× | 2.74× | 5.46× | 5.50× | 5.50× |

Exact preset values:

| Preset | Curve | Low gain | High gain | Starts at | Full gain at | Shape | Smoothing |
|---|---|---|---|---|---|---|---|
| **Subtle** | Natural | 1.00× | 2.0× | 40 °/s | 300 °/s | 3 | 8 ms |
| **Balanced** | Sigmoid | 1.00× | 3.0× | 60 °/s | 320 °/s | 8 | 10 ms |
| **Flick turns** | Power | 1.00× | 6.0× | 80 °/s | 400 °/s | 1.5 | 10 ms |
| **Precision + flick** | Sigmoid | 0.70× | 4.0× | 50 °/s | 300 °/s | 10 | 10 ms |
| *Sigmoid flick* | Sigmoid | 1.00× | 5.5× | 100 °/s | 320 °/s | 10 | 10 ms |

Approximate wrist rotation for a 180° turn with a fast (~400 °/s) flick:

| Preset | Wrist rotation for 180° | (No acceleration: 180°) |
|---|---|---|
| Subtle | ~90° | |
| Balanced | ~60° | |
| Precision + flick | ~45° | |
| Sigmoid flick | ~33° | |
| Flick turns | ~30° | |

These are estimates: a real flick speeds up and slows down, passing through
lower gains at its start and end, so actual turns are a bit smaller. Use them to
compare presets, then fine-tune in game.

---

## 5. Which one to choose

| You want… | Start with |
|---|---|
| To try acceleration for the first time | **Subtle** |
| An all-round setup for most games | **Balanced** |
| Big 180 / 360 turns with minimal hand movement | **Flick turns** or **Sigmoid flick** |
| Pixel-precise long-range aim plus fast turns | **Precision + flick** (raise DPI ~40% to compensate for 0.7×) |
| Desktop / menus / strategy games | **Off** |

### Recommended for first-person shooters (e.g. Cyberpunk 2077)

**Sigmoid flick** gives 1:1 tracking (consistent muscle memory) and a strong,
clear boost only for deliberate flicks:

| Setting | Value |
|---|---|
| Acceleration | Sigmoid |
| Low-speed gain | 1.00× |
| High-speed gain | 5.0 – 6.0× |
| Acceleration starts at | 100 °/s |
| Full gain at | 320 °/s |
| Curve shape | 10 |
| Speed smoothing | 10 ms |
| Vertical acceleration | 50% |

If you already like **Flick turns**, keep it. Switch to Sigmoid flick if you
notice inconsistent tracking, e.g. over- or undershooting a running enemy.

### Pair it with

| Feature | Setting | Why |
|---|---|---|
| **Aim-down-sights** | Button **L2**, sensitivity **70%**, acceleration **Off** | Scoped aim stays pure and precise; acceleration only for hip-fire and turning. |
| **Smoothing below** | **5 °/s**, time **60 ms** | Removes hand tremor when holding still; fast movement unaffected. |
| **Tightening below** | **2 °/s** | Tiny unintended movements barely move the camera. |
| **Gyro space** | **Player space** (experimental) | Turning follows real-world "up", however you tilt the controller. Not yet verified on hardware; use *Local* if turns feel weak or reversed. |
| **Polling rate** (Advanced settings) | **1000 Hz** (USB) | Smoother output; sensitivity is normalized, so feel is unchanged. |

---

## 6. Tuning step by step

Change **one value at a time** and test in game after each change.

1. **Base sensitivity first.** Set *Acceleration* to **Off**. Adjust the global
   DPI (*Settings → Mouse sensitivity*) until slow aiming and tracking feel right.
   Acceleration should not be used to fix a wrong base sensitivity.
2. **Choose a preset** from section 5.
3. **Turn size → High-speed gain.** Do a comfortable wrist snap (about 45–60°).
   - Turns too small → raise high-speed gain.
   - Overshooting → lower it.
4. **Tracking → Acceleration starts at.** Track a moving target at normal speed.
   - Tracking feels boosted or inconsistent → raise it (e.g. 80 → 110 °/s).
   - Quick re-aims feel sluggish → lower it a little.
5. **Effort → Full gain at.** How hard you must flick to get the full boost.
   - Turns need a violent snap → lower it (e.g. 400 → 320 °/s).
   - Medium re-aims fly too far → raise it. Keep it under ~500 °/s.
6. **Transition → Curve shape** (Sigmoid/Power/Natural).
   - Boost kicks in too abruptly → lower it.
   - Want a sharper split between aim and flick → raise it.
7. **Gain jitters during flicks → Speed smoothing** up to 15 ms. If the boost
   feels late, go down to 5–8 ms.
8. **Flick turns throw the aim up or down → Vertical acceleration.** Lower it
   (e.g. 100 → 50%). Use 0% if you never need fast vertical flicks.

---

## 7. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Aim feels inconsistent, hard to build muscle memory | Gain changes during normal tracking | Raise *starts at*, or use Sigmoid |
| 180° turns still need big hand movement | High-speed gain too low, or full-gain speed too high | Raise high-speed gain, lower *full gain at* |
| Camera "jumps" at the start of a flick | Transition too steep | Lower curve shape, or use Natural |
| Overshoot on quick re-aims (100–200 °/s) | Boost starts too early | Raise *starts at* and *full gain at* |
| Scoped aim too fast | Acceleration active while aiming | Set an aim-down-sights button with acceleration Off |
| Small shaking when holding still | Hand tremor, not acceleration | Use smoothing (5 °/s) and tightening (1–3 °/s) |
| Fast turns also jerk the camera up or down | Vertical gets the full boost | Lower *vertical acceleration* (30 – 60%) |
| Very fast flicks don't turn further than fast ones | Sensor limit (~570 °/s) | Expected; raise high-speed gain instead of flicking harder |

---

## 8. Technical notes

- Settings are stored per profile in the controller; switching profiles switches
  acceleration too. Profiles without acceleration behave exactly like stock.
- Speed is computed from the gyro axes that are mapped in the profile, as one
  combined rotation speed, so horizontal and vertical movements share one gain
  (the vertical axis gets the share set by *vertical acceleration*).
- The gain is applied after the DPI and per-axis sensitivity; changing DPI
  scales everything, acceleration included.
- While the gyro is disengaged (touch modes), the speed and filters reset, so
  re-engaging never causes a jump.
- Everything is normalized to real time: 250, 500 and 1000 Hz polling feel the
  same.
