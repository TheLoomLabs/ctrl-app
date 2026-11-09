// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2023, Input Labs Oy.

import { Component, Input, ViewChild, ElementRef} from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { ActionSelectorComponent } from './action_selector'
import { InputNumberComponent } from 'components/input_number/input_number'
import { MapperComponent } from 'components/profile/mapper'
import { WebusbService } from 'services/webusb'
import { Profile } from 'lib/profile'
import { CtrlSection, CtrlSectionMeta, CtrlButton, CtrlRotary, ConfigIndex } from 'lib/ctrl'
import { CtrlThumbstick, CtrlGyro, CtrlGyroAxis, CtrlHome } from 'lib/ctrl'
import { SectionIndex, sectionIsAnalog } from 'lib/ctrl'
import { ThumbstickMode, GyroMode } from 'lib/ctrl'
import { HID, isAxis, isMouseAxis, isScrollAxis, isGamepadAxis } from 'lib/hid'
import { PinV0, PinV1 } from 'lib/pin'
import { delay } from 'lib/delay'
import { plotCircle, plotRamp, plotRotation } from 'lib/plot'
import { GyroAccelCurve, GyroAccelParams, curveNames, defaultExponent, presets } from 'lib/gyro_accel'
import { paramsFromGyro, applyParamsToGyro, gain, plotGyroAccel, GYRO_MAX_SPEED } from 'lib/gyro_accel'
import { paramsFromGyroAds, applyParamsToGyroAds } from 'lib/gyro_accel'
import { CtrlMacro } from 'lib/ctrl'
import { Macro, MacroMode, MacroOp, MacroStep, RecordedEvent, MACRO_STEPS_MAX } from 'lib/macro'
import { decodeMacro, encodeMacro, emptyMacro, describeMacro, stepsFromRecording } from 'lib/macro'
import { macroModeNames, macroOpNames, delayOptions, playableActions, snapDelay } from 'lib/macro'
import { hidFromKeyCode, hidFromMouseButton } from 'lib/macro'

@Component({
  selector: 'app-section',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    InputNumberComponent,
    ActionSelectorComponent,
    MapperComponent,
  ],
  templateUrl: './section.html',
  styleUrls: ['./section.sass']
})
export class SectionComponent {
  @Input() profileIndex: number = 0
  @Input() section: CtrlSection = new CtrlSectionMeta(0, SectionIndex.META, '', 0, 0, 0, 0)
  @Input() analog: boolean = false
  @ViewChild('mapper') mapper!: MapperComponent
  profileOverwriteIndex = 0
  profiles = this.webusb.getProfiles()!
  globalDeadzone = 0
  tab = 0
  dialogHelp!: HTMLDialogElement

  // Template aliases.
  HID = HID
  SectionIndex = SectionIndex
  GyroMode = GyroMode
  ThumbstickMode = ThumbstickMode

  // Plots.
  canvasCircle!: ElementRef<HTMLCanvasElement>
  canvasRamp!: ElementRef<HTMLCanvasElement>
  canvasRotation!: ElementRef<HTMLCanvasElement>
  canvasGyroAccel!: ElementRef<HTMLCanvasElement>

  // Gyro acceleration.
  GyroAccelCurve = GyroAccelCurve
  accelCurves = Object.values(GyroAccelCurve).filter((v) => typeof v === 'number') as GyroAccelCurve[]
  accelCurveNames = curveNames
  accelPresets = presets
  accelExampleSpeeds = [30, 150, 300, 500]

  // Macros.
  MacroOp = MacroOp
  macroModes = [MacroMode.ONCE, MacroMode.REPEAT_HELD, MacroMode.TOGGLE]
  macroModeNames = macroModeNames
  macroOps = [MacroOp.TAP, MacroOp.DOWN, MacroOp.UP, MacroOp.WAIT]
  macroOpNames = macroOpNames
  macroDelayOptions = delayOptions
  macroActions = playableActions
  macroStepsMax = MACRO_STEPS_MAX
  macroIndex = 0  // 0-7.
  macroEdit: Macro | null = null
  macroRecording = false
  macroRecordEvents: RecordedEvent[] = []
  macroRecordStart = 0
  private macroListeners: [string, (e: any) => void][] = []
  green = 'hsl(160deg, 100%, 50%)'
  purple = 'hsl(266deg, 100%, 50%)'

  constructor(
    public webusb: WebusbService,
  ) {
    this.afterConstructor()
  }

  async afterConstructor() {
    this.globalDeadzone = await this.fetchGlobalDeadzone()
  }

  ngAfterViewChecked() {
    this.plot()
  }

  sectionIsMeta = () => this.section instanceof CtrlSectionMeta
  sectionIsButton = () => this.section instanceof CtrlButton && !(this.section instanceof CtrlHome)
  sectionIsHome = () => this.section instanceof CtrlHome
  sectionIsRotary = () => this.section instanceof CtrlRotary
  sectionIsThumbstick = () => this.section instanceof CtrlThumbstick
  sectionIsGyro = () => this.section instanceof CtrlGyro
  sectionIsGyroAxis = () => this.section instanceof CtrlGyroAxis
  getSection = () => this.section as CtrlSection
  getSectionAsMeta = () => this.section as CtrlSectionMeta
  getSectionAsButton = () => this.section as CtrlButton
  getSectionAsRotary = () => this.section as CtrlRotary
  getSectionAsThumbstick = () => this.section as CtrlThumbstick
  getSectionAsGyro = () => this.section as CtrlGyro
  getSectionAsGyroAxis = () => this.section as CtrlGyroAxis

  @ViewChild('_canvasCircle') set _canvasCircle(canvas: ElementRef<HTMLCanvasElement>) {
    if (!canvas) return
    this.canvasCircle = canvas
    this.plot()
  }

  @ViewChild('_canvasRamp') set _canvasRamp(canvas: ElementRef<HTMLCanvasElement>) {
    if (!canvas) return
    this.canvasRamp = canvas
    this.plot()
  }

  @ViewChild('_canvasRotation') set _canvasRotation(canvas: ElementRef<HTMLCanvasElement>) {
    if (!canvas) return
    this.canvasRotation = canvas
    this.plot()
  }

  @ViewChild('_canvasGyroAccel') set _canvasGyroAccel(canvas: ElementRef<HTMLCanvasElement>) {
    if (!canvas) return
    this.canvasGyroAccel = canvas
    this.plot()
  }

  gyroIsIncremental(gyro: CtrlGyro) {
    const mode = Number(gyro.mode)
    return mode != GyroMode.OFF && mode != GyroMode.AXIS_ABSOLUTE
  }

  accelParams(gyro: CtrlGyro): GyroAccelParams {
    return paramsFromGyro(gyro)
  }

  accelSet(gyro: CtrlGyro, patch: Partial<GyroAccelParams>) {
    const params = {...paramsFromGyro(gyro), ...patch}
    applyParamsToGyro(gyro, params)
    this.save()
    this.plot()
  }

  accelSetCurve(gyro: CtrlGyro, curve: GyroAccelCurve) {
    const current = paramsFromGyro(gyro)
    if (current.curve == GyroAccelCurve.OFF && curve != GyroAccelCurve.OFF && current.speedMax == 0) {
      // First time enabled: start from the balanced preset values.
      const base = presets[1].params
      this.accelSet(gyro, {...base, curve, exponent: defaultExponent[curve]})
      return
    }
    this.accelSet(gyro, {curve, exponent: defaultExponent[curve] || current.exponent})
  }

  accelApplyPreset(gyro: CtrlGyro, index: number) {
    if (index < 0) return
    this.accelSet(gyro, {...presets[index].params})
  }

  accelGain(gyro: CtrlGyro, speed: number) {
    return gain(paramsFromGyro(gyro), speed)
  }

  // How many degrees of wrist rotation a fast flick needs for a 180 turn,
  // compared to the same turn without acceleration.
  accelFlickDegrees(gyro: CtrlGyro, turn: number) {
    return turn / gain(paramsFromGyro(gyro), Math.min(400, GYRO_MAX_SPEED))
  }

  sectionIsMacro = () => this.section instanceof CtrlMacro

  ngOnChanges() {
    this.macroEdit = null
    this.macroStopRecording(false)
  }

  ngOnDestroy() {
    this.macroStopRecording(false)
  }

  private macroSection(index: number): CtrlMacro {
    const profile = this.profiles.profiles[this.profileIndex]
    return [profile.macro1, profile.macro2, profile.macro3, profile.macro4][Math.floor(index / 2)]
  }

  macroSummary(index: number) {
    const section = this.macroSection(index)
    const sub = index % 2
    return describeMacro(decodeMacro(section.macros[sub], section.formats[sub]))
  }

  macro(): Macro {
    if (!this.macroEdit) {
      const section = this.macroSection(this.macroIndex)
      const sub = this.macroIndex % 2
      this.macroEdit = decodeMacro(section.macros[sub], section.formats[sub])
    }
    return this.macroEdit
  }

  macroSelect(index: number) {
    this.macroStopRecording(false)
    this.macroIndex = index
    this.macroEdit = null
  }

  async macroSave() {
    const macro = this.macro()
    macro.legacy = false
    const section = this.macroSection(this.macroIndex)
    const sub = this.macroIndex % 2
    const {bytes, format} = encodeMacro(macro)
    section.macros[sub] = bytes
    section.formats[sub] = format
    section.profileIndex = this.profileIndex
    await this.webusb.trySetSection(this.profileIndex, section)
  }

  macroAddStep(op = MacroOp.TAP) {
    const macro = this.macro()
    if (macro.steps.length >= MACRO_STEPS_MAX) return
    macro.steps.push({action: op == MacroOp.WAIT ? 0 : HID.KEY_SPACE, op, delay: op == MacroOp.WAIT ? 100 : 30})
    this.macroSave()
  }

  macroRemoveStep(i: number) {
    this.macro().steps.splice(i, 1)
    this.macroSave()
  }

  macroMoveStep(i: number, dir: number) {
    const steps = this.macro().steps
    const j = i + dir
    if (j < 0 || j >= steps.length) return
    [steps[i], steps[j]] = [steps[j], steps[i]]
    this.macroSave()
  }

  macroSetStep(step: MacroStep, patch: Partial<MacroStep>) {
    Object.assign(step, patch)
    if (patch.delay !== undefined) step.delay = snapDelay(Number(patch.delay))
    this.macroSave()
  }

  macroClear() {
    const mode = this.macro().mode
    const tapMs = this.macro().tapMs
    this.macroEdit = {...emptyMacro(), mode, tapMs}
    this.macroSave()
  }

  macroStartRecording() {
    if (this.macroRecording) return
    this.macroRecording = true
    this.macroRecordEvents = []
    this.macroRecordStart = performance.now()
    const push = (action: number, down: boolean) => {
      if (!action) return
      const events = this.macroRecordEvents
      // Ignore key auto-repeat.
      const last = [...events].reverse().find((e) => e.action == action)
      if (down && last && last.down) return
      events.push({action, down, time: performance.now() - this.macroRecordStart})
      // Each tap uses one step, holds use two: stop when surely full.
      if (events.length >= MACRO_STEPS_MAX * 2) this.macroStopRecording(true)
    }
    const onKey = (down: boolean) => (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      push(hidFromKeyCode(e.code), down)
    }
    const onMouse = (down: boolean) => (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest || !target.closest('.macro-record-pad')) return
      e.preventDefault()
      push(hidFromMouseButton(e.button), down)
    }
    const noMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (target.closest && target.closest('.macro-record-pad')) e.preventDefault()
    }
    this.macroListeners = [
      ['keydown', onKey(true)],
      ['keyup', onKey(false)],
      ['mousedown', onMouse(true)],
      ['mouseup', onMouse(false)],
      ['contextmenu', noMenu],
    ]
    for (const [name, fn] of this.macroListeners) window.addEventListener(name, fn, true)
  }

  macroStopRecording(apply: boolean) {
    for (const [name, fn] of this.macroListeners) window.removeEventListener(name, fn, true)
    this.macroListeners = []
    if (!this.macroRecording) return
    this.macroRecording = false
    if (apply && this.macroRecordEvents.length > 0) {
      this.macro().steps = stepsFromRecording(this.macroRecordEvents)
      this.macroSave()
    }
  }

  // Aim-down-sights acceleration.
  adsParams(gyro: CtrlGyro): GyroAccelParams {
    return paramsFromGyroAds(gyro)
  }

  adsSet(gyro: CtrlGyro, patch: Partial<GyroAccelParams>) {
    const params = {...paramsFromGyroAds(gyro), ...patch}
    applyParamsToGyroAds(gyro, params)
    this.save()
  }

  adsSetCurve(gyro: CtrlGyro, curve: GyroAccelCurve) {
    const current = paramsFromGyroAds(gyro)
    if (current.curve == GyroAccelCurve.OFF && curve != GyroAccelCurve.OFF && current.speedMax == 0) {
      // First time enabled: start from the hip curve.
      this.adsSet(gyro, {...paramsFromGyro(gyro), curve, exponent: defaultExponent[curve]})
      return
    }
    this.adsSet(gyro, {curve, exponent: defaultExponent[curve] || current.exponent})
  }

  adsGain(gyro: CtrlGyro, speed: number) {
    return gain(paramsFromGyroAds(gyro), speed) * ((gyro.ads_sens || 100) / 100)
  }

  adsPinOptions() {
    const pins = this.getPins() as any
    const names: [string, string][] = [
      ['L2', 'L2'], ['R2', 'R2'], ['L1', 'L1'], ['R1', 'R1'], ['L4', 'L4'], ['R4', 'R4'],
      ['L3', 'L3 (left stick push)'], ['R3', 'R3'], ['A', 'A'], ['B', 'B'], ['X', 'X'], ['Y', 'Y'],
      ['DPAD_LEFT', 'DPad Left'], ['DPAD_RIGHT', 'DPad Right'], ['DPAD_UP', 'DPad Up'],
      ['DPAD_DOWN', 'DPad Down'],
    ]
    return names.filter(([key]) => pins[key] !== undefined).map(([key, label]) => ({value: pins[key] as number, label}))
  }

  gyroSetRaw(gyro: CtrlGyro, key: 'ads_engage' | 'ads_sens' | 'tighten' | 'smooth_threshold' | 'smooth_time' | 'space', value: number) {
    gyro[key] = Math.max(0, Math.min(255, Math.round(Number(value))))
    this.save()
  }

  getSectionTitle() {
    return sectionTitles[this.section.sectionIndex]
  }

  getActions() {
    const section = this.section as (CtrlButton | CtrlRotary | CtrlGyroAxis)
    return section.actions
  }

  getLabels() {
    const section = this.section as (CtrlButton | CtrlRotary)
    return section.labels
  }

  getPins() {
    if (this.webusb.selectedDevice!.isAlpakkaV0()) return PinV0
    else return PinV1
  }

  async fetchGlobalDeadzone() {
    const preset = await this.webusb.tryGetConfig(ConfigIndex.DEADZONE)
    return preset.values[preset.presetIndex]
  }

  isButtonBlockVisible(group: number) {
    const button = this.getSectionAsButton()
    if (group == 0) return true
    if (group == 1 && (button.hold || button.sticky)) return true
    if (group == 2 && (button.double)) return true
    return false
  }

  getButtonBlockSubtitle(group: number) {
    const button = this.getSectionAsButton()
    if (group == 0) {
      if (button.sticky) return 'On the first press, until home is released:'
      if (!button.hold && !button.double && !button.immediate) return 'On button press:'
      if (button.hold && !button.immediate) return 'On short press:'
      if (button.hold && button.immediate) return 'On press (always):'
      if (!button.hold && button.double && !button.immediate) return 'On single press:'
      if (!button.hold && button.double && button.immediate) return 'On first press (always):'
    }
    if (group == 1) {
      if (button.sticky) return 'On every press:'
      if (button.hold && !button.double && !button.immediate) return 'Otherwise on long press:'
      if (button.hold && button.double && !button.immediate) return 'On long press:'
      if (button.hold && button.immediate) return 'Additionally on long press:'
      if (!button.hold && button.double && !button.immediate) return 'On single press:'
      if (!button.hold && button.double && button.immediate) return 'On first press (always):'
    }
    if (group == 2) {
      return 'On double press:'
    }
    return ''
  }

  getGyroMode() {
    const profile = this.profiles.getProfile(this.profileIndex) as Profile
    return profile.settingsGyro.mode
  }

  async profileOverwrite() {
    this.webusb.sendProfileOverwrite(this.profileIndex, this.profileOverwriteIndex)
    // Force <select> to initial value. For some reason Angular 2-way binding
    // does not fully work on HTML elements with OS-controlled UI?.
    // So this cannot be done with just "profileOverwriteIndex = 0".
    const element = document.getElementById('loadProfileElement') as any
    element.value = 0
    // Update the profile in the UI. Delay so the controller has time to process
    // the request before re-fetching the profile.
    await delay(500)
    this.profiles.fetchProfile(this.profileIndex, true)
  }

  async profileLoad(files: File[]) {
    const reader = new FileReader()
    reader.onload = (event: any) => {
      this.profiles.loadFromBlob(this.profileIndex, new Uint8Array(event.target.result))
    }
    reader.readAsArrayBuffer(files[0])
  }

  async profileSave() {
    const profileName = this.profiles.getProfile(this.profileIndex).meta.name
    const filename = `${profileName}.ctrl`
    const data = this.profiles.saveToBlob(this.profileIndex)
    const blob = new Blob([data], {type: 'application/octet-stream'})
    const a = document.createElement('a')
    document.body.appendChild(a)
    a.href = URL.createObjectURL(blob)
    a.download = filename
    a.click()
    URL.revokeObjectURL(a.href)
    a.remove()
  }

  thumbstickHasMouseAxis(thumbstick: CtrlThumbstick) {
    const profile = this.profiles.profiles[this.profileIndex]
    return profile.thumbstickHasAxis(thumbstick, isMouseAxis)
  }

  thumbstickHasScrollAxis(thumbstick: CtrlThumbstick) {
    const profile = this.profiles.profiles[this.profileIndex]
    return profile.thumbstickHasAxis(thumbstick, isScrollAxis)
  }

  thumbstickHasGamepadAxis(thumbstick: CtrlThumbstick) {
    const profile = this.profiles.profiles[this.profileIndex]
    return profile.thumbstickHasAxis(thumbstick, isGamepadAxis)
  }

  thumbstickHasOneAnalogAction(thumbstick: CtrlThumbstick) {
    const profile = this.profiles.profiles[this.profileIndex]
    const actions = profile.thumbstickGetActions(thumbstick)
    const actionsPrimary = [...actions.up[0], ...actions.down[0], ...actions.left[0], ...actions.right[0]]
    if (actionsPrimary.length !== 1) return false
    if (!isAxis(actionsPrimary[0])) return false
    return true
  }

  thumbstickGetActionAngle(thumbstick: CtrlThumbstick) {
    const profile = this.profiles.profiles[this.profileIndex]
    const actions = profile.thumbstickGetActions(thumbstick)
    if      (actions.up[0]   .length > 0) return 0
    else if (actions.right[0].length > 0) return 90
    else if (actions.down[0] .length > 0) return 180
    else if (actions.left[0] .length > 0) return 270
    else return 0
  }

  buttonsCanHaveModifiers(button: CtrlButton) {
    const sectionName = SectionIndex[button.sectionIndex]
    const is_cardinal = (
      sectionName.endsWith('LEFT') ||
      sectionName.endsWith('RIGHT') ||
      sectionName.endsWith('UP') ||
      sectionName.endsWith('DOWN')
    )
    if (is_cardinal) {
      const is_stick_left = sectionName.startsWith('LSTICK_')
      const is_stick_right = sectionName.startsWith('RSTICK_')
      const profile = this.profiles.profiles[this.profileIndex]
      if (is_stick_left  && profile.settingsLStick.mode == ThumbstickMode.ROTATION) return false;
      if (is_stick_right && profile.settingsRStick.mode == ThumbstickMode.ROTATION) return false;
    }
    return true;
  }

  plot() {
    plotCircle(this)
    plotRamp(this)
    plotRotation(this)
    if (this.canvasGyroAccel && this.section instanceof CtrlGyro) {
      plotGyroAccel(this.canvasGyroAccel.nativeElement, paramsFromGyro(this.section), {
        curve: this.green,
        marker: this.purple,
        grid: 'hsl(0deg, 0%, 20%)',
        text: 'hsl(0deg, 0%, 55%)',
      })
    }
  }

  // Colors in the sidebar action selector.
  actionCls = (index: number, action: HID) => {
    let cls = 'press'
    if (this.section instanceof CtrlButton) {
      if (index==1 && this.section.hold) cls += ' hold'
      if (index==2 && this.section.double) cls += ' double'
    }
    if (this.analog && sectionIsAnalog(this.section.sectionIndex) && isAxis(action)) {
      cls += ' analog'
    }
    return cls
  }

  save = async () => {
    await this.webusb.trySetSection(this.profileIndex, this.section)
  }

  showDialogHelp(key: string) {
    const elementId = 'dialog-help-' + key
    this.dialogHelp = document.getElementById(elementId) as HTMLDialogElement
    this.dialogHelp.showModal()
  }

  hideDialogHelp() {
    this.dialogHelp.close()
  }
}

interface SectionTitles {
  [index: number]: string
}
const sectionTitles: SectionTitles = {
  [SectionIndex.A]:                'Button A',
  [SectionIndex.B]:                'Button B',
  [SectionIndex.X]:                'Button X',
  [SectionIndex.Y]:                'Button Y',
  [SectionIndex.DPAD_LEFT]:        'DPad Left',
  [SectionIndex.DPAD_RIGHT]:       'DPad Right',
  [SectionIndex.DPAD_UP]:          'DPad Up',
  [SectionIndex.DPAD_DOWN]:        'DPad Down',
  [SectionIndex.SELECT_1]:         'Select',
  [SectionIndex.SELECT_2]:         'Select (2)',
  [SectionIndex.START_1]:          'Start',
  [SectionIndex.START_2]:          'Start (2)',
  [SectionIndex.L1]:               'Trigger L1',
  [SectionIndex.L2]:               'Trigger L2',
  [SectionIndex.L4]:               'Trigger L4',
  [SectionIndex.R1]:               'Trigger R1',
  [SectionIndex.R2]:               'Trigger R2',
  [SectionIndex.R4]:               'Trigger R4',
  [SectionIndex.LSTICK_SETTINGS]:  'LStick Settings',
  [SectionIndex.LSTICK_LEFT]:      'LStick Left',
  [SectionIndex.LSTICK_RIGHT]:     'LStick Right',
  [SectionIndex.LSTICK_UP]:        'LStick Up',
  [SectionIndex.LSTICK_DOWN]:      'LStick Down',
  [SectionIndex.LSTICK_UL]:        'LStick Up-Left',
  [SectionIndex.LSTICK_UR]:        'LStick Up-Right',
  [SectionIndex.LSTICK_DL]:        'LStick Down-Left',
  [SectionIndex.LSTICK_DR]:        'LStick Down-Right',
  [SectionIndex.LSTICK_PUSH]:      'LStick Push',
  [SectionIndex.LSTICK_INNER]:     'LStick Inner',
  [SectionIndex.LSTICK_OUTER]:     'LStick Outer',
  [SectionIndex.RSTICK_SETTINGS]:  'RStick Settings',
  [SectionIndex.RSTICK_LEFT]:      'RStick Left',
  [SectionIndex.RSTICK_RIGHT]:     'RStick Right',
  [SectionIndex.RSTICK_UP]:        'RStick Up',
  [SectionIndex.RSTICK_DOWN]:      'RStick Down',
  [SectionIndex.RSTICK_UL]:        'RStick Up-Left',
  [SectionIndex.RSTICK_UR]:        'RStick Up-Right',
  [SectionIndex.RSTICK_DL]:        'RStick Down-Left',
  [SectionIndex.RSTICK_DR]:        'RStick Down-Right',
  [SectionIndex.RSTICK_PUSH]:      'RStick Push',
  [SectionIndex.ROTARY_UP]:        'Rotary up',
  [SectionIndex.ROTARY_DOWN]:      'Rotary down',
  [SectionIndex.GYRO_SETTINGS]:    'Gyro settings',
  [SectionIndex.GYRO_X]:           'Gyro Axis X',
  [SectionIndex.GYRO_Y]:           'Gyro Axis Y',
  [SectionIndex.GYRO_Z]:           'Gyro Axis Z',
}
