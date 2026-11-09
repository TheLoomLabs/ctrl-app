// SPDX-License-Identifier: GPL-2.0-only
// Real-world calibration (fork extension).
// Mirrors gyro_real_world_scale() in alpakka_firmware/src/gyro.c.

import type { CtrlGyro } from 'lib/ctrl'

export const RW_COUNTS_MIN = 100
export const RW_COUNTS_MAX = 65535
export const RW_COUNTS_DEFAULT = 8192
export const RW_RATIO_DEFAULT = 2

// Mouse counts per degree of controller rotation without real-world
// calibration, per 1.0 of global mouse sensitivity:
// CFG_GYRO_SENSITIVITY (2^-9 * 1.45) per raw unit per 250 Hz tick, and
// 0.0175 deg/s per raw unit.
export const STOCK_COUNTS_PER_DEGREE = Math.pow(2, -9) * 1.45 * 250 / 0.0175

export function rwCounts(gyro: CtrlGyro) {
  return gyro.rw_counts_lo | (gyro.rw_counts_hi << 8)
}

// Calibrated: the game's counts per 360 are known (kept while turned off).
export function rwCalibrated(gyro: CtrlGyro) {
  return rwCounts(gyro) > 0
}

export function rwEnabled(gyro: CtrlGyro) {
  return !!gyro.rw_enabled && rwCalibrated(gyro)
}

export function setRwEnabled(gyro: CtrlGyro, enabled: boolean) {
  gyro.rw_enabled = Number(enabled && rwCalibrated(gyro))
}

export function setRwCounts(gyro: CtrlGyro, counts: number) {
  const value = counts <= 0 ? 0 : Math.max(RW_COUNTS_MIN, Math.min(RW_COUNTS_MAX, Math.round(counts)))
  gyro.rw_counts_lo = value & 0xFF
  gyro.rw_counts_hi = value >> 8
}

// In-game degrees per controller degree. Stored in 0.1 units, 0 = 1.0.
export function rwRatio(gyro: CtrlGyro) {
  return (gyro.rw_ratio || 10) / 10
}

export function setRwRatio(gyro: CtrlGyro, ratio: number) {
  gyro.rw_ratio = Math.max(1, Math.min(255, Math.round(ratio * 10)))
}

// Same as gyro_real_world_scale() in the firmware: mouse counts per raw gyro
// unit per 250 Hz tick. 0 = disabled.
export function rwScale(counts360: number, ratioTenths: number) {
  if (counts360 == 0) return 0
  const ratio = (ratioTenths || 10) / 10
  return 0.0175 * (counts360 / 360 * ratio) / 250
}

// Ratio that gives the same feel as the global mouse sensitivity, for a game
// that needs `counts` for a 360 turn.
export function equivalentRatio(counts: number, mouseSens: number) {
  return STOCK_COUNTS_PER_DEGREE * mouseSens * 360 / counts
}

// Controller rotation (degrees) needed for a full in-game 360, before
// acceleration.
export function controllerDegreesFor360(ratio: number) {
  return 360 / ratio
}
