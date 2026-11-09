// SPDX-License-Identifier: GPL-2.0-only
// Macro model (fork extension). Encoding mirrors alpakka_firmware/src/headers/macro.h.

import { HID, PROC_INDEX, isMouseAxis, isGamepadAxis } from 'lib/hid'

export const MACRO_BYTES = 28
export const MACRO_STEPS_MAX = 14
export const MACRO_FORMAT_STEPS = 0x80

export enum MacroMode {
  ONCE = 0,
  REPEAT_HELD = 1,
  TOGGLE = 2,
}

export enum MacroOp {
  TAP = 0,
  DOWN = 1,
  UP = 2,
  WAIT = 3,
}

export const macroModeNames: {[key in MacroMode]: string} = {
  [MacroMode.ONCE]: 'Play once',
  [MacroMode.REPEAT_HELD]: 'Repeat while held',
  [MacroMode.TOGGLE]: 'Toggle repeat (press to start / stop)',
}

export const macroOpNames: {[key in MacroOp]: string} = {
  [MacroOp.TAP]: 'Tap',
  [MacroOp.DOWN]: 'Hold down',
  [MacroOp.UP]: 'Release',
  [MacroOp.WAIT]: 'Wait',
}

export interface MacroStep {
  action: HID
  op: MacroOp
  delay: number  // ms, waited after the step.
}

export interface Macro {
  legacy: boolean  // Old firmware format (typed key list), shown read-only until edited.
  mode: MacroMode
  tapMs: number
  steps: MacroStep[]
}

export function delayFromCode(code: number) {
  code &= 0x3F
  if (code <= 32) return code * 10
  return 320 + (code - 32) * 80
}

export const delayOptions = Array.from({length: 64}, (_, code) => delayFromCode(code))

export function codeFromDelay(ms: number) {
  // Nearest representable delay.
  let best = 0
  for (let code = 0; code < 64; code++) {
    if (Math.abs(delayFromCode(code) - ms) < Math.abs(delayFromCode(best) - ms)) best = code
  }
  return best
}

export function snapDelay(ms: number) {
  return delayFromCode(codeFromDelay(ms))
}

export function emptyMacro(): Macro {
  return {legacy: false, mode: MacroMode.ONCE, tapMs: 30, steps: []}
}

export function decodeMacro(bytes: number[], format: number): Macro {
  if (!(format & MACRO_FORMAT_STEPS)) {
    const keys = bytes.filter((b) => b != 0)
    return {
      legacy: keys.length > 0,
      mode: MacroMode.ONCE,
      tapMs: 10,
      steps: keys.map((action) => ({action, op: MacroOp.TAP, delay: 10})),
    }
  }
  const steps: MacroStep[] = []
  for (let i = 0; i < MACRO_STEPS_MAX; i++) {
    const a = bytes[i*2]
    const b = bytes[i*2 + 1]
    if (a == 0 && b == 0) break
    steps.push({action: a, op: (b >> 6) as MacroOp, delay: delayFromCode(b)})
  }
  return {
    legacy: false,
    mode: (format & 0x03) as MacroMode,
    tapMs: (((format >> 2) & 0x1F) + 1) * 10,
    steps,
  }
}

export function encodeMacro(macro: Macro): {bytes: number[], format: number} {
  const bytes = Array(MACRO_BYTES).fill(0)
  if (macro.steps.length == 0) return {bytes, format: 0}
  const steps = macro.steps.slice(0, MACRO_STEPS_MAX)
  steps.forEach((step, i) => {
    const action = step.op == MacroOp.WAIT ? 0 : step.action
    let b = (step.op << 6) | codeFromDelay(step.delay)
    // A [0, 0] pair would end the macro: make an empty wait at least 10ms.
    if (action == 0 && b == 0) b = (MacroOp.WAIT << 6) | 1
    bytes[i*2] = action
    bytes[i*2 + 1] = b
  })
  const tap = Math.max(0, Math.min(31, Math.round(macro.tapMs / 10) - 1))
  const format = MACRO_FORMAT_STEPS | (tap << 2) | (macro.mode & 0x03)
  return {bytes, format}
}

// Actions a macro can play: keys, modifiers, mouse buttons, scroll, gamepad buttons.
export function isPlayableAction(action: number) {
  if (action <= 0 || action >= PROC_INDEX) return false
  if (isMouseAxis(action) || isGamepadAxis(action)) return false
  return HID[action] !== undefined
}

export function actionLabel(action: number) {
  const name = HID[action]
  if (!name) return `#${action}`
  return name
    .replace(/^KEY_PAD_/, 'Numpad ')
    .replace(/^KEY_/, '')
    .replace(/^MOUSE_SCROLL_/, 'Scroll ')
    .replace(/^MOUSE_(\d)/, 'Mouse $1')
    .replace(/^GAMEPAD_/, 'Pad ')
    .replace(/_/g, ' ')
}

export const playableActions: {value: number, label: string}[] = Object.values(HID)
  .filter((v) => typeof v === 'number' && isPlayableAction(v as number))
  .map((v) => ({value: v as number, label: actionLabel(v as number)}))

export function describeMacro(macro: Macro) {
  if (macro.steps.length == 0) return 'Empty'
  return macro.steps.map((s) => {
    if (s.op == MacroOp.WAIT) return `wait ${s.delay}ms`
    const sym = s.op == MacroOp.DOWN ? '↓' : s.op == MacroOp.UP ? '↑' : ''
    return sym + actionLabel(s.action)
  }).join(' ')
}

// Browser KeyboardEvent.code -> HID action, for the macro recorder.
export function hidFromKeyCode(code: string): number {
  let m = code.match(/^Key([A-Z])$/)
  if (m) return HID[`KEY_${m[1]}` as keyof typeof HID] as number
  m = code.match(/^Digit(\d)$/)
  if (m) return HID[`KEY_${m[1]}` as keyof typeof HID] as number
  m = code.match(/^Numpad(\d)$/)
  if (m) return HID[`KEY_PAD_${m[1]}` as keyof typeof HID] as number
  m = code.match(/^F(\d{1,2})$/)
  if (m) return (HID[`KEY_F${m[1]}` as keyof typeof HID] as number) || 0
  const table: {[key: string]: HID} = {
    Enter: HID.KEY_ENTER, Escape: HID.KEY_ESCAPE, Backspace: HID.KEY_BACKSPACE,
    Tab: HID.KEY_TAB, Space: HID.KEY_SPACE, Minus: HID.KEY_MINUS, Equal: HID.KEY_EQUALS,
    BracketLeft: HID.KEY_BRACKET_LEFT, BracketRight: HID.KEY_BRACKET_RIGHT,
    Backslash: HID.KEY_BACKSLASH, Semicolon: HID.KEY_SEMICOLON, Quote: HID.KEY_QUOTE,
    Backquote: HID.KEY_BACKQUOTE, Comma: HID.KEY_COMMA, Period: HID.KEY_PERIOD,
    Slash: HID.KEY_SLASH, CapsLock: HID.KEY_CAPS_LOCK, Insert: HID.KEY_INSERT,
    Home: HID.KEY_HOME, PageUp: HID.KEY_PAGE_UP, Delete: HID.KEY_DELETE, End: HID.KEY_END,
    PageDown: HID.KEY_PAGE_DOWN, ArrowRight: HID.KEY_RIGHT, ArrowLeft: HID.KEY_LEFT,
    ArrowDown: HID.KEY_DOWN, ArrowUp: HID.KEY_UP,
    ControlLeft: HID.KEY_CONTROL_LEFT, ShiftLeft: HID.KEY_SHIFT_LEFT, AltLeft: HID.KEY_ALT_LEFT,
    MetaLeft: HID.KEY_SUPER_LEFT, ControlRight: HID.KEY_CONTROL_RIGHT,
    ShiftRight: HID.KEY_SHIFT_RIGHT, AltRight: HID.KEY_ALT_RIGHT, MetaRight: HID.KEY_SUPER_RIGHT,
    NumpadEnter: HID.KEY_PAD_ENTER, NumpadAdd: HID.KEY_PAD_PLUS, NumpadSubtract: HID.KEY_PAD_MINUS,
    NumpadMultiply: HID.KEY_PAD_ASTERISK, NumpadDivide: HID.KEY_PAD_SLASH,
    NumpadDecimal: HID.KEY_PAD_PERIOD,
  }
  return table[code] || 0
}

export function hidFromMouseButton(button: number): number {
  return [HID.MOUSE_1, HID.MOUSE_3, HID.MOUSE_2, HID.MOUSE_4, HID.MOUSE_5][button] || 0
}

export interface RecordedEvent {
  action: number
  down: boolean
  time: number  // ms.
}

// Turn raw down/up events into macro steps. A press and release of the same
// key with nothing in between, held shorter than `tapMax`, becomes a tap.
export function stepsFromRecording(events: RecordedEvent[], tapMax = 250): MacroStep[] {
  const steps: MacroStep[] = []
  let i = 0
  while (i < events.length && steps.length < MACRO_STEPS_MAX) {
    const ev = events[i]
    const next = events[i + 1]
    const isTap = (
      ev.down && next && !next.down && next.action == ev.action &&
      next.time - ev.time <= tapMax
    )
    const endTime = isTap ? next.time : ev.time
    const following = events[isTap ? i + 2 : i + 1]
    const delay = following ? snapDelay(Math.max(0, following.time - endTime)) : 0
    steps.push({
      action: ev.action,
      op: isTap ? MacroOp.TAP : (ev.down ? MacroOp.DOWN : MacroOp.UP),
      delay,
    })
    i += isTap ? 2 : 1
  }
  return steps
}
