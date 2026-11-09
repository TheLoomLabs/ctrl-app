// SPDX-License-Identifier: GPL-2.0-only

import { Ctrl, CtrlMacro, CtrlMacroNames, MACRO_NAME_BYTES, SectionIndex } from 'lib/ctrl'
import { HID } from 'lib/hid'
import {
  Macro, MacroMode, MacroOp, MACRO_BYTES, MACRO_STEPS_MAX, MACRO_FORMAT_STEPS,
  delayFromCode, codeFromDelay, snapDelay, encodeMacro, decodeMacro,
  emptyMacro, stepsFromRecording, isPlayableAction,
} from 'lib/macro'

describe('macro delays', () => {
  // Same table as macro_delay_ms() in the firmware (src/macro.c).
  it('decodes codes like the firmware', () => {
    expect(delayFromCode(0)).toBe(0)
    expect(delayFromCode(1)).toBe(10)
    expect(delayFromCode(32)).toBe(320)
    expect(delayFromCode(33)).toBe(400)
    expect(delayFromCode(63)).toBe(2800)
  })

  it('ignores the operation bits', () => {
    expect(delayFromCode((MacroOp.WAIT << 6) | 5)).toBe(50)
  })

  it('every code encodes back to itself', () => {
    for (let code = 0; code < 64; code++) expect(codeFromDelay(delayFromCode(code))).toBe(code)
  })

  it('snaps to the nearest representable delay', () => {
    expect(snapDelay(14)).toBe(10)
    expect(snapDelay(16)).toBe(20)
    expect(snapDelay(350)).toBe(320)
    expect(snapDelay(370)).toBe(400)
    expect(snapDelay(10000)).toBe(2800)
    expect(snapDelay(-5)).toBe(0)
  })
})

describe('macro encoding', () => {
  const sample: Macro = {
    legacy: false,
    mode: MacroMode.REPEAT_HELD,
    tapMs: 30,
    steps: [
      {action: HID.KEY_SPACE, op: MacroOp.TAP, delay: 120},
      {action: HID.KEY_CONTROL_LEFT, op: MacroOp.DOWN, delay: 0},
      {action: 0, op: MacroOp.WAIT, delay: 800},
      {action: HID.KEY_CONTROL_LEFT, op: MacroOp.UP, delay: 2800},
    ],
  }

  it('produces the byte layout the firmware reads (macro.h)', () => {
    const {bytes, format} = encodeMacro(sample)
    expect(bytes.length).toBe(MACRO_BYTES)
    // Format: bit 7 steps, bits 2-6 tap (30ms -> 2), bits 0-1 mode.
    expect(format).toBe(0x80 | (2 << 2) | 1)
    expect(bytes.slice(0, 10)).toEqual([
      HID.KEY_SPACE, (0 << 6) | 12,
      HID.KEY_CONTROL_LEFT, (1 << 6) | 0,
      0, (3 << 6) | 38,
      HID.KEY_CONTROL_LEFT, (2 << 6) | 63,
      0, 0,  // End marker.
    ])
    expect(bytes.slice(10).every((b) => b == 0)).toBeTrue()
  })

  it('round trips every mode and tap time', () => {
    for (const mode of [MacroMode.ONCE, MacroMode.REPEAT_HELD, MacroMode.TOGGLE]) {
      for (const tapMs of [10, 30, 150, 320]) {
        const macro = {...sample, mode, tapMs}
        const {bytes, format} = encodeMacro(macro)
        expect(decodeMacro(bytes, format)).toEqual(macro)
      }
    }
  })

  it('clamps the tap time to 10 - 320 ms', () => {
    expect(decodeMacro(...args(encodeMacro({...sample, tapMs: 0}))).tapMs).toBe(10)
    expect(decodeMacro(...args(encodeMacro({...sample, tapMs: 999}))).tapMs).toBe(320)
  })

  it('an empty macro is all zero (no macro)', () => {
    const {bytes, format} = encodeMacro(emptyMacro())
    expect(format).toBe(0)
    expect(bytes).toEqual(Array(MACRO_BYTES).fill(0))
    expect(decodeMacro(bytes, format).steps).toEqual([])
  })

  it('a zero-length wait does not end the macro early', () => {
    const macro: Macro = {...sample, steps: [
      {action: 0, op: MacroOp.WAIT, delay: 0},
      {action: HID.KEY_A, op: MacroOp.TAP, delay: 0},
    ]}
    const {bytes, format} = encodeMacro(macro)
    expect([bytes[0], bytes[1]]).not.toEqual([0, 0])
    const decoded = decodeMacro(bytes, format)
    expect(decoded.steps.length).toBe(2)
    expect(decoded.steps[1].action).toBe(HID.KEY_A)
  })

  it('a wait step never stores an action', () => {
    const macro: Macro = {...sample, steps: [{action: HID.KEY_A, op: MacroOp.WAIT, delay: 50}]}
    expect(encodeMacro(macro).bytes[0]).toBe(0)
  })

  it(`keeps at most ${MACRO_STEPS_MAX} steps`, () => {
    const steps = Array.from({length: 20}, () => ({action: HID.KEY_A, op: MacroOp.TAP, delay: 10}))
    const {bytes, format} = encodeMacro({...sample, steps})
    expect(bytes.length).toBe(MACRO_BYTES)
    expect(decodeMacro(bytes, format).steps.length).toBe(MACRO_STEPS_MAX)
  })

  it('reads legacy macros (typed key list) as taps', () => {
    const bytes = Array(MACRO_BYTES).fill(0)
    bytes[0] = HID.KEY_H
    bytes[1] = HID.KEY_I
    const macro = decodeMacro(bytes, 0)
    expect(macro.legacy).toBeTrue()
    expect(macro.mode).toBe(MacroMode.ONCE)
    expect(macro.steps.map((s) => [s.action, s.op])).toEqual([
      [HID.KEY_H, MacroOp.TAP], [HID.KEY_I, MacroOp.TAP],
    ])
  })

  it('an all-zero legacy slot is empty, not legacy', () => {
    const macro = decodeMacro(Array(MACRO_BYTES).fill(0), 0)
    expect(macro.legacy).toBeFalse()
    expect(macro.steps).toEqual([])
  })

  it('only allows keys and buttons as actions, not axes or procedures', () => {
    expect(isPlayableAction(HID.KEY_A)).toBeTrue()
    expect(isPlayableAction(HID.MOUSE_1)).toBeTrue()
    expect(isPlayableAction(0)).toBeFalse()
    expect(isPlayableAction(HID.MOUSE_X)).toBeFalse()
    expect(isPlayableAction(HID.PROC_PROFILE_1)).toBeFalse()
  })
})

describe('macro recorder', () => {
  const ev = (action: number, down: boolean, time: number) => ({action, down, time})

  it('turns a quick press and release into a tap with the gap as delay', () => {
    const steps = stepsFromRecording([
      ev(HID.KEY_A, true, 0), ev(HID.KEY_A, false, 50),
      ev(HID.KEY_B, true, 170), ev(HID.KEY_B, false, 200),
    ])
    expect(steps).toEqual([
      {action: HID.KEY_A, op: MacroOp.TAP, delay: 120},
      {action: HID.KEY_B, op: MacroOp.TAP, delay: 0},
    ])
  })

  it('keeps long or overlapping presses as hold down / release', () => {
    const steps = stepsFromRecording([
      ev(HID.KEY_SHIFT_LEFT, true, 0), ev(HID.KEY_A, true, 100),
      ev(HID.KEY_A, false, 130), ev(HID.KEY_SHIFT_LEFT, false, 600),
    ])
    expect(steps.map((s) => s.op)).toEqual([MacroOp.DOWN, MacroOp.TAP, MacroOp.UP])
    expect(steps[1].delay).toBe(480)  // 470ms gap, snapped to the 80ms grid.
  })

  it(`stops at ${MACRO_STEPS_MAX} steps`, () => {
    const events = Array.from({length: 40}, (_, i) => ev(HID.KEY_A, i % 2 == 0, i * 10))
    expect(stepsFromRecording(events).length).toBe(MACRO_STEPS_MAX)
  })
})

describe('CtrlMacro message', () => {
  it('carries two macros and their formats and decodes back', () => {
    const a = encodeMacro({legacy: false, mode: MacroMode.TOGGLE, tapMs: 50, steps: [
      {action: HID.MOUSE_1, op: MacroOp.TAP, delay: 60},
    ]})
    const b = {bytes: Array.from({length: MACRO_BYTES}, (_, i) => i + 1), format: 0}
    const msg = new CtrlMacro(3, SectionIndex.MACRO_2, [a.bytes, b.bytes], [a.format, b.format])
    const data = msg.encode()
    expect(data[3]).toBe(2 + 2 * MACRO_BYTES + 2)
    const decoded = Ctrl.decode(data) as CtrlMacro
    expect(decoded).toBeInstanceOf(CtrlMacro)
    expect(decoded.profileIndex).toBe(3)
    expect(decoded.macros).toEqual([a.bytes, b.bytes])
    expect(decoded.formats).toEqual([a.format, b.format])
  })
})

describe('CtrlMacroNames message', () => {
  const roundTrip = (names: string[]) => {
    const data = new CtrlMacroNames(1, SectionIndex.MACRO_NAMES_1, names).encode()
    const decoded = Ctrl.decode(data) as CtrlMacroNames
    expect(decoded).toBeInstanceOf(CtrlMacroNames)
    return decoded.names
  }

  it('round trips four names', () => {
    expect(roundTrip(['Rapid fire', 'Double jump', '', 'Heal+reload']))
      .toEqual(['Rapid fire', 'Double jump', '', 'Heal+reload'])
  })

  it('stores each name in its own 14-byte slot', () => {
    const data = new CtrlMacroNames(0, SectionIndex.MACRO_NAMES_2, ['A', 'B', 'C', 'D']).encode()
    expect(data[3]).toBe(2 + 4 * MACRO_NAME_BYTES)
    expect([0, 1, 2, 3].map((i) => data[6 + i * MACRO_NAME_BYTES]))
      .toEqual(['A', 'B', 'C', 'D'].map((c) => c.charCodeAt(0)))
  })

  it('keeps a name of exactly 14 bytes', () => {
    expect(roundTrip(['12345678901234', '', '', ''])[0]).toBe('12345678901234')
  })

  it('cuts longer names to 14 bytes without spilling into the next slot', () => {
    expect(roundTrip(['123456789012345678', 'Next', '', ''])).toEqual(['12345678901234', 'Next', '', ''])
  })

  it('keeps multi-byte characters whole', () => {
    expect(roundTrip(['Čačak šuma', '', '', ''])[0]).toBe('Čačak šuma')
    // 8 two-byte characters = 16 bytes: only 7 fit.
    expect(roundTrip(['čččččččč', '', '', ''])[0]).toBe('ččččččč')
  })
})

function args(x: {bytes: number[], format: number}): [number[], number] {
  return [x.bytes, x.format]
}

// Sanity check that the format flag constant matches the firmware.
describe('macro constants', () => {
  it('match macro.h', () => {
    expect(MACRO_FORMAT_STEPS).toBe(0x80)
    expect(MACRO_STEPS_MAX).toBe(14)
    expect(MACRO_BYTES).toBe(28)
  })
})
