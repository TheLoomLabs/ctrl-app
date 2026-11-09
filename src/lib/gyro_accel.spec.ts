// SPDX-License-Identifier: GPL-2.0-only

import { Ctrl, CtrlGyro, SectionIndex } from 'lib/ctrl'
import {
  GyroAccelCurve, GyroAccelParams, gain, presets,
  paramsFromGyro, applyParamsToGyro, paramsFromGyroAds, applyParamsToGyroAds,
  verticalShare, setVerticalShare, verticalGain,
} from 'lib/gyro_accel'
import { ACCEL_GOLDEN, ACCEL_SPEEDS } from 'lib/gyro_accel.golden'

function gyroWithAccelBytes(bytes: number[]) {
  const gyro = new CtrlGyro(0, SectionIndex.GYRO_SETTINGS, 0, 0)
  ;[
    gyro.accel_curve, gyro.accel_gain_min, gyro.accel_gain_max,
    gyro.accel_threshold, gyro.accel_speed_max, gyro.accel_exponent,
  ] = bytes
  return gyro
}

describe('gyro acceleration', () => {
  describe('matches the firmware (gyro.c)', () => {
    // Expected values come from the firmware code itself, see
    // scripts/accel_golden.sh. Firmware uses float, the app double.
    for (const golden of ACCEL_GOLDEN) {
      it(`for profile bytes [${golden.bytes}]`, () => {
        const params = paramsFromGyro(gyroWithAccelBytes(golden.bytes))
        ACCEL_SPEEDS.forEach((speed, i) => {
          expect(gain(params, speed))
            .withContext(`${speed} deg/s`)
            .toBeCloseTo(golden.gains[i], 4)
        })
      })
    }
  })

  describe('gain', () => {
    const base: GyroAccelParams = {
      curve: GyroAccelCurve.SIGMOID, gainMin: 1, gainMax: 4,
      threshold: 100, speedMax: 300, exponent: 10, smoothing: 10,
    }

    it('is 1 when acceleration is off, whatever the other values', () => {
      const off = {...base, curve: GyroAccelCurve.OFF, gainMin: 0.5}
      for (const speed of [0, 200, 1000]) expect(gain(off, speed)).toBe(1)
    })

    for (const curve of [GyroAccelCurve.LINEAR, GyroAccelCurve.POWER,
                         GyroAccelCurve.NATURAL, GyroAccelCurve.SIGMOID]) {
      it(`${GyroAccelCurve[curve]}: low gain up to the threshold, high gain from full speed`, () => {
        const p = {...base, curve}
        expect(gain(p, 0)).toBe(1)
        expect(gain(p, 100)).toBe(1)
        expect(gain(p, 300)).toBe(4)
        expect(gain(p, 570)).toBe(4)
      })

      it(`${GyroAccelCurve[curve]}: never decreases with speed`, () => {
        const p = {...base, curve}
        let previous = gain(p, 0)
        for (let speed = 1; speed <= 600; speed++) {
          const g = gain(p, speed)
          expect(g).toBeGreaterThanOrEqual(previous - 1e-12)
          previous = g
        }
      })
    }

    it('LINEAR is halfway at the middle speed', () => {
      expect(gain({...base, curve: GyroAccelCurve.LINEAR}, 200)).toBeCloseTo(2.5, 10)
    })

    it('SIGMOID is halfway at the middle speed (symmetric S-curve)', () => {
      expect(gain(base, 200)).toBeCloseTo(2.5, 10)
    })

    it('a zero exponent falls back to the curve default', () => {
      for (const [curve, fallback] of [
        [GyroAccelCurve.POWER, 2], [GyroAccelCurve.NATURAL, 3], [GyroAccelCurve.SIGMOID, 10],
      ]) {
        const p = {...base, curve}
        expect(gain({...p, exponent: 0}, 170)).toBe(gain({...p, exponent: fallback}, 170))
      }
    })

    it('steps from low to high gain when full speed is not above the threshold', () => {
      const p = {...base, curve: GyroAccelCurve.LINEAR, speedMax: 100}
      expect(gain(p, 100)).toBe(1)
      expect(gain(p, 100.1)).toBe(4)
    })
  })

  describe('vertical acceleration', () => {
    const p: GyroAccelParams = {
      curve: GyroAccelCurve.LINEAR, gainMin: 1, gainMax: 5,
      threshold: 100, speedMax: 300, exponent: 0, smoothing: 10,
    }

    it('stock profiles (byte 0) get the full boost on vertical', () => {
      const gyro = new CtrlGyro(0, SectionIndex.GYRO_SETTINGS, 0, 0)
      expect(verticalShare(gyro)).toBe(1)
      expect(verticalGain(p, 300, 1)).toBe(gain(p, 300))
    })

    it('scales only the boost above the low-speed gain', () => {
      expect(verticalGain(p, 300, 0.5)).toBe(3)
      expect(verticalGain(p, 300, 0)).toBe(1)
      const precision = {...p, gainMin: 0.7}
      expect(verticalGain(precision, 0, 0)).toBe(0.7)
      expect(verticalGain(precision, 300, 0)).toBe(0.7)
    })

    it('stores the reduction in percent and clamps', () => {
      const gyro = new CtrlGyro(0, SectionIndex.GYRO_SETTINGS, 0, 0)
      setVerticalShare(gyro, 0.4)
      expect(gyro.accel_vertical_cut).toBe(60)
      expect(verticalShare(gyro)).toBeCloseTo(0.4, 10)
      setVerticalShare(gyro, 0)
      expect(gyro.accel_vertical_cut).toBe(100)
      setVerticalShare(gyro, 2)
      expect(gyro.accel_vertical_cut).toBe(0)
      gyro.accel_vertical_cut = 200  // Out of range from a bad profile.
      expect(verticalShare(gyro)).toBe(0)
    })
  })

  describe('profile bytes', () => {
    it('all-zero bytes (stock profile) mean off with neutral gains', () => {
      const p = paramsFromGyro(new CtrlGyro(0, SectionIndex.GYRO_SETTINGS, 0, 0))
      expect(p.curve).toBe(GyroAccelCurve.OFF)
      expect(p.gainMin).toBe(1)
      expect(p.gainMax).toBe(1)
    })

    for (const preset of presets) {
      it(`preset "${preset.name}" survives a save and load unchanged`, () => {
        const gyro = new CtrlGyro(0, SectionIndex.GYRO_SETTINGS, 0, 0)
        applyParamsToGyro(gyro, preset.params)
        expect(paramsFromGyro(gyro)).toEqual(preset.params)
      })
    }

    it('rounds to the stored resolution and clamps to a byte', () => {
      const gyro = new CtrlGyro(0, SectionIndex.GYRO_SETTINGS, 0, 0)
      applyParamsToGyro(gyro, {
        curve: GyroAccelCurve.POWER, gainMin: 0.874, gainMax: 99,
        threshold: 101, speedMax: 2000, exponent: 1.26, smoothing: -5,
      })
      expect(gyro.accel_gain_min).toBe(87)
      expect(gyro.accel_gain_max).toBe(255)
      expect(gyro.accel_threshold).toBe(51)
      expect(gyro.accel_speed_max).toBe(255)
      expect(gyro.accel_exponent).toBe(13)
      expect(gyro.accel_smoothing).toBe(0)
    })

    it('aim-down-sights curve uses its own bytes and shares smoothing', () => {
      const gyro = new CtrlGyro(0, SectionIndex.GYRO_SETTINGS, 0, 0)
      applyParamsToGyro(gyro, presets[0].params)
      const ads = presets[3].params
      applyParamsToGyroAds(gyro, ads)
      expect(paramsFromGyro(gyro)).toEqual(presets[0].params)
      expect(paramsFromGyroAds(gyro)).toEqual({...ads, smoothing: presets[0].params.smoothing})
    })
  })

  describe('CtrlGyro message', () => {
    it('places every field at its documented byte and decodes back', () => {
      // Values 1..28 so a shifted field is detected.
      const fields = Array.from({length: 28}, (_, i) => i + 1)
      const gyro = new CtrlGyro(
        ...(fields as [number, number, number, number, ...number[]]),
      )
      const data = gyro.encode()
      // Payload starts at byte 4: profile, section, then CtrlGyro bytes 0-25.
      expect(Array.from(data.slice(4, 32))).toEqual(fields)
      expect(data[3]).toBe(28)
      // Section byte must route to CtrlGyro, so use the real index.
      data[5] = SectionIndex.GYRO_SETTINGS
      const decoded = Ctrl.decode(data) as CtrlGyro
      expect(decoded).toBeInstanceOf(CtrlGyro)
      expect(Array.from(decoded.encode())).toEqual(Array.from(data))
    })
  })
})
