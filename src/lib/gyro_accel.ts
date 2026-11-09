// SPDX-License-Identifier: GPL-2.0-only
// Gyro acceleration (fork extension).
// The math here mirrors alpakka_firmware/src/gyro.c, keep both in sync.

import type { CtrlGyro } from 'lib/ctrl'

export enum GyroAccelCurve {
  OFF,
  LINEAR,
  POWER,
  NATURAL,
  SIGMOID,
}

// Hardware limit of the gyro used for mouse output (500 dps full scale).
export const GYRO_MAX_SPEED = 570

export const curveNames: {[key in GyroAccelCurve]: string} = {
  [GyroAccelCurve.OFF]: 'Off',
  [GyroAccelCurve.LINEAR]: 'Linear',
  [GyroAccelCurve.POWER]: 'Power (classic)',
  [GyroAccelCurve.NATURAL]: 'Natural',
  [GyroAccelCurve.SIGMOID]: 'Sigmoid (S-curve)',
}

export const defaultExponent: {[key in GyroAccelCurve]: number} = {
  [GyroAccelCurve.OFF]: 0,
  [GyroAccelCurve.LINEAR]: 0,
  [GyroAccelCurve.POWER]: 2,
  [GyroAccelCurve.NATURAL]: 3,
  [GyroAccelCurve.SIGMOID]: 10,
}

// Human units, converted from/to the raw bytes stored in CtrlGyro.
export interface GyroAccelParams {
  curve: GyroAccelCurve
  gainMin: number    // x
  gainMax: number    // x
  threshold: number  // deg/s
  speedMax: number   // deg/s
  exponent: number
  smoothing: number  // ms
}

export function paramsFromGyro(gyro: CtrlGyro): GyroAccelParams {
  return {
    curve: Number(gyro.accel_curve),
    gainMin: (gyro.accel_gain_min || 100) / 100,
    gainMax: (gyro.accel_gain_max || 10) / 10,
    threshold: gyro.accel_threshold * 2,
    speedMax: gyro.accel_speed_max * 4,
    exponent: gyro.accel_exponent / 10,
    smoothing: gyro.accel_smoothing,
  }
}

export function applyParamsToGyro(gyro: CtrlGyro, p: GyroAccelParams) {
  const byte = (v: number) => Math.max(0, Math.min(255, Math.round(v)))
  gyro.accel_curve = p.curve
  gyro.accel_gain_min = byte(p.gainMin * 100)
  gyro.accel_gain_max = byte(p.gainMax * 10)
  gyro.accel_threshold = byte(p.threshold / 2)
  gyro.accel_speed_max = byte(p.speedMax / 4)
  gyro.accel_exponent = byte(p.exponent * 10)
  gyro.accel_smoothing = byte(p.smoothing)
}

function shape(curve: GyroAccelCurve, t: number, p: number) {
  if (t <= 0) return 0
  if (t >= 1) return 1
  switch (curve) {
    case GyroAccelCurve.LINEAR:
      return t
    case GyroAccelCurve.POWER:
      if (p <= 0) p = 2
      return Math.pow(t, p)
    case GyroAccelCurve.NATURAL:
      if (p <= 0) p = 3
      return (1 - Math.exp(-p * t)) / (1 - Math.exp(-p))
    case GyroAccelCurve.SIGMOID: {
      if (p <= 0) p = 10
      const l = (x: number) => 1 / (1 + Math.exp(-p * (x - 0.5)))
      return (l(t) - l(0)) / (l(1) - l(0))
    }
  }
  return 0
}

export function gain(params: GyroAccelParams, speed: number) {
  if (params.curve == GyroAccelCurve.OFF) return 1
  const range = params.speedMax - params.threshold
  const t = range > 0 ? (speed - params.threshold) / range : Number(speed > params.threshold)
  return params.gainMin + (params.gainMax - params.gainMin) * shape(params.curve, t, params.exponent)
}

export interface GyroAccelPreset {
  name: string
  description: string
  params: GyroAccelParams
}

export const presets: GyroAccelPreset[] = [
  {
    name: 'Subtle',
    description: 'Feels like stock aiming, with a bit of extra reach on fast turns.',
    params: {curve: GyroAccelCurve.NATURAL, gainMin: 1, gainMax: 2, threshold: 40, speedMax: 300, exponent: 3, smoothing: 8},
  },
  {
    name: 'Balanced',
    description: '1:1 precise aim, smooth transition into 3x for quick turns.',
    params: {curve: GyroAccelCurve.SIGMOID, gainMin: 1, gainMax: 3, threshold: 60, speedMax: 320, exponent: 8, smoothing: 10},
  },
  {
    name: 'Flick turns',
    description: 'Strong gain on fast flicks: small wrist snaps for 180 / 360 turns.',
    params: {curve: GyroAccelCurve.POWER, gainMin: 1, gainMax: 6, threshold: 80, speedMax: 400, exponent: 1.5, smoothing: 10},
  },
  {
    name: 'Precision + flick',
    description: 'Slower than stock for micro-aim, 4x on flicks. Raise DPI to compensate.',
    params: {curve: GyroAccelCurve.SIGMOID, gainMin: 0.7, gainMax: 4, threshold: 50, speedMax: 300, exponent: 10, smoothing: 10},
  },
]

export interface PlotColors {
  curve: string
  marker: string
  grid: string
  text: string
}

export function plotGyroAccel(canvas: HTMLCanvasElement, params: GyroAccelParams, colors: PlotColors) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const w = canvas.width
  const h = canvas.height
  const pad = {l: 34, r: 8, t: 8, b: 20}
  const plotW = w - pad.l - pad.r
  const plotH = h - pad.t - pad.b
  const maxSpeed = 600
  const maxGain = Math.max(params.gainMax, params.gainMin, 1) * 1.15
  const px = (speed: number) => pad.l + (speed / maxSpeed) * plotW
  const py = (g: number) => pad.t + plotH - (g / maxGain) * plotH
  ctx.clearRect(0, 0, w, h)
  ctx.font = '10px sans-serif'
  ctx.fillStyle = colors.text
  ctx.lineWidth = 1
  // Sensor limit region.
  ctx.fillStyle = 'rgba(255,255,255,0.05)'
  ctx.fillRect(px(GYRO_MAX_SPEED), pad.t, px(maxSpeed) - px(GYRO_MAX_SPEED), plotH)
  // Grid: speed every 100 deg/s, gain at whole numbers.
  ctx.strokeStyle = colors.grid
  ctx.fillStyle = colors.text
  ctx.textAlign = 'center'
  for (let s = 0; s <= maxSpeed; s += 100) {
    ctx.beginPath()
    ctx.moveTo(px(s), pad.t)
    ctx.lineTo(px(s), pad.t + plotH)
    ctx.stroke()
    ctx.fillText(`${s}`, px(s), h - 6)
  }
  ctx.textAlign = 'right'
  const gainStep = maxGain > 8 ? 2 : 1
  for (let g = 0; g <= maxGain; g += gainStep) {
    ctx.beginPath()
    ctx.moveTo(pad.l, py(g))
    ctx.lineTo(pad.l + plotW, py(g))
    ctx.stroke()
    ctx.fillText(`${g}x`, pad.l - 4, py(g) + 3)
  }
  // Threshold and full-gain markers.
  if (params.curve != GyroAccelCurve.OFF) {
    ctx.strokeStyle = colors.marker
    ctx.setLineDash([4, 3])
    for (const s of [params.threshold, params.speedMax]) {
      ctx.beginPath()
      ctx.moveTo(px(s), pad.t)
      ctx.lineTo(px(s), pad.t + plotH)
      ctx.stroke()
    }
    ctx.setLineDash([])
  }
  // Curve.
  ctx.beginPath()
  for (let i = 0; i <= plotW; i++) {
    const speed = (i / plotW) * maxSpeed
    const y = py(gain(params, speed))
    if (i == 0) ctx.moveTo(px(speed), y)
    else ctx.lineTo(px(speed), y)
  }
  ctx.strokeStyle = colors.curve
  ctx.lineWidth = 3
  ctx.stroke()
}

// Aim-down-sights curve: same units, its own bytes. Smoothing is shared.
export function paramsFromGyroAds(gyro: CtrlGyro): GyroAccelParams {
  return {
    curve: Number(gyro.ads_accel_curve),
    gainMin: (gyro.ads_accel_gain_min || 100) / 100,
    gainMax: (gyro.ads_accel_gain_max || 10) / 10,
    threshold: gyro.ads_accel_threshold * 2,
    speedMax: gyro.ads_accel_speed_max * 4,
    exponent: gyro.ads_accel_exponent / 10,
    smoothing: gyro.accel_smoothing,
  }
}

export function applyParamsToGyroAds(gyro: CtrlGyro, p: GyroAccelParams) {
  const byte = (v: number) => Math.max(0, Math.min(255, Math.round(v)))
  gyro.ads_accel_curve = p.curve
  gyro.ads_accel_gain_min = byte(p.gainMin * 100)
  gyro.ads_accel_gain_max = byte(p.gainMax * 10)
  gyro.ads_accel_threshold = byte(p.threshold / 2)
  gyro.ads_accel_speed_max = byte(p.speedMax / 4)
  gyro.ads_accel_exponent = byte(p.exponent * 10)
}
