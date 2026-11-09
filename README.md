# Ctrl app (TheLoomLabs fork)

Configuration app for the [Alpakka](https://inputlabs.io/devices/alpakka) gyro
controller, extended for PC gaming. It is a fork of the official
[Input Labs Ctrl app](https://github.com/inputlabs/ctrl-app) and works together
with our firmware fork,
[TheLoomLabs/alpakka_firmware](https://github.com/TheLoomLabs/alpakka_firmware).

> **The new settings need the custom firmware.** With the official firmware the
> app behaves like the stock app. Profiles made with the stock firmware keep
> working with the custom firmware: every new setting defaults to off.

## Features

### Gyro acceleration

- Per-profile acceleration curves: **Linear**, **Power**, **Natural** and
  **Sigmoid**.
- Presets: *Subtle*, *Balanced*, *Flick turns*, *Precision + flick*.
- Live graph of gain vs. rotation speed, example gains and an estimate of the
  wrist rotation needed for a 180° turn.
- Full guide: [docs/gyro-acceleration.md](docs/gyro-acceleration.md).

### Real-world calibration

- Sensitivity in real degrees per profile: measure the game's **counts per
  360°** with an in-game test turn (R2 to turn, D-pad to adjust), then pick a
  **ratio** (in-game degrees per controller degree). Same ratio = same feel in
  every game.

### Aim and stability

- **Aim-down-sights modifier**: separate sensitivity and acceleration curve
  while a chosen button (e.g. L2) is held.
- **Smoothing** for slow movements and **tightening** against small hand
  tremor. Fast movements are not affected.
- **Player space** gyro: turning follows real-world "up", however the controller
  is tilted (experimental).

### Polling rate

- **250 / 500 / 1000 Hz** over USB (wireless stays at 250 Hz).
- Gyro output and smoothing are normalized to real time, so sensitivity feels
  the same at every rate.

### Macros

- Up to 14 steps per macro: tap, hold down, release, wait (0 – 2.8 s per step).
- Modes: **play once**, **repeat while held**, **toggle repeat**.
- Keyboard and mouse **recorder**, step editor, full-view editor and macro names.
- Several macros can run at the same time; held keys are always released.
- Macros made with the stock app keep working.

## Getting started

1. **Flash the firmware.** Download the `.uf2` file from the
   [firmware releases](https://github.com/TheLoomLabs/alpakka_firmware/releases)
   (currently Alpakka v1 only). In the app, open **Logs → Restart in bootsel
   mode**, then copy the `.uf2` file to the `RPI-RP2` drive that appears.
2. **Run the app** (see below) and open it in a Chromium-based browser such as
   Chrome or Edge (WebUSB is required).
3. Connect the controller over USB.

Only one browser tab can be connected to the controller at a time. If the app
reports *Unable to claim interface*, close the other tab (for example the
official app).

To go back to stock, flash the official firmware from the
[Input Labs releases](https://github.com/inputlabs/alpakka_firmware/releases).

## Development

Requirements: [Node.js](https://nodejs.org), then install dependencies with:

```bash
npm ci
```

| Command | What it does |
|---|---|
| `npx ng serve` | Development server at http://localhost:4200 |
| `npx ng build` | Production build in `dist/` |
| `npx ng test --watch=false --browsers=ChromeHeadless` | Unit tests |

The acceleration math in `src/lib/gyro_accel.ts` and the macro encoding in
`src/lib/macro.ts` mirror the firmware (`src/gyro.c`, `src/macro.c`). Keep them
in sync when changing either side. The tests check the acceleration curves
against values computed by the firmware code itself; after changing the
firmware math, regenerate them (needs a C compiler and the firmware checkout):

```bash
sh scripts/accel_golden.sh ../alpakka_firmware > src/lib/gyro_accel.golden.ts
```

## Credits and license

Based on the Ctrl app by [Input Labs](https://inputlabs.io). Not affiliated with
or supported by Input Labs; please do not report issues with this fork to them.

Licensed under the GNU GPL v2, see [license.md](license.md). Font licenses are
listed in [license-assets.md](license-assets.md).
