// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2023, Input Labs Oy.

import { Component } from '@angular/core'
import { CommonModule } from '@angular/common'
import { ActivatedRoute } from '@angular/router'
import { InputToggleComponent } from 'components/input_toggle/input_toggle'
import { InputNumberComponent } from 'components/input_number/input_number'
import { WebusbService } from 'services/webusb'
import { ConfigIndex } from 'lib/ctrl'

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [
    CommonModule,
    InputToggleComponent,
    InputNumberComponent,
  ],
  templateUrl: './settings.html',
  styleUrls: ['./settings.sass']
})
export class SettingsComponent {
  longCalibration = false
  swapGyros = false
  invertTouchPolarity = false
  gyroUserOffsetX = 0
  gyroUserOffsetY = 0
  gyroUserOffsetZ = 0
  thumbstickSmoothSamples = 0;
  pollingRate = 0;  // 0=250Hz, 1=500Hz, 2=1000Hz (fork extension).
  pollingRates = [{index: 0, label: '250 Hz (stock)'}, {index: 1, label: '500 Hz'}, {index: 2, label: '1000 Hz'}]
  dialogHelp: any
  helpTitle = 'Title'
  helpText = 'Text'

  constructor(
    private activatedRoute: ActivatedRoute,
    public webusb: WebusbService,
  ) {
  }

  ngAfterViewInit() {
    this.load()
  }

  async load() {
    const getConfig = async(index: ConfigIndex) => {
      return (await this.webusb.tryGetConfig(index)).presetIndex
    }
    this.longCalibration = !!await getConfig(ConfigIndex.LONG_CALIBRATION)
    this.swapGyros = !!await getConfig(ConfigIndex.SWAP_GYROS)
    this.invertTouchPolarity = !!await getConfig(ConfigIndex.TOUCH_INVERT_POLARITY)
    const gyroUserOffset = await this.webusb.tryGetConfig(ConfigIndex.GYRO_USER_OFFSET)
    this.gyroUserOffsetX = gyroUserOffset.values[0]
    this.gyroUserOffsetY = gyroUserOffset.values[1]
    this.gyroUserOffsetZ = gyroUserOffset.values[2]
    if (this.gyroUserOffsetX > 127) this.gyroUserOffsetX -= 256
    if (this.gyroUserOffsetY > 127) this.gyroUserOffsetY -= 256
    if (this.gyroUserOffsetZ > 127) this.gyroUserOffsetZ -= 256
    this.thumbstickSmoothSamples = await getConfig(ConfigIndex.THUMBSTICK_SMOOTH_SAMPLES)
    this.pollingRate = await getConfig(ConfigIndex.POLLING_RATE)
  }

  async saveLongCalibration() {
    await this.webusb.trySetConfig(ConfigIndex.LONG_CALIBRATION, +this.longCalibration, [])
  }

  async saveSwapGyros() {
    await this.webusb.trySetConfig(ConfigIndex.SWAP_GYROS, +this.swapGyros, [])
  }

  async saveInvertTouchPolarity() {
    await this.webusb.trySetConfig(ConfigIndex.TOUCH_INVERT_POLARITY, +this.invertTouchPolarity, [])
  }

  async saveGyroUserOffset() {
    await this.webusb.trySetConfig(ConfigIndex.GYRO_USER_OFFSET, 0, [
      this.gyroUserOffsetX,
      this.gyroUserOffsetY,
      this.gyroUserOffsetZ,
    ])
  }

  async saveThumbstickSmoothSamples() {
    await this.webusb.trySetConfig(ConfigIndex.THUMBSTICK_SMOOTH_SAMPLES, +this.thumbstickSmoothSamples, [])
  }

  async savePollingRate() {
    await this.webusb.trySetConfig(ConfigIndex.POLLING_RATE, +this.pollingRate, [])
  }

  showDialogHelp(key: string) {
    const titles: {[key: string]: string} = {
      longCalibration: "Long calibration",
      swapGyros: "Swap gyros",
      invertTouchPolarity: "Invert touch polarity",
      gyroUserOffset: "Gyro calibration tweak",
      pollingRate: "Polling rate",
    }
    const texts: {[key: string]: string} = {
      pollingRate:
        `How many times per second the controller reads its sensors and reports to the computer
        when connected by USB. Higher rates lower input latency and make gyro aiming smoother on
        high refresh rate monitors.<br><br>
        Sensitivity and smoothing are normalized, so aiming feels the same at any rate.<br><br>
        Wireless mode always uses 250 Hz.<br><br>
        If the controller misbehaves at 1000 Hz, go back to 500 Hz.`,
      longCalibration:
        `In some cases the drift could be changing direction so slowly that a normal calibration is
        not able to capture it completely. A longer calibration will do a better job
        averaging the drift.<br><br>
        After enabling this setting, any new calibration procedure will take 4x times longer.`,
      swapGyros:
        `In some cases one of the IMU sensors could be more sensitive to temperature-induced drift,
        since each gyroscope sensor is configured in a slightly different way, swapping their roles
        could help preventing this issue.<br><br>
        A re-calibration is required after enabling this feature.`,
      invertTouchPolarity:
        `The touch sensor works by measuring how long it takes to charge up or charge down the touch
        plate (and anything that touches it). This polarity setting controls which one it is
        (up or down).<br><br>
        If you are having problems with the touch sensor, this feature could help making the
        measurements more stable.`,
      gyroUserOffset:
        `Since the calibration has to be performed with the controller on a flat surface, it is
        possible that the piezoelectric sensor has slightly different zero readings while tilted
        back and held in a normal gaming position.<br><br>
        If this problem is noticeable, it can be solved by manually adding additional offsets into
        the calibration values.`,
      thumbstickSmoothing:
        `How many additional samples are used to calculate the final value of the thumbstick.
        More samples provide a more stable output but also increase the perceived latency.<br><br>
        Smoothing is disabled when the number of additional samples is set to zero (only
        the current sample is used).`,
    }
    this.helpTitle = titles[key]
    this.helpText = texts[key]
    this.dialogHelp = document.getElementById('dialog-help')
    this.dialogHelp.showModal()
  }

  hideDialogHelp() {
    this.dialogHelp.close()
  }
}
