// SPDX-License-Identifier: GPL-2.0-only

import { CtrlGyro, SectionIndex } from 'lib/ctrl'
import {
  rwCounts, rwEnabled, setRwCounts, rwRatio, setRwRatio, rwScale,
  equivalentRatio, controllerDegreesFor360, STOCK_COUNTS_PER_DEGREE,
  RW_COUNTS_MIN, RW_COUNTS_MAX,
} from 'lib/real_world'

// Firmware constants (config.h, gyro.h): CFG_GYRO_SENSITIVITY and the gyro
// scale in deg/s per raw unit.
const CFG_GYRO_SENSITIVITY = Math.pow(2, -9) * 1.45
const GYRO_DPS_PER_LSB = 0.0175

describe('real-world calibration', () => {
  const gyro = () => new CtrlGyro(0, SectionIndex.GYRO_SETTINGS, 0, 0)

  it('is off for stock profiles (all zero bytes)', () => {
    const g = gyro()
    expect(rwEnabled(g)).toBeFalse()
    expect(rwScale(rwCounts(g), g.rw_ratio)).toBe(0)
  })

  it('stores counts as 16-bit little endian and clamps', () => {
    const g = gyro()
    setRwCounts(g, 0x1234)
    expect([g.rw_counts_lo, g.rw_counts_hi]).toEqual([0x34, 0x12])
    expect(rwCounts(g)).toBe(0x1234)
    setRwCounts(g, 10)
    expect(rwCounts(g)).toBe(RW_COUNTS_MIN)
    setRwCounts(g, 1e6)
    expect(rwCounts(g)).toBe(RW_COUNTS_MAX)
    setRwCounts(g, 0)
    expect(rwEnabled(g)).toBeFalse()
  })

  it('stores the ratio in tenths, zero meaning 1.0', () => {
    const g = gyro()
    expect(rwRatio(g)).toBe(1)
    setRwRatio(g, 2.34)
    expect(g.rw_ratio).toBe(23)
    expect(rwRatio(g)).toBeCloseTo(2.3, 10)
    setRwRatio(g, 0)
    expect(g.rw_ratio).toBe(1)
    setRwRatio(g, 99)
    expect(g.rw_ratio).toBe(255)
  })

  it('outputs exactly counts/360 x ratio mouse counts per controller degree', () => {
    for (const [counts, tenths] of [[8192, 10], [16364, 25], [3600, 1], [65535, 255]]) {
      const scale = rwScale(counts, tenths)
      // One degree of rotation, spread over one second of 250 Hz ticks.
      const rawPerTick = 1 / GYRO_DPS_PER_LSB
      const countsPerDegree = rawPerTick * scale * 250
      expect(countsPerDegree).toBeCloseTo(counts / 360 * tenths / 10, 9)
    }
  })

  it('the equivalent ratio reproduces the stock sensitivity exactly', () => {
    for (const sens of [0.5, 1, 1.5, 3]) {
      for (const counts of [2000, 8192, 40000]) {
        const ratio = equivalentRatio(counts, sens)
        const scale = rwScale(counts, ratio * 10)
        expect(scale).toBeCloseTo(CFG_GYRO_SENSITIVITY * sens, 12)
      }
    }
    expect(STOCK_COUNTS_PER_DEGREE).toBeCloseTo(40.46, 2)
  })

  it('controller rotation for a full turn', () => {
    expect(controllerDegreesFor360(1)).toBe(360)
    expect(controllerDegreesFor360(2)).toBe(180)
  })
})
