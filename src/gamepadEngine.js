/**
 * Gamepad Manager & Curve Math Engine
 * Supports standard gamepad mappings (Xbox, PlayStation, Generic Bluetooth)
 * Provides deadzone calculations (Axial, Radial, Radial Scaled),
 * Response curves (Linear, Exponential, Dynamic / S-Curve),
 * Outer threshold calibration, Aim smoothing, and ADS multiplier.
 */

import { sound } from './soundEngine.js';

export const RESPONSE_CURVES = {
  LINEAR: 'linear',
  EXPONENTIAL: 'exponential',
  DYNAMIC: 'dynamic', // S-Curve typical in modern tactical shooters
  ENHANCED_POW: 'enhanced_pow', // Gentle near center, high flick
};

export const DEADZONE_SHAPES = {
  RADIAL_SCALED: 'radial_scaled', // Standard in modern games (removes deadzone jump)
  AXIAL: 'axial',
  RADIAL_RAW: 'radial_raw',
};

export class GamepadEngine {
  constructor() {
    this.gamepadIndex = null;
    this.listeners = new Set();
    this.lastState = null;
    
    // User Settings Profile
    this.settings = {
      // Sensitivities
      lookSensX: 3.5,
      lookSensY: 2.8,
      adsMultiplier: 0.7,
      
      // Response Curve
      curveType: RESPONSE_CURVES.EXPONENTIAL,
      curveExponent: 2.2, // 1.0 = linear, 2.0+ = exponential
      dynamicMidpoint: 0.5,
      dynamicSteepness: 4.0,

      // Deadzone
      innerDeadzone: 0.08, // 8%
      outerThreshold: 0.96, // 96% -> 100% deflection
      deadzoneShape: DEADZONE_SHAPES.RADIAL_SCALED,

      // Invert
      invertY: false,
      invertX: false,

      // Smoothing & Acceleration
      smoothingFactor: 0.0, // 0 = raw, up to 0.85 = heavy smooth
      aimAcceleration: 1.2, // ramp up when pegging stick
      accelerationDelayMs: 150,

      // Over-flick Outer Edge Vibration Haptic Feedback
      overFlickVibration: true, // Rumble when stick pegs against the physical border (100% outer deadzone)
      overFlickIntensity: 0.75, // Vibration strength

      // Presets
      activePreset: 'custom',
    };

    // Load persisted settings from localStorage if available
    this.loadSettings();

    // Runtime tracking
    this.smoothedLook = { x: 0, y: 0 };
    this.stickPeggedDuration = 0;
    this.lastTimestamp = performance.now();
    this.wasStickPegged = false; // Edge trigger for over-flick rumble
    this.lastOverFlickVibeTime = 0;

    // Hook window gamepad events
    window.addEventListener('gamepadconnected', (e) => this.onConnected(e));
    window.addEventListener('gamepaddisconnected', (e) => this.onDisconnected(e));
    
    // Check if one is already connected
    this.detectInitialGamepad();
  }

  detectInitialGamepad() {
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (let i = 0; i < gamepads.length; i++) {
      if (gamepads[i]) {
        this.gamepadIndex = i;
        break;
      }
    }
  }

  onConnected(e) {
    this.gamepadIndex = e.gamepad.index;
    this.notify('connection_change', { connected: true, gamepad: e.gamepad });
  }

  onDisconnected(e) {
    if (this.gamepadIndex === e.gamepad.index) {
      this.gamepadIndex = null;
    }
    this.notify('connection_change', { connected: false });
  }

  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  notify(event, data) {
    this.listeners.forEach((cb) => cb(event, data));
  }

  getRawGamepad() {
    if (navigator.getGamepads) {
      const gamepads = navigator.getGamepads();
      if (this.gamepadIndex !== null && gamepads[this.gamepadIndex]) {
        return gamepads[this.gamepadIndex];
      }
      for (let i = 0; i < gamepads.length; i++) {
        if (gamepads[i]) {
          this.gamepadIndex = i;
          return gamepads[i];
        }
      }
    }
    return null;
  }

  /**
   * Process raw stick inputs [rx, ry] through deadzones and response curve
   */
  processStickInput(rawX, rawY, isADS = false, deltaSec = 0.016) {
    let x = rawX;
    let y = rawY;

    // 1. Calculate raw magnitude
    const rawMag = Math.hypot(x, y);

    let normX = 0;
    let normY = 0;
    let processedMag = 0;

    const { innerDeadzone, outerThreshold, deadzoneShape, curveType, curveExponent } = this.settings;

    if (deadzoneShape === DEADZONE_SHAPES.RADIAL_SCALED) {
      if (rawMag > innerDeadzone) {
        // Rescale magnitude from [innerDeadzone, outerThreshold] to [0, 1]
        const range = Math.max(0.0001, outerThreshold - innerDeadzone);
        const remappedMag = Math.min(1.0, Math.max(0, (rawMag - innerDeadzone) / range));
        
        // Direction vector
        const dirX = x / rawMag;
        const dirY = y / rawMag;

        // Apply Response Curve to magnitude
        processedMag = this.applyResponseCurve(remappedMag, curveType, curveExponent);

        normX = dirX * processedMag;
        normY = dirY * processedMag;
      }
    } else if (deadzoneShape === DEADZONE_SHAPES.AXIAL) {
      // Axial applies deadzones independently to X and Y
      normX = this.processAxialAxis(x, innerDeadzone, outerThreshold, curveType, curveExponent);
      normY = this.processAxialAxis(y, innerDeadzone, outerThreshold, curveType, curveExponent);
      processedMag = Math.min(1.0, Math.hypot(normX, normY));
    } else {
      // Radial Raw
      if (rawMag > innerDeadzone) {
        const remappedMag = Math.min(1.0, rawMag / outerThreshold);
        const dirX = x / rawMag;
        const dirY = y / rawMag;
        processedMag = this.applyResponseCurve(remappedMag, curveType, curveExponent);
        normX = dirX * processedMag;
        normY = dirY * processedMag;
      }
    }

    // Stick acceleration & Over-flick outer edge detection
    const isPegged = rawMag >= (this.settings.outerThreshold || 0.95) || processedMag >= 0.98;
    if (isPegged) {
      this.stickPeggedDuration += deltaSec * 1000;
      
      // If overFlickVibration is enabled, vibrate right when hitting the end of the stick
      if (this.settings.overFlickVibration) {
        const now = performance.now();
        // Edge trigger: fire MAXIMUM haptic burst on the initial flick strike or every 300ms if held pinned
        if (!this.wasStickPegged || now - this.lastOverFlickVibeTime > 300) {
          const intensity = Math.max(0.9, this.settings.overFlickIntensity || 1.0);
          // Fire maximum strength dual-rumble (weakMagnitude 1.0, strongMagnitude 1.0)
          this.playVibration(160, intensity, intensity);
          // Also trigger mechanical bass punch audio haptic
          sound.playOverFlickThud();
          this.lastOverFlickVibeTime = now;
        }
      }
      this.wasStickPegged = true;
    } else {
      this.stickPeggedDuration = Math.max(0, this.stickPeggedDuration - deltaSec * 3000);
      if (rawMag < (this.settings.outerThreshold || 0.95) * 0.88) {
        this.wasStickPegged = false;
      }
    }

    let accelBoost = 1.0;
    if (this.stickPeggedDuration > this.settings.accelerationDelayMs) {
      const t = Math.min(1.0, (this.stickPeggedDuration - this.settings.accelerationDelayMs) / 300);
      accelBoost = 1.0 + (this.settings.aimAcceleration - 1.0) * t;
    }

    // Apply Sensitivity & Invert
    let finalX = normX * this.settings.lookSensX * accelBoost;
    let finalY = normY * this.settings.lookSensY * accelBoost;

    if (this.settings.invertX) finalX = -finalX;
    if (this.settings.invertY) finalY = -finalY;

    if (isADS) {
      finalX *= this.settings.adsMultiplier;
      finalY *= this.settings.adsMultiplier;
    }

    // Apply Smoothing filter
    const smooth = Math.min(0.9, Math.max(0, this.settings.smoothingFactor));
    if (smooth > 0.01) {
      this.smoothedLook.x = this.smoothedLook.x * smooth + finalX * (1 - smooth);
      this.smoothedLook.y = this.smoothedLook.y * smooth + finalY * (1 - smooth);
      finalX = this.smoothedLook.x;
      finalY = this.smoothedLook.y;
    } else {
      this.smoothedLook.x = finalX;
      this.smoothedLook.y = finalY;
    }

    return {
      x: finalX,
      y: finalY,
      rawX,
      rawY,
      rawMag,
      processedMag,
      accelBoost,
      isPegged,
    };
  }

  processAxialAxis(val, deadzone, outer, curveType, exponent) {
    const sign = Math.sign(val);
    const absVal = Math.abs(val);
    if (absVal <= deadzone) return 0;
    const remapped = Math.min(1.0, (absVal - deadzone) / (outer - deadzone));
    return sign * this.applyResponseCurve(remapped, curveType, exponent);
  }

  applyResponseCurve(inputMag, curveType, exponent) {
    if (inputMag <= 0) return 0;
    if (inputMag >= 1) return 1;

    switch (curveType) {
      case RESPONSE_CURVES.LINEAR:
        return inputMag;

      case RESPONSE_CURVES.EXPONENTIAL:
        return Math.pow(inputMag, exponent);

      case RESPONSE_CURVES.DYNAMIC: {
        // Logistic / Sigmoid style S-curve
        // Slower near zero, steep in middle, smooth near edge
        const mid = this.settings.dynamicMidpoint || 0.5;
        const k = this.settings.dynamicSteepness || 4.5;
        const sig = (x) => 1 / (1 + Math.exp(-k * (x - mid)));
        const minSig = sig(0);
        const maxSig = sig(1);
        return (sig(inputMag) - minSig) / (maxSig - minSig);
      }

      case RESPONSE_CURVES.ENHANCED_POW:
        // Gentle micro adjustments, ramped flicking
        return 0.4 * Math.pow(inputMag, 1.5) + 0.6 * Math.pow(inputMag, 3.2);

      default:
        return Math.pow(inputMag, exponent);
    }
  }

  /**
   * Samples points along [0, 1] input deflection to render interactive SVG curve
   */
  generateCurvePoints(count = 60) {
    const points = [];
    const { curveType, curveExponent, innerDeadzone, outerThreshold } = this.settings;
    for (let i = 0; i <= count; i++) {
      const input = i / count;
      let output = 0;
      if (input > innerDeadzone) {
        const remapped = Math.min(1.0, Math.max(0, (input - innerDeadzone) / (outerThreshold - innerDeadzone)));
        output = this.applyResponseCurve(remapped, curveType, curveExponent);
      }
      points.push({ input, output });
    }
    return points;
  }

  /**
   * Poll full controller snapshot
   */
  poll() {
    const now = performance.now();
    const deltaSec = Math.max(0.001, (now - this.lastTimestamp) / 1000);
    this.lastTimestamp = now;

    const pad = this.getRawGamepad();
    if (!pad) {
      return {
        connected: false,
        name: 'No Controller Detected',
        rawRightStick: { x: 0, y: 0 },
        rawLeftStick: { x: 0, y: 0 },
        aimOutput: { x: 0, y: 0, rawMag: 0, processedMag: 0 },
        buttons: {},
      };
    }

    // Standard mapping:
    // Left Stick: Axes 0 (X), 1 (Y)
    // Right Stick: Axes 2 (X), 3 (Y)
    const lx = pad.axes[0] || 0;
    const ly = pad.axes[1] || 0;
    const rx = pad.axes[2] || 0;
    const ry = pad.axes[3] || 0;

    // Common buttons:
    // 0: A / Cross
    // 1: B / Circle
    // 2: X / Square
    // 3: Y / Triangle
    // 4: LB / L1
    // 5: RB / R1
    // 6: LT / L2 (value or pressed)
    // 7: RT / R2 (value or pressed)
    // 8: Back / Share
    // 9: Start / Options
    // 10: L3 / Left Stick Press
    // 11: R3 / Right Stick Press
    const isADS = (pad.buttons[6] && pad.buttons[6].value > 0.3) || (pad.buttons[4] && pad.buttons[4].pressed);
    const isShoot = (pad.buttons[7] && pad.buttons[7].value > 0.3) || (pad.buttons[5] && pad.buttons[5].pressed);

    const aimOutput = this.processStickInput(rx, ry, isADS, deltaSec);

    return {
      connected: true,
      name: pad.id,
      timestamp: pad.timestamp,
      rawLeftStick: { x: lx, y: ly },
      rawRightStick: { x: rx, y: ry },
      aimOutput,
      isADS,
      isShoot,
      buttons: {
        a: pad.buttons[0]?.pressed,
        b: pad.buttons[1]?.pressed,
        x: pad.buttons[2]?.pressed,
        y: pad.buttons[3]?.pressed,
        lb: pad.buttons[4]?.pressed,
        rb: pad.buttons[5]?.pressed,
        ltValue: pad.buttons[6]?.value || 0,
        rtValue: pad.buttons[7]?.value || 0,
        start: pad.buttons[9]?.pressed,
        select: pad.buttons[8]?.pressed,
        back: pad.buttons[8]?.pressed,
        l3: pad.buttons[10]?.pressed,
        r3: pad.buttons[11]?.pressed,
        dpadUp: pad.buttons[12]?.pressed,
        dpadDown: pad.buttons[13]?.pressed,
        dpadLeft: pad.buttons[14]?.pressed,
        dpadRight: pad.buttons[15]?.pressed,
      },
    };
  }

  // Pre-configured Esports / Game Presets
  applyPreset(presetName) {
    this.settings.activePreset = presetName;
    switch (presetName) {
      case 'call_of_duty_dynamic':
        this.settings.lookSensX = 4.2;
        this.settings.lookSensY = 3.6;
        this.settings.adsMultiplier = 0.85;
        this.settings.curveType = RESPONSE_CURVES.DYNAMIC;
        this.settings.dynamicMidpoint = 0.48;
        this.settings.dynamicSteepness = 4.5;
        this.settings.innerDeadzone = 0.05;
        this.settings.outerThreshold = 0.98;
        this.settings.aimAcceleration = 1.0;
        this.settings.smoothingFactor = 0.0;
        break;

      case 'apex_legends_linear':
        this.settings.lookSensX = 4.8;
        this.settings.lookSensY = 4.0;
        this.settings.adsMultiplier = 0.75;
        this.settings.curveType = RESPONSE_CURVES.LINEAR;
        this.settings.innerDeadzone = 0.03;
        this.settings.outerThreshold = 0.99;
        this.settings.aimAcceleration = 1.25;
        this.settings.smoothingFactor = 0.0;
        break;

      case 'halo_exponential':
        this.settings.lookSensX = 3.2;
        this.settings.lookSensY = 3.2;
        this.settings.adsMultiplier = 0.9;
        this.settings.curveType = RESPONSE_CURVES.EXPONENTIAL;
        this.settings.curveExponent = 2.4;
        this.settings.innerDeadzone = 0.09;
        this.settings.outerThreshold = 0.95;
        this.settings.aimAcceleration = 1.4;
        this.settings.smoothingFactor = 0.15;
        break;

      case 'fortnite_exponential':
        this.settings.lookSensX = 4.0;
        this.settings.lookSensY = 3.5;
        this.settings.adsMultiplier = 0.65;
        this.settings.curveType = RESPONSE_CURVES.EXPONENTIAL;
        this.settings.curveExponent = 2.1;
        this.settings.innerDeadzone = 0.06;
        this.settings.outerThreshold = 0.97;
        this.settings.aimAcceleration = 1.15;
        this.settings.smoothingFactor = 0.05;
        break;

      case 'precision_flick':
        this.settings.lookSensX = 5.0;
        this.settings.lookSensY = 4.2;
        this.settings.adsMultiplier = 0.6;
        this.settings.curveType = RESPONSE_CURVES.ENHANCED_POW;
        this.settings.innerDeadzone = 0.04;
        this.settings.outerThreshold = 0.96;
        this.settings.aimAcceleration = 1.3;
        this.settings.smoothingFactor = 0.0;
        break;

      case 'default':
      default:
        this.settings.lookSensX = 3.5;
        this.settings.lookSensY = 2.8;
        this.settings.adsMultiplier = 0.7;
        this.settings.curveType = RESPONSE_CURVES.EXPONENTIAL;
        this.settings.curveExponent = 2.2;
        this.settings.innerDeadzone = 0.08;
        this.settings.outerThreshold = 0.96;
        this.settings.aimAcceleration = 1.2;
        this.settings.smoothingFactor = 0.0;
        break;
    }
    this.saveSettings();
  }

  saveSettings() {
    try {
      localStorage.setItem('aimlab_controller_settings', JSON.stringify(this.settings));
    } catch (e) {
      console.warn('Could not save settings to localStorage:', e);
    }
  }

  loadSettings() {
    try {
      const saved = localStorage.getItem('aimlab_controller_settings');
      if (saved) {
        const parsed = JSON.parse(saved);
        this.settings = { ...this.settings, ...parsed };
      }
    } catch (e) {
      console.warn('Could not load settings from localStorage:', e);
    }
  }

  // Tactile haptics trigger (Maximum motor force)
  playVibration(duration = 160, weakMag = 1.0, strongMag = 1.0) {
    const pad = this.getRawGamepad();
    if (pad && pad.vibrationActuator && pad.vibrationActuator.playEffect) {
      try {
        pad.vibrationActuator.playEffect('dual-rumble', {
          startDelay: 0,
          duration,
          weakMagnitude: Math.min(1.0, Math.max(0, weakMag)),
          strongMagnitude: Math.min(1.0, Math.max(0, strongMag)),
        });
      } catch (err) {
        // Fallback or policy restriction
      }
    }

    // Secondary fallback for hapticActuators API if present
    const anyPad = /** @type {any} */ (pad);
    if (anyPad && anyPad.hapticActuators && anyPad.hapticActuators[0] && anyPad.hapticActuators[0].pulse) {
      try {
        anyPad.hapticActuators[0].pulse(1.0, duration);
      } catch (err) {}
    }

    // Mobile / device vibration fallback
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate(duration);
      } catch (err) {}
    }
  }
}

