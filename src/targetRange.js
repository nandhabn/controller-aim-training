import * as THREE from 'three';
import { sound } from './soundEngine.js';
import confetti from 'canvas-confetti';

/**
 * 3D Target Practice Simulation Range
 * Game Modes:
 * - 'gridshot': 3 static targets on grid; hitting one spawns another.
 * - 'tracking': 1 moving target with smooth trajectory; score based on beam hold on target.
 * - 'spidershot': Dynamic distance & size flicks from center to peripheral targets.
 * - 'free_calibrate': Infinite targets to test stick sensitivity, deadzones & micro adjustments.
 */
export class TargetRange {
  constructor(containerEl, gamepadEngine) {
    this.container = containerEl;
    this.gamepadEngine = gamepadEngine;

    // Simulation state
    this.mode = 'gridshot';
    this.duration = 45;
    this.timeLeft = 45;
    this.isRunning = false;
    this.score = 0;
    this.shotsFired = 0;
    this.shotsHit = 0;
    this.headshots = 0;
    this.reactionTimes = [];
    this.currentStreak = 0;
    this.highestStreak = 0;

    // Camera angles (yaw, pitch in radians)
    this.yaw = 0;
    this.pitch = 0;

    // Pointer Lock / Mouse support
    this.isPointerLocked = false;
    this.mouseSensitivity = 0.0022;

    // Three.js instances
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.targets = [];
    this.raycaster = new THREE.Raycaster();
    this.reticleRay = new THREE.Vector2(0, 0); // screen center

    // Shooting rate limit
    this.lastShotTime = 0;
    this.fireRateCooldown = 130; // ms
    this.lastShootPressed = false; // edge trigger for single shot per tap

    // Target Customization Settings
    this.targetConfig = {
      sizeScale: 1.0, // 0.5 (micro/small) to 1.8 (large)
      primaryColor: '#06b6d4', // Cyan default
      coreColor: '#f43f5e', // Rose bullseye
      shape: 'sphere', // 'sphere' | 'cube' | 'octahedron'
      glowIntensity: 0.8,
      spreadScale: 1.2, // 0.6 (tight) to 2.2 (wide)
      minSeparation: 2.2, // Prevents targets from being close or overlapping
      trackingSpeed: 4.5, // Follow-bot speed (1.0 slow to 12.0 supersonic)
      trackingAgility: 1.8, // Direction change rate / unpredictability
    };
    this.loadTargetConfig();

    // Hooks
    this.onStatsUpdate = null;
    this.onSessionFinish = null;
    this.onShotAttempt = null;
    this.onTargetHit = null; // Fired when any target is struck/clicked in normal practice modes

    this.initScene();
    this.initLighting();
    this.initArena();
    this.setupPointerLock();
  }

  initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x060913);
    this.scene.fog = new THREE.FogExp2(0x060913, 0.012);

    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;

    this.camera = new THREE.PerspectiveCamera(80, width / height, 0.1, 1000);
    // Player eye-level is at y = 3.0, target center is also around y = 3.0
    this.camera.position.set(0, 3.0, 0);
    this.camera.rotation.order = 'YXZ';

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.container.appendChild(this.renderer.domElement);

    window.addEventListener('resize', () => this.handleResize());
  }

  setupPointerLock() {
    this.renderer.domElement.addEventListener('click', () => {
      // If user clicks on canvas, optionally request pointer lock for mouse aiming
      if (!document.pointerLockElement) {
        this.renderer.domElement.requestPointerLock().catch(() => {});
      }
    });

    document.addEventListener('pointerlockchange', () => {
      this.isPointerLocked = document.pointerLockElement === this.renderer.domElement;
    });

    document.addEventListener('mousemove', (e) => {
      if (this.isPointerLocked) {
        this.yaw -= e.movementX * this.mouseSensitivity;
        this.pitch -= e.movementY * this.mouseSensitivity;
        const pitchLimit = THREE.MathUtils.degToRad(85);
        this.pitch = Math.max(-pitchLimit, Math.min(pitchLimit, this.pitch));
        this.camera.rotation.set(this.pitch, this.yaw, 0);
      }
    });

    // Mousedown shoot
    this.renderer.domElement.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this.shoot();
      }
    });
  }

  initLighting() {
    const ambient = new THREE.AmbientLight(0x334155, 1.4);
    this.scene.add(ambient);

    // Dynamic key light
    const dirLight = new THREE.DirectionalLight(0x60a5fa, 1.8);
    dirLight.position.set(10, 20, 10);
    dirLight.castShadow = true;
    this.scene.add(dirLight);

    // Warm rim light
    const rimLight = new THREE.DirectionalLight(0xf43f5e, 0.9);
    rimLight.position.set(-10, 10, -10);
    this.scene.add(rimLight);

    // Floor accent glow
    const pointLight = new THREE.PointLight(0x38bdf8, 2, 25);
    pointLight.position.set(0, 1, -6);
    this.scene.add(pointLight);
  }

  initArena() {
    // Floor
    const floorGeo = new THREE.PlaneGeometry(60, 60);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x090d16,
      roughness: 0.3,
      metalness: 0.7,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    // Floor Grid
    const grid = new THREE.GridHelper(60, 60, 0x38bdf8, 0x1e293b);
    grid.position.y = 0.01;
    this.scene.add(grid);

    // Front Wall directly at player eye level
    const wallGeo = new THREE.PlaneGeometry(50, 25);
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.5,
      metalness: 0.5,
    });
    const wall = new THREE.Mesh(wallGeo, wallMat);
    wall.position.set(0, 10, -16);
    wall.receiveShadow = true;
    this.scene.add(wall);

    // Grid on target wall
    const wallGrid = new THREE.GridHelper(50, 25, 0x2563eb, 0x1e293b);
    wallGrid.position.set(0, 10, -15.95);
    wallGrid.rotation.x = Math.PI / 2;
    this.scene.add(wallGrid);

    // Side Pillars
    for (let i = -2; i <= 2; i++) {
      if (i === 0) continue;
      const pillarGeo = new THREE.BoxGeometry(0.8, 25, 0.8);
      const pillarMat = new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        emissive: 0x0284c7,
        emissiveIntensity: 0.25,
      });
      const pillar = new THREE.Mesh(pillarGeo, pillarMat);
      pillar.position.set(i * 10, 10, -15);
      this.scene.add(pillar);
    }
  }

  handleResize() {
    if (!this.container || !this.renderer || !this.camera) return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  clearTargets() {
    this.targets.forEach((t) => {
      this.scene.remove(t.mesh);
      if (t.mesh.geometry) t.mesh.geometry.dispose();
      if (t.mesh.material) {
        if (Array.isArray(t.mesh.material)) t.mesh.material.forEach((m) => m.dispose());
        else t.mesh.material.dispose();
      }
    });
    this.targets = [];
  }

  createSphereTarget(x, y, z, baseRadius = 0.55, isGold = false) {
    const group = new THREE.Group();
    group.position.set(x, y, z);

    const radius = baseRadius * (this.targetConfig.sizeScale || 1.0);
    const colorHex = isGold ? 0xf59e0b : parseInt(this.targetConfig.primaryColor.replace('#', '0x'), 16);
    const coreHex = parseInt(this.targetConfig.coreColor.replace('#', '0x'), 16);
    const glow = this.targetConfig.glowIntensity || 0.8;

    // Target Outer Geometry based on selected Shape
    let mainGeo;
    if (this.targetConfig.shape === 'cube') {
      mainGeo = new THREE.BoxGeometry(radius * 1.5, radius * 1.5, radius * 1.5);
    } else if (this.targetConfig.shape === 'octahedron') {
      mainGeo = new THREE.OctahedronGeometry(radius * 1.15);
    } else {
      mainGeo = new THREE.SphereGeometry(radius, 32, 32);
    }

    const sphereMat = new THREE.MeshStandardMaterial({
      color: colorHex,
      emissive: colorHex,
      emissiveIntensity: glow * 0.7,
      roughness: 0.2,
      metalness: 0.6,
    });
    const mainMesh = new THREE.Mesh(mainGeo, sphereMat);
    mainMesh.castShadow = true;
    group.add(mainMesh);

    // Bullseye / Headshot core
    const coreGeo = new THREE.SphereGeometry(radius * 0.38, 24, 24);
    const coreMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: coreHex,
      emissiveIntensity: 1.0,
      roughness: 0.1,
    });
    const core = new THREE.Mesh(coreGeo, coreMat);
    core.position.z = radius * 0.55;
    group.add(core);

    // Glowing outer ring
    const ringGeo = new THREE.RingGeometry(radius * 1.05, radius * 1.15, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: isGold ? 0xfbbf24 : colorHex,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    group.add(ring);

    this.scene.add(group);

    const targetObj = {
      id: Math.random().toString(36).substr(2, 9),
      mesh: group,
      radius,
      spawnTime: performance.now(),
      isMoving: false,
      vel: new THREE.Vector3(0, 0, 0),
      isGold,
    };

    this.targets.push(targetObj);
    return targetObj;
  }

  spawnGridshotTargets() {
    this.clearTargets();
    for (let i = 0; i < 3; i++) {
      this.spawnRandomGridTarget();
    }
  }

  spawnRandomGridTarget() {
    const spread = this.targetConfig.spreadScale || 1.2;
    const baseRadius = 0.5 + Math.random() * 0.2;
    const actualRadius = baseRadius * (this.targetConfig.sizeScale || 1.0);
    const isGold = Math.random() < 0.2;

    // Minimum distance: User configured minSeparation PLUS target diameters to guarantee ZERO overlap
    // Even at minimum, distance between centers must exceed (r1 + r2) * 1.35
    const configuredMinDist = Math.max(1.8, (this.targetConfig.minSeparation || 2.2) * spread);

    let bestX = 0;
    let bestY = 3.0;
    let bestZ = -13;
    let foundValid = false;

    // Try up to 40 candidate positions to find one that guarantees >= min separation from all existing targets
    for (let attempt = 0; attempt < 40; attempt++) {
      const candidateX = (Math.random() - 0.5) * 14 * spread;
      const candidateY = 1.6 + Math.random() * 3.4 * Math.min(1.4, spread);
      const candidateZ = -13 + (Math.random() - 0.5) * 2;

      let tooClose = false;
      for (const t of this.targets) {
        const dx = candidateX - t.mesh.position.x;
        const dy = candidateY - t.mesh.position.y;
        const dz = candidateZ - t.mesh.position.z;
        const dist = Math.hypot(dx, dy, dz);

        const targetRadius = t.radius || actualRadius;
        // Zero overlap constraint: dist must exceed sum of radii by at least 0.8m
        const strictMin = (actualRadius + targetRadius) * 1.5;
        const effectiveLimit = Math.max(strictMin, configuredMinDist);

        if (dist < effectiveLimit) {
          tooClose = true;
          break;
        }
      }

      if (!tooClose) {
        bestX = candidateX;
        bestY = candidateY;
        bestZ = candidateZ;
        foundValid = true;
        break;
      }
    }

    // Fallback: If arena is crowded, pick position furthest from existing targets
    if (!foundValid && this.targets.length > 0) {
      let maxDist = -1;
      for (let attempt = 0; attempt < 20; attempt++) {
        const candidateX = (Math.random() - 0.5) * 16 * spread;
        const candidateY = 1.5 + Math.random() * 3.6;
        const candidateZ = -13;

        let minDistToAny = 999;
        for (const t of this.targets) {
          const d = Math.hypot(candidateX - t.mesh.position.x, candidateY - t.mesh.position.y);
          if (d < minDistToAny) minDistToAny = d;
        }

        if (minDistToAny > maxDist) {
          maxDist = minDistToAny;
          bestX = candidateX;
          bestY = candidateY;
          bestZ = candidateZ;
        }
      }
    }

    const target = this.createSphereTarget(bestX, bestY, bestZ, baseRadius, isGold);
    sound.playSpawn();
    return target;
  }

  spawnTrackingTarget() {
    this.clearTargets();
    const radius = 0.60 * (this.targetConfig.sizeScale || 1.0);
    const t = this.createSphereTarget(0, 3.0, -12.5, radius, true);
    t.isMoving = true;
    
    // Configurable velocity based on targetConfig.trackingSpeed
    const speed = this.targetConfig.trackingSpeed || 4.5;
    const angle = Math.random() * Math.PI * 2;
    t.currentSpeed = speed;
    t.targetVel = new THREE.Vector3(
      Math.cos(angle) * speed,
      Math.sin(angle) * speed * 0.75,
      (Math.random() - 0.5) * 1.5
    );
    t.vel = t.targetVel.clone();
    t.nextDirChange = performance.now() + 800 + Math.random() * 1200;
    t.trackingHp = 100;
    return t;
  }

  spawnSpiderShotTarget() {
    this.clearTargets();
    // Center anchor at eye height
    this.createSphereTarget(0, 3.0, -13, 0.45, true);
    // Peripheral target
    const angle = Math.random() * Math.PI * 2;
    const dist = 3.0 + Math.random() * 4.5;
    const x = Math.cos(angle) * dist;
    const y = Math.max(1.5, Math.min(5.0, 3.0 + Math.sin(angle) * dist * 0.6));
    this.createSphereTarget(x, y, -13, 0.35 + Math.random() * 0.2);
  }

  startSession(mode = 'gridshot', duration = 45) {
    this.mode = mode;
    this.duration = duration;
    this.timeLeft = duration;
    this.score = 0;
    this.shotsFired = 0;
    this.shotsHit = 0;
    this.headshots = 0;
    this.reactionTimes = [];
    this.currentStreak = 0;
    this.highestStreak = 0;
    this.isRunning = true;
    this.yaw = 0;
    this.pitch = 0;
    this.camera.position.set(0, 3.0, 0);
    this.camera.rotation.set(0, 0, 0);

    if (mode === 'gridshot') {
      this.spawnGridshotTargets();
    } else if (mode === 'tracking') {
      this.spawnTrackingTarget();
    } else if (mode === 'spidershot') {
      this.spawnSpiderShotTarget();
    } else {
      this.spawnGridshotTargets();
    }

    if (this.onStatsUpdate) this.onStatsUpdate(this.getStatsSnapshot());
  }

  stopSession() {
    this.isRunning = false;
    sound.playFinish();
    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.6 },
    });
    if (this.onSessionFinish) {
      this.onSessionFinish(this.getStatsSnapshot());
    }
  }

  getStatsSnapshot() {
    const accuracy = this.shotsFired > 0 ? ((this.shotsHit / this.shotsFired) * 100).toFixed(1) : '100.0';
    const avgReaction = this.reactionTimes.length > 0
      ? (this.reactionTimes.reduce((a, b) => a + b, 0) / this.reactionTimes.length).toFixed(0)
      : '0';
    return {
      score: this.score,
      timeLeft: Math.max(0, Math.ceil(this.timeLeft)),
      shotsFired: this.shotsFired,
      shotsHit: this.shotsHit,
      headshots: this.headshots,
      accuracy,
      avgReaction,
      streak: this.currentStreak,
      highestStreak: this.highestStreak,
      mode: this.mode,
      isRunning: this.isRunning,
    };
  }

  shoot() {
    const now = performance.now();
    if (now - this.lastShotTime < this.fireRateCooldown) return;
    this.lastShotTime = now;

    const padState = this.gamepadEngine.poll();
    const isADS = padState.isADS;
    this.shotsFired++;
    sound.playShot(isADS);
    this.gamepadEngine.playVibration(60, 0.4, 0.2);

    // Cast ray straight from center of crosshair
    this.raycaster.setFromCamera(this.reticleRay, this.camera);
    
    let hitTarget = null;
    let isCoreHit = false;

    for (let t of this.targets) {
      const intersects = this.raycaster.intersectObjects(t.mesh.children, true);
      if (intersects.length > 0) {
        hitTarget = t;
        if (intersects[0].object === t.mesh.children[1]) {
          isCoreHit = true;
        }
        break;
      }
    }

    if (hitTarget) {
      this.shotsHit++;
      this.currentStreak++;
      if (this.currentStreak > this.highestStreak) {
        this.highestStreak = this.currentStreak;
      }

      const reactionTime = now - hitTarget.spawnTime;
      this.reactionTimes.push(reactionTime);

      let pts = isCoreHit ? 150 : 100;
      if (hitTarget.isGold) pts *= 1.5;
      this.score += Math.round(pts);

      if (isCoreHit) this.headshots++;

      sound.playHit(isCoreHit);
      this.triggerHitReticleEffect(isCoreHit);
      this.triggerImpactParticle(hitTarget.mesh.position, isCoreHit ? 0xf43f5e : 0x38bdf8);

      if (this.mode === 'gridshot') {
        this.removeTarget(hitTarget);
        this.spawnRandomGridTarget();
      } else if (this.mode === 'spidershot') {
        this.removeTarget(hitTarget);
        if (this.targets.length === 0) {
          this.spawnSpiderShotTarget();
        }
      } else if (this.mode === 'free_calibrate') {
        this.removeTarget(hitTarget);
        this.spawnRandomGridTarget();
      }
      if (this.onShotAttempt) {
        this.onShotAttempt({
          hit: true,
          isHeadshot: isCoreHit,
          reactionTime,
          targetPosition: hitTarget.mesh.position.clone(),
        });
      }

      if (this.onTargetHit) {
        this.onTargetHit({
          target: hitTarget,
          isHeadshot: isCoreHit,
          reactionTime,
          stats: this.getStatsSnapshot(),
        });
      }
    } else {
      this.currentStreak = 0;
      sound.playMiss();

      if (this.onShotAttempt) {
        this.onShotAttempt({
          hit: false,
          isHeadshot: false,
          reactionTime: 0,
          targetPosition: null,
        });
      }
    }

    if (this.onStatsUpdate) this.onStatsUpdate(this.getStatsSnapshot());
  }

  removeTarget(targetObj) {
    this.scene.remove(targetObj.mesh);
    this.targets = this.targets.filter((t) => t.id !== targetObj.id);
  }

  triggerImpactParticle(pos, colorHex) {
    const particleCount = 12;
    const pGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const velocities = [];

    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = pos.x;
      positions[i * 3 + 1] = pos.y;
      positions[i * 3 + 2] = pos.z;
      velocities.push(
        (Math.random() - 0.5) * 4,
        (Math.random() - 0.5) * 4 + 1.5,
        (Math.random() - 0.5) * 4
      );
    }

    pGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const pMat = new THREE.PointsMaterial({
      color: colorHex,
      size: 0.18,
      transparent: true,
      opacity: 1,
    });
    const pMesh = new THREE.Points(pGeo, pMat);
    this.scene.add(pMesh);

    let start = performance.now();
    const animateParticles = () => {
      const elapsed = (performance.now() - start) / 1000;
      if (elapsed > 0.35) {
        this.scene.remove(pMesh);
        pGeo.dispose();
        pMat.dispose();
        return;
      }
      const posAttr = pGeo.attributes.position;
      for (let i = 0; i < particleCount; i++) {
        posAttr.array[i * 3] += velocities[i * 3] * 0.016;
        posAttr.array[i * 3 + 1] += velocities[i * 3 + 1] * 0.016;
        posAttr.array[i * 3 + 2] += velocities[i * 3 + 2] * 0.016;
      }
      posAttr.needsUpdate = true;
      pMat.opacity = 1 - elapsed / 0.35;
      requestAnimationFrame(animateParticles);
    };
    animateParticles();
  }

  triggerHitReticleEffect(isHeadshot) {
    const el = document.getElementById('hit-marker');
    if (el) {
      el.classList.remove('hidden', 'hit-marker');
      void el.offsetWidth;
      el.classList.add('hit-marker');
      el.style.borderColor = isHeadshot ? '#f43f5e' : '#38bdf8';
    }
  }

  update(deltaSec) {
    const poll = this.gamepadEngine.poll();

    // Look rotation using processed stick input
    const aim = poll.aimOutput;
    if (aim && poll.connected) {
      const turnRate = 2.4;
      this.yaw -= aim.x * turnRate * deltaSec;
      this.pitch -= aim.y * turnRate * deltaSec;

      const pitchLimit = THREE.MathUtils.degToRad(85);
      this.pitch = Math.max(-pitchLimit, Math.min(pitchLimit, this.pitch));

      this.camera.rotation.set(this.pitch, this.yaw, 0);
    }

    // ADS Zoom effect
    const targetFOV = poll.isADS ? 54 : 80;
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFOV, 0.2);
    this.camera.updateProjectionMatrix();

    // Semi-automatic trigger (tap to shoot or hold)
    if (poll.isShoot) {
      if (!this.lastShootPressed) {
        this.shoot();
      }
      this.lastShootPressed = true;
    } else {
      this.lastShootPressed = false;
    }

    // Tracking mode tick (Dynamic Random Direction Object Follower)
    if (this.mode === 'tracking' && this.isRunning) {
      this.raycaster.setFromCamera(this.reticleRay, this.camera);
      const now = performance.now();
      const currentSpeed = this.targetConfig.trackingSpeed || 4.5;
      const agility = this.targetConfig.trackingAgility || 1.8;

      for (let t of this.targets) {
        if (t.isMoving) {
          // Dynamic periodic random directional shift
          if (!t.nextDirChange || now > t.nextDirChange) {
            const angle = Math.random() * Math.PI * 2;
            const elevation = (Math.random() - 0.5) * 1.2;
            t.targetVel = new THREE.Vector3(
              Math.cos(angle) * currentSpeed,
              Math.sin(angle) * currentSpeed * 0.7 + elevation,
              (Math.random() - 0.5) * (currentSpeed * 0.25)
            );
            // Change direction randomly every 0.6s to 1.8s modulated by agility
            const intervalMs = (1000 / agility) * (0.6 + Math.random() * 0.8);
            t.nextDirChange = now + intervalMs;
          }

          // Smooth interpolation towards new target direction (natural physics inertia)
          t.vel.lerp(t.targetVel, Math.min(1.0, deltaSec * agility * 2.8));

          // Apply position translation
          t.mesh.position.x += t.vel.x * deltaSec;
          t.mesh.position.y += t.vel.y * deltaSec;
          t.mesh.position.z += t.vel.z * deltaSec;

          // Smooth boundary bounce & containment
          const boundX = 6.8;
          const boundYMax = 5.2;
          const boundYMin = 1.3;
          const boundZMin = -14.5;
          const boundZMax = -10.5;

          if (t.mesh.position.x > boundX) {
            t.mesh.position.x = boundX;
            t.vel.x = -Math.abs(t.vel.x);
            t.targetVel.x = -Math.abs(t.targetVel.x);
          } else if (t.mesh.position.x < -boundX) {
            t.mesh.position.x = -boundX;
            t.vel.x = Math.abs(t.vel.x);
            t.targetVel.x = Math.abs(t.targetVel.x);
          }

          if (t.mesh.position.y > boundYMax) {
            t.mesh.position.y = boundYMax;
            t.vel.y = -Math.abs(t.vel.y);
            t.targetVel.y = -Math.abs(t.targetVel.y);
          } else if (t.mesh.position.y < boundYMin) {
            t.mesh.position.y = boundYMin;
            t.vel.y = Math.abs(t.vel.y);
            t.targetVel.y = Math.abs(t.targetVel.y);
          }

          if (t.mesh.position.z > boundZMax) {
            t.mesh.position.z = boundZMax;
            t.vel.z = -Math.abs(t.vel.z);
            t.targetVel.z = -Math.abs(t.targetVel.z);
          } else if (t.mesh.position.z < boundZMin) {
            t.mesh.position.z = boundZMin;
            t.vel.z = Math.abs(t.vel.z);
            t.targetVel.z = Math.abs(t.targetVel.z);
          }

          // Raycast intersection test: player reticle following the target
          const intersects = this.raycaster.intersectObjects(t.mesh.children, true);
          if (intersects.length > 0) {
            this.score += Math.round(20 * deltaSec * 60);
            this.shotsHit += Math.round(1 * deltaSec * 30);
            this.shotsFired += Math.round(1 * deltaSec * 30);
            t.mesh.children[0].material.emissiveIntensity = 1.3;
            // Visual lock indication ring pulse
            if (t.mesh.children[2]) {
              t.mesh.children[2].rotation.z += deltaSec * 8;
            }
          } else {
            t.mesh.children[0].material.emissiveIntensity = 0.45;
            this.shotsFired += Math.round(0.4 * deltaSec * 30);
          }
        }
      }
    }

    // Gentle float
    const time = performance.now() * 0.002;
    this.targets.forEach((t, idx) => {
      if (!t.isMoving) {
        t.mesh.position.y += Math.sin(time + idx) * 0.001;
      }
    });

    // Countdown
    if (this.isRunning && this.mode !== 'free_calibrate') {
      this.timeLeft -= deltaSec;
      if (this.timeLeft <= 0) {
        this.timeLeft = 0;
        this.stopSession();
      }
      if (this.onStatsUpdate) {
        this.onStatsUpdate(this.getStatsSnapshot());
      }
    }

    this.renderer.render(this.scene, this.camera);
  }

  saveTargetConfig() {
    try {
      localStorage.setItem('aimlab_target_config', JSON.stringify(this.targetConfig));
    } catch (e) {
      console.warn('Could not save targetConfig to localStorage:', e);
    }
  }

  loadTargetConfig() {
    try {
      const saved = localStorage.getItem('aimlab_target_config');
      if (saved) {
        const parsed = JSON.parse(saved);
        this.targetConfig = { ...this.targetConfig, ...parsed };
      }
    } catch (e) {
      console.warn('Could not load targetConfig from localStorage:', e);
    }
  }
}

