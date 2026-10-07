import { RESPONSE_CURVES } from './gamepadEngine.js';
import { sound } from './soundEngine.js';

/**
 * Single-Target Precision Calibration Engine
 * Focuses 100% on a single active target at a time:
 * - Spawns 1 target
 * - Monitors your continuous stick input as you acquire, track, and pull the trigger
 * - Calculates angular overshoot past the target, undershoot lag, micro-jitter tremor, and stick drift
 * - Automatically tunes and adjusts sensitivity (X & Y), deadzone, and response curves
 */
export class AutoTunerEngine {
  constructor(gamepadEngine, targetRange) {
    this.engine = gamepadEngine;
    this.range = targetRange;

    this.isCalibrating = false;
    this.targetIndex = 0;
    this.targetCountRequired = 8; // 8 focused single-target flicks
    this.targetHistory = []; // analytics per target

    // Live frame telemetry for current target
    this.currentTargetStartTime = 0;
    this.currentTargetPos = null;
    this.activeStickTrajectory = [];
    this.neutralDriftReadings = [];

    // Real-time metrics
    this.totalOvershoots = 0;
    this.totalUndershoots = 0;
    this.totalJitters = 0;

    this.onProgressUpdate = null;
    this.onAutoTuneComplete = null;
  }

  startCalibration() {
    this.isCalibrating = true;
    this.targetIndex = 0;
    this.targetHistory = [];
    this.neutralDriftReadings = [];
    this.totalOvershoots = 0;
    this.totalUndershoots = 0;
    this.totalJitters = 0;

    // Switch range to dedicated single-target calibration mode
    this.range.mode = 'single_calibration';
    this.range.isRunning = true;
    this.range.yaw = 0;
    this.range.pitch = 0;
    this.range.camera.rotation.set(0, 0, 0);

    // Spawn the first single target
    this.spawnNextCalibrationTarget();

    if (this.onProgressUpdate) {
      this.onProgressUpdate({
        step: 1,
        targetNumber: 1,
        totalTargets: this.targetCountRequired,
        message: 'Target 1/8: Acquire and shoot the target at your natural speed.',
        progress: 0,
      });
    }
  }

  stopCalibration() {
    this.isCalibrating = false;
    this.range.mode = 'gridshot';
  }

  spawnNextCalibrationTarget() {
    this.targetIndex++;
    this.activeStickTrajectory = [];
    this.currentTargetStartTime = performance.now();

    // Spawn exactly 1 target at varied angles and distances to test micro and flick ranges
    this.range.clearTargets();

    // Preset systematic testing angles:
    // Targets 1-2: Moderate horizontal flick
    // Targets 3-4: Diagonal and vertical micro-adjustment
    // Targets 5-6: Wide peripheral flick
    // Targets 7-8: Center small precision target
    let x = 0, y = 3.0, z = -13, radius = 0.55;

    switch (this.targetIndex) {
      case 1:
        x = 4.2; y = 3.0; radius = 0.55; break;
      case 2:
        x = -4.2; y = 3.0; radius = 0.55; break;
      case 3:
        x = 2.8; y = 4.4; radius = 0.48; break;
      case 4:
        x = -2.8; y = 1.9; radius = 0.48; break;
      case 5:
        x = 6.0; y = 3.2; radius = 0.52; break;
      case 6:
        x = -6.0; y = 3.2; radius = 0.52; break;
      case 7:
        x = 1.5; y = 3.1; radius = 0.38; break;
      case 8:
      default:
        x = -1.8; y = 3.5; radius = 0.38; break;
    }

    const targetObj = this.range.createSphereTarget(x, y, z, radius, true);
    this.currentTargetPos = { x, y, z };
    sound.playSpawn();
    return targetObj;
  }

  /**
   * Called every animation frame: continuously logs stick inputs while user aims at the single target
   */
  update(deltaSec) {
    if (!this.isCalibrating) return;

    const poll = this.engine.poll();
    const rawX = poll.rawRightStick.x;
    const rawY = poll.rawRightStick.y;
    const rawMag = Math.hypot(rawX, rawY);

    // Track neutral drift whenever stick is near resting center
    if (rawMag < 0.25) {
      this.neutralDriftReadings.push(rawMag);
      if (this.neutralDriftReadings.length > 500) this.neutralDriftReadings.shift();
    }

    // Record stick trajectory towards the target
    this.activeStickTrajectory.push({
      time: performance.now(),
      rawX,
      rawY,
      rawMag,
      yaw: this.range.yaw,
      pitch: this.range.pitch,
    });

    // Keep active trajectory bounded to the last 2 seconds
    if (this.activeStickTrajectory.length > 120) {
      this.activeStickTrajectory.shift();
    }
  }

  /**
   * Called when player shoots at the single target
   */
  recordShotEvent({ hit, isHeadshot, reactionTime }) {
    if (!this.isCalibrating) return;

    // Analyze the complete motion history from target spawn to trigger pull
    const trajectory = this.activeStickTrajectory;
    let maxVel = 0;
    let reversals = 0;
    let lastDirX = 0;
    let totalTravelX = 0;
    let totalTravelY = 0;

    for (let i = 1; i < trajectory.length; i++) {
      const p = trajectory[i - 1];
      const c = trajectory[i];
      const dt = Math.max(0.001, (c.time - p.time) / 1000);
      const vx = (c.rawX - p.rawX) / dt;
      const vy = (c.rawY - p.rawY) / dt;
      const v = Math.hypot(vx, vy);
      if (v > maxVel) maxVel = v;

      totalTravelX += Math.abs(c.rawX - p.rawX);
      totalTravelY += Math.abs(c.rawY - p.rawY);

      const dirX = Math.sign(c.rawX);
      if (dirX !== 0 && lastDirX !== 0 && dirX !== lastDirX) {
        reversals++;
      }
      if (dirX !== 0) lastDirX = dirX;
    }

    // Classify input behaviour on this target
    let errorType = 'accurate';
    if (!hit) {
      if (reversals >= 2) {
        errorType = 'overshoot_oscillating'; // Swung past target and wobbled back
        this.totalOvershoots++;
        this.totalJitters++;
      } else if (maxVel > 5.5) {
        errorType = 'overshoot_speed'; // Overshot due to excessive turn rate
        this.totalOvershoots++;
      } else {
        errorType = 'undershoot_short'; // Did not reach target in time
        this.totalUndershoots++;
      }
    } else {
      if (reversals >= 2) {
        errorType = 'jitter_recovered'; // Hit target, but had to fight over-sensitive jitter
        this.totalJitters++;
      }
    }

    this.targetHistory.push({
      targetNum: this.targetIndex,
      hit,
      isHeadshot,
      reactionTime,
      reversals,
      maxVel,
      errorType,
      totalTravelX,
      totalTravelY,
    });

    // If hit, advance to next target
    if (hit || this.targetHistory.length >= this.targetCountRequired * 2) {
      const progress = Math.min(100, Math.round((this.targetIndex / this.targetCountRequired) * 100));

      if (this.targetIndex >= this.targetCountRequired) {
        // All targets tested! Compute optimal auto-fix
        this.finalizeAutoTune();
      } else {
        if (this.onProgressUpdate) {
          this.onProgressUpdate({
            step: 2,
            targetNumber: this.targetIndex + 1,
            totalTargets: this.targetCountRequired,
            message: `Target ${this.targetIndex + 1}/${this.targetCountRequired}: Acquired! Aim at the next target.`,
            progress,
          });
        }
        this.spawnNextCalibrationTarget();
      }
    } else {
      // Missed shot: Keep same target alive so player can complete acquisition
      if (this.onProgressUpdate) {
        this.onProgressUpdate({
          step: 2,
          targetNumber: this.targetIndex,
          totalTargets: this.targetCountRequired,
          message: `Target ${this.targetIndex}/${this.targetCountRequired}: Miss recorded (${errorType.replace('_', ' ')}). Adjust and shoot again!`,
          progress: Math.min(95, Math.round(((this.targetIndex - 1) / this.targetCountRequired) * 100)),
        });
      }
    }
  }

  /**
   * Diagnostic computation: analyzes all single-target input profiles and calculates optimal settings
   */
  finalizeAutoTune() {
    this.isCalibrating = false;

    // 1. Calculate Stick Drift Deadzone
    let maxDrift = 0.02;
    if (this.neutralDriftReadings.length > 0) {
      for (const d of this.neutralDriftReadings) {
        if (d > maxDrift && d < 0.20) maxDrift = d;
      }
    }
    const optimalDeadzone = parseFloat(Math.min(0.20, Math.max(0.04, maxDrift + 0.03)).toFixed(2));

    // 2. Compute Overshoot vs Undershoot ratios
    const totalSamples = Math.max(1, this.targetHistory.length);
    const overshootRatio = this.totalOvershoots / totalSamples;
    const undershootRatio = this.totalUndershoots / totalSamples;
    const jitterRatio = this.totalJitters / totalSamples;

    let hits = 0;
    this.targetHistory.forEach((t) => { if (t.hit) hits++; });
    const accuracyRatio = hits / totalSamples;

    let currentSensX = this.engine.settings.lookSensX;
    let currentSensY = this.engine.settings.lookSensY;
    let currentExp = this.engine.settings.curveExponent;
    let currentSmooth = this.engine.settings.smoothingFactor;
    let recommendedCurve = this.engine.settings.curveType;

    let sensMultiplier = 1.0;
    const diagnosis = [];

    // Stick drift analysis
    if (maxDrift > 0.05) {
      diagnosis.push(`Detected stick drift of ${(maxDrift * 100).toFixed(1)}%. Raised inner deadzone to ${(optimalDeadzone * 100).toFixed(0)}% to stop drift.`);
    } else {
      diagnosis.push(`Clean center stick centering (${(maxDrift * 100).toFixed(1)}%). Tuned inner deadzone to responsive ${(optimalDeadzone * 100).toFixed(0)}%.`);
    }

    // Overshoot / Undershoot adjustments
    if (overshootRatio > 0.30) {
      // Significantly overshooting -> Decrease sensitivity
      sensMultiplier = 0.82;
      diagnosis.push(`Overshot target on ${Math.round(overshootRatio * 100)}% of inputs. Reduced look sensitivity by 18% for crisp stopping power.`);
    } else if (undershootRatio > 0.30) {
      // Undershooting -> Increase sensitivity
      sensMultiplier = 1.25;
      diagnosis.push(`Undershot target on ${Math.round(undershootRatio * 100)}% of inputs. Increased sensitivity by 25% to reach targets faster.`);
    } else {
      diagnosis.push(`Consistent target acquisition (${Math.round(accuracyRatio * 100)}% accuracy). Retained balanced sensitivity curve.`);
      sensMultiplier = 0.96;
    }

    // Micro-jitter / Tremor correction
    let newExp = currentExp;
    if (jitterRatio > 0.25) {
      recommendedCurve = RESPONSE_CURVES.DYNAMIC;
      newExp = 2.4;
      currentSmooth = Math.min(0.25, currentSmooth + 0.10);
      diagnosis.push(`Micro-adjustment tremor detected around the target. Switched curve to Dynamic (S-Curve) with 0.10 smoothing to stabilize crosshair.`);
    } else if (accuracyRatio > 0.80) {
      recommendedCurve = RESPONSE_CURVES.EXPONENTIAL;
      newExp = 2.1;
      diagnosis.push(`Confident flick precision. Configured high-response Exponential 2.1 curve.`);
    }

    const optimalSensX = parseFloat(Math.min(9.0, Math.max(1.8, currentSensX * sensMultiplier)).toFixed(1));
    const optimalSensY = parseFloat(Math.min(7.5, Math.max(1.5, currentSensY * sensMultiplier)).toFixed(1));
    const optimalSmooth = parseFloat(currentSmooth.toFixed(2));

    const result = {
      before: {
        lookSensX: currentSensX,
        lookSensY: currentSensY,
        innerDeadzone: this.engine.settings.innerDeadzone,
        curveType: this.engine.settings.curveType,
        curveExponent: currentExp,
        smoothingFactor: this.engine.settings.smoothingFactor,
      },
      after: {
        lookSensX: optimalSensX,
        lookSensY: optimalSensY,
        innerDeadzone: optimalDeadzone,
        curveType: recommendedCurve,
        curveExponent: newExp,
        smoothingFactor: optimalSmooth,
      },
      diagnosis,
      stats: {
        overshoots: this.totalOvershoots,
        undershoots: this.totalUndershoots,
        jitters: this.totalJitters,
        hits,
        total: totalSamples,
        accuracy: (accuracyRatio * 100).toFixed(1),
      },
    };

    // Apply auto-fixed settings directly to the Gamepad Engine
    this.engine.settings.lookSensX = optimalSensX;
    this.engine.settings.lookSensY = optimalSensY;
    this.engine.settings.innerDeadzone = optimalDeadzone;
    this.engine.settings.curveType = recommendedCurve;
    this.engine.settings.curveExponent = newExp;
    this.engine.settings.smoothingFactor = optimalSmooth;

    sound.playFinish();

    if (this.onAutoTuneComplete) {
      this.onAutoTuneComplete(result);
    }
  }
}
