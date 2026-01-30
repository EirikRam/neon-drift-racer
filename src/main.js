import { isDown, wasPressed, endFrame } from "./input.js";
import { createVec2, clamp, lerp } from "./math.js";
import { ParticlePool } from "./particles.js";
import { track, getSkylineKeyForDistrictId } from "./track.js";
import { loadAssets } from "./assets.js";
import { generateProps, generateLandmarks } from "./props.js";
import {
  renderHUD,
  renderHelpOverlay,
  drawCenterOverlay,
  drawFinishPanel,
  renderNotifications,
} from "./ui.js";
import { generateBoostPads, updateBoostPads } from "./boostpads.js";
import { createScoreState, resetRun, updateScore, registerNearMiss, SCORE } from "./score.js";
import { drawCarSprite, CAR_RENDER_SIZE } from "./carRender.js";
import { createTrafficSystem } from "./traffic.js";
import { drawSkylineLayer, drawSkylineFallback } from "./skyline.js";

const VERSION = "v0.2.0";
const FIXED_TIME_STEP = 1000 / 60;
const MAX_FRAME_TIME = 250;

const PHYSICS = {
  engineAccel: 620,
  reverseAccel: 420,
  brakeDecel: 760,
  maxSpeedForward: 520,
  maxSpeedReverse: 260,
  steerRateMin: 3.4,
  steerRateMax: 1.7,
  lateralDampGrip: 9,
  lateralDampDrift: 3.2,
  forwardDrag: 1.2,
  minDriftSpeed: 80,
  driftThreshold: Math.PI / 8,
  offRoadDrag: 3,
  offRoadSteerScale: 0.82,
};

const PARTICLES = {
  maxCount: 520,
  trailSpeedThreshold: 60,
  trailRateBase: 6,
  trailRateSpeed: 0.05,
  trailRateDrift: 18,
  trailHandbrakeBoost: 1.5,
  trailLife: 1.6,
  trailSize: 6,
  trailAlpha: 0.55,
  trailRearOffset: 20,
  sparkRateBase: 30,
  sparkRateDrift: 45,
  sparkLife: 0.25,
  sparkSize: 3,
  sparkAlpha: 0.9,
  sparkSpeed: 220,
  sparkRearOffset: 18,
  sparkMinSpeed: 120,
};

const COLLISION = {
  bounceScale: 1.8,
  velocityDamping: 0.85,
  minCorrection: 0.8,
  impactScale: 0.002,
  shakeScale: 6,
  flashScale: 0.7,
};

const TRAFFIC = {
  nearMissMinSpeed: 120,
  nearMissRadius: CAR_RENDER_SIZE * 1.25,
  collisionRadius: CAR_RENDER_SIZE * 0.38,
  impactCooldown: 0.35,
  positionCorrection: 0.6,
  velocityDamping: 0.82,
  sparkCooldown: 0.25,
};

const BULLY = {
  impulseScale: 0.9,
  npcBoost: 1.4,
  playerDamp: 0.25,
  knockbackHold: 0.35,
  knockbackSpeedHold: 0.45,
  maxNpcKnockSpeed: 520,
  impactFxCooldown: 0.25,
  impactFxMinSpeed: 220,
  impactFxMinPenetration: 6,
};

const BOOST = {
  accelMultiplier: 1.4,
  maxSpeedMultiplier: 1.35,
  trailMultiplier: 1.6,
  triggerTrailBurst: 6,
  impulse: 420,
  flashDuration: 0.35,
  driftBonus: 120,
  strengthCap: 1.2,
  dragReduction: 0.75,
};

const BOOST_PAD_TS = [
  0.06,
  0.12,
  0.2,
  0.28,
  0.36,
  0.44,
  0.58,
  0.62,
  0.7,
  0.78,
  0.86,
  0.93,
];

const RACE_PHASE = {
  PRE_RACE: "PRE_RACE",
  COUNTDOWN: "COUNTDOWN",
  GO_FLASH: "GO_FLASH",
  RACING: "RACING",
  FINISHED: "FINISHED",
};

const RACE_TIMING = {
  autoStartDelay: 0.5,
  countdownStep: 1.0,
  goFlashDuration: 0.6,
  finishSplashDuration: 1.5,
};

const CHECKPOINTS = {
  flashDuration: 0.6,
};

const CHECKPOINT_TS_PER_LAP = [0.2, 0.4, 0.6, 0.8, 0.95];

const PROGRESS_TRACKING = {
  windowSegments: 120,
  predictedClamp: 0.03,
  clampScale: 1.8,
};

const STORAGE_KEYS = {
  bestScore: "ndr_bestScore",
  bestTime: "ndr_bestTime",
};

const LAPS_TOTAL = 5;
const FINISH_MIN_FORWARD = 40;

const app = document.getElementById("app");
const canvas = document.createElement("canvas");
const context = canvas.getContext("2d");

app.appendChild(canvas);

let assets = null;
let asphaltPattern = null;
const ROAD_PATTERN_SCALE = 0.6;
let asphaltPatternScale = ROAD_PATTERN_SCALE;
let props = [];
let landmarks = [];
let boostPads = [];
const scoreState = createScoreState();
let useSprite = true;
const settings = {
  showSkyline: true,
  showNeonProps: true,
  showLaneMarkings: true,
  showParticles: true,
  showGlow: true,
  showMotionBlur: true,
  showTrackDebug: false,
  showPropDebug: false,
  showCollisions: true,
  showTraffic: true,
  showNearMissDebug: false,
  enableBully: true,
  showHelp: false,
  compactDebugPanel: false,
};

const impactState = {
  shakeIntensity: 0,
  shakeTime: 0,
  flashAlpha: 0,
};

const particlePool = new ParticlePool(PARTICLES.maxCount);
const particleState = {
  trailAccumulator: 0,
  sparkAccumulator: 0,
  trailRate: 0,
};

const trafficState = {
  system: null,
  impactCooldown: 0,
  sparkCooldown: 0,
  carSprites: [],
  renderStats: null,
};

const bestRunState = {
  bestScore: 0,
  bestTime: null,
  newBestScore: false,
  newBestTime: false,
};

const skylineState = {
  currentKey: null,
  nextKey: null,
  fadeAlpha: 1,
  fadeSpeed: 1.2,
};

const SKYLINE_LAYERS = {
  far: {
    parallaxFactor: 0.12,
    alpha: 0.38,
    hazeStrength: 0.45,
    yOffset: 0.16,
    scale: 1,
  },
  near: {
    parallaxFactor: 0.24,
    alpha: 0.78,
    hazeStrength: 0.15,
    yOffset: 0.2,
    scale: 1,
  },
};

const state = {
  width: 0,
  height: 0,
  accumulator: 0,
  lastTime: performance.now(),
  fps: 0,
  fpsFrameCount: 0,
  fpsLastTime: performance.now(),
  padsDrawnThisFrame: 0,
};

const car = {
  position: createVec2(0, 0),
  prevPosition: createVec2(0, 0),
  vel: createVec2(0, 0),
  prevVel: createVec2(0, 0),
  heading: 0,
  prevHeading: 0,
  throttleInput: 0,
  steerInput: 0,
  handbrake: false,
  driftAngle: 0,
  driftActive: false,
  speed: 0,
  velAngle: 0,
  onRoad: true,
  boostActive: false,
  boostTimer: 0,
  boostStrength: 1,
  boostDuration: 0,
  boostImpulseLast: null,
  mass: 1,
  radius: TRAFFIC.collisionRadius,
};

const camera = {
  position: createVec2(0, 0),
  prevPosition: createVec2(0, 0),
};

const raceState = {
  phase: RACE_PHASE.PRE_RACE,
  raceArmed: false,
  raceFinished: false,
  lastProgress: null,
  prevProgressT: null,
  lastProgressTime: null,
  predictedProgressT: null,
  chosenProgressT: null,
  rawProgressDelta: null,
  clampedProgressDelta: null,
  plausibleProgressDelta: null,
  branchSnapPrevented: false,
  lapProgressUnwrapped: 0,
  prevLapProgress: 0,
  prevGateD: null,
  gateD: null,
  gateCrossed: false,
  countdownStartTime: null,
  goStartTime: null,
  finishStartTime: null,
  runStartTime: null,
  runElapsed: 0,
  checkpoints: [],
  currentCheckpointIndex: 0,
  splitTimes: [],
  lastSplitDelta: null,
  checkpointFlashTime: null,
  checkpointFlashText: null,
  boostFlashTime: null,
  boostFlashText: null,
  lastBoostPadIndex: null,
  lastBoostTime: null,
  lastBoostImpulse: null,
  lastBoostSpeedDelta: null,
  boostUpdateCalls: 0,
  boostUpdateThisFrame: false,
  boostDebug: null,
  lastBoostTriggerTime: null,
  lastBoostTriggerIndex: null,
  lastBoostTriggerAttempt: null,
  manualBoostCount: 0,
  boostAppliedThisFrame: false,
  finishDebug: null,
  notifications: [],
  finishCrossCount: 0,
  perLapBase: 0,
  finishGateCooldown: 0,
  bestSplitIndex: null,
};

function resizeCanvas() {
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  state.width = window.innerWidth;
  state.height = window.innerHeight;

  canvas.width = Math.floor(state.width * dpr);
  canvas.height = Math.floor(state.height * dpr);
  canvas.style.width = `${state.width}px`;
  canvas.style.height = `${state.height}px`;

  context.setTransform(dpr, 0, 0, dpr, 0, 0);
}

window.addEventListener("resize", resizeCanvas);
resizeCanvas();

bestRunState.bestScore = loadStoredBestScore();
bestRunState.bestTime = loadStoredBestTime();

function updateFixed() {
  const dt = FIXED_TIME_STEP / 1000;
  const now = performance.now();
  raceState.boostUpdateThisFrame = false;
  raceState.boostAppliedThisFrame = false;
  if (raceState.notifications.length) {
    raceState.notifications = raceState.notifications.filter((note) => now <= note.expiresAt);
  }

  car.prevPosition.x = car.position.x;
  car.prevPosition.y = car.position.y;
  car.prevVel.x = car.vel.x;
  car.prevVel.y = car.vel.y;
  car.prevHeading = car.heading;

  camera.prevPosition.x = camera.position.x;
  camera.prevPosition.y = camera.position.y;

  if (wasPressed("KeyR")) {
    resetToStart();
  }

  if (wasPressed("KeyC")) {
    useSprite = !useSprite;
  }

  if (wasPressed("KeyP")) {
    settings.showParticles = !settings.showParticles;
  }

  if (wasPressed("KeyG")) {
    settings.showGlow = !settings.showGlow;
  }

  if (wasPressed("KeyM")) {
    settings.showMotionBlur = !settings.showMotionBlur;
  }

  if (wasPressed("KeyT")) {
    settings.showTrackDebug = !settings.showTrackDebug;
  }

  if (wasPressed("KeyH")) {
    settings.showSkyline = !settings.showSkyline;
  }

  if (wasPressed("KeyN")) {
    settings.showNeonProps = !settings.showNeonProps;
  }

  if (wasPressed("KeyL")) {
    settings.showLaneMarkings = !settings.showLaneMarkings;
  }

  if (wasPressed("KeyK")) {
    settings.showPropDebug = !settings.showPropDebug;
  }

  if (wasPressed("KeyJ")) {
    settings.showCollisions = !settings.showCollisions;
  }

  if (wasPressed("KeyY")) {
    settings.showTraffic = !settings.showTraffic;
  }

  if (wasPressed("KeyU")) {
    settings.showNearMissDebug = !settings.showNearMissDebug;
  }

  if (wasPressed("KeyI")) {
    settings.enableBully = !settings.enableBully;
  }

  if (wasPressed("F3")) {
    settings.compactDebugPanel = !settings.compactDebugPanel;
  }

  if (wasPressed("F4") && raceState.phase === RACE_PHASE.RACING) {
    const forwardDir = {
      x: Math.cos(car.heading),
      y: Math.sin(car.heading),
    };
    const preSpeed = Math.hypot(car.vel.x, car.vel.y);
    car.vel.x += forwardDir.x * BOOST.impulse;
    car.vel.y += forwardDir.y * BOOST.impulse;
    const maxBoostSpeed = PHYSICS.maxSpeedForward * BOOST.maxSpeedMultiplier;
    const speed = Math.hypot(car.vel.x, car.vel.y);
    if (speed > maxBoostSpeed) {
      const scale = maxBoostSpeed / speed;
      car.vel.x *= scale;
      car.vel.y *= scale;
    }
    const postSpeed = Math.hypot(car.vel.x, car.vel.y);
    car.boostActive = true;
    car.boostTimer = Math.max(car.boostTimer, 0.95);
    car.boostDuration = Math.max(car.boostDuration, 0.95);
    raceState.boostFlashTime = now;
    raceState.boostFlashText = "MANUAL BOOST";
    raceState.lastBoostPadIndex = -1;
    raceState.lastBoostTime = now;
    raceState.lastBoostImpulse = BOOST.impulse;
    raceState.lastBoostSpeedDelta = postSpeed - preSpeed;
    raceState.lastBoostTriggerTime = now;
    raceState.lastBoostTriggerIndex = -1;
    raceState.manualBoostCount += 1;
    raceState.boostAppliedThisFrame = true;
    queueNotification("MANUAL BOOST", "boost", now, 0.6);
  }

  if (wasPressed("F1") || (wasPressed("Slash") && isDown("Shift"))) {
    settings.showHelp = !settings.showHelp;
  }

  updateRacePhase(now);
  updateBoostState(dt);
  updateCarPhysics(dt, raceState.phase !== RACE_PHASE.RACING);
  updateSkylineState(dt);
  updateTraffic(dt);
  const impact = resolveTrackCollision();
  resolveTrafficInteractions(dt);
  updateImpactState(dt, impact);
  if (raceState.finishGateCooldown > 0) {
    raceState.finishGateCooldown = Math.max(0, raceState.finishGateCooldown - dt);
  }
  const prevLapProgressForBoost = raceState.lapProgressUnwrapped;
  updateRaceProgress(now);
  if (boostPads && boostPads._id === undefined) {
    boostPads._id = Math.random().toString(36).slice(2);
  }
  const boostEvents =
    updateBoostPads(
      car,
      boostPads,
      dt,
      raceState.phase,
      raceState.lapProgressUnwrapped,
      prevLapProgressForBoost,
      {
        duration: 0.95,
        cooldown: 2.0,
        impulse: BOOST.impulse,
      },
    ) || [];
  raceState.boostUpdateCalls += 1;
  raceState.boostUpdateThisFrame = true;
  raceState.boostDebug = boostPads?._debug ?? null;
  if (boostEvents.length) {
    for (const boostEvent of boostEvents) {
      const pad = boostEvent.pad;
      const preSpeed = Math.hypot(car.vel.x, car.vel.y);
      car.vel.x += pad.tangent.x * BOOST.impulse;
      car.vel.y += pad.tangent.y * BOOST.impulse;
      const maxBoostSpeed = PHYSICS.maxSpeedForward * BOOST.maxSpeedMultiplier;
      const speed = Math.hypot(car.vel.x, car.vel.y);
      if (speed > maxBoostSpeed) {
        const scale = maxBoostSpeed / speed;
        car.vel.x *= scale;
        car.vel.y *= scale;
      }
      const postSpeed = Math.hypot(car.vel.x, car.vel.y);
      car.boostActive = true;
      car.boostTimer = Math.max(car.boostTimer, pad.duration);
      car.boostDuration = Math.max(car.boostDuration, pad.duration);
      car.boostStrength = Math.min(
        BOOST.strengthCap,
        Math.max(car.boostStrength, pad.strength),
      );
      raceState.boostFlashTime = now;
      if (car.driftActive && raceState.phase === RACE_PHASE.RACING) {
        raceState.boostFlashText = "DRIFT BOOST!";
        scoreState.score += BOOST.driftBonus * scoreState.multiplier;
        scoreState.runScore = scoreState.score;
        scoreState.comboTimer = Math.max(scoreState.comboTimer, 0.4);
      } else {
        raceState.boostFlashText = "BOOST!";
      }
      raceState.lastBoostPadIndex = boostEvent.index;
      raceState.lastBoostTime = now;
      raceState.lastBoostImpulse = BOOST.impulse;
      raceState.lastBoostSpeedDelta = postSpeed - preSpeed;
      raceState.lastBoostTriggerTime = now;
      raceState.lastBoostTriggerIndex = boostEvent.index;
      raceState.lastBoostTriggerAttempt = {
        index: boostEvent.index,
        dist: boostEvent.debug?.dist ?? null,
        time: now,
      };
      raceState.boostFlashText = `TRIGGERED PAD ${boostEvent.index + 1}`;
      raceState.boostAppliedThisFrame = true;
      queueNotification(raceState.boostFlashText, "boost", now, 0.6);
    }
  }
  updateParticles(dt, wasPressed("Space"), boostEvents.length > 0);
  if (impact && settings.showParticles) {
    spawnImpactSparks(impact);
  }
  if (raceState.phase === RACE_PHASE.RACING) {
    updateScore(
      scoreState,
      car,
      track,
      dt,
      car.boostActive,
      impact ? impact.strength : 0,
    );
  }
  const cameraFollow = 1 - Math.exp(-5 * dt);
  camera.position.x = lerp(camera.position.x, car.position.x, cameraFollow);
  camera.position.y = lerp(camera.position.y, car.position.y, cameraFollow);
  runDebugSafetyChecks();
}

function render(alpha) {
  state.padsDrawnThisFrame = 0;
  if (settings.showMotionBlur) {
    context.save();
    context.fillStyle = "rgba(5, 6, 11, 0.16)";
    context.fillRect(0, 0, state.width, state.height);
    context.restore();
  } else {
    context.clearRect(0, 0, state.width, state.height);
    context.save();
    context.fillStyle = "#05060b";
    context.fillRect(0, 0, state.width, state.height);
    context.restore();
  }

  const renderCarPos = {
    x: lerp(car.prevPosition.x, car.position.x, alpha),
    y: lerp(car.prevPosition.y, car.position.y, alpha),
  };
  const renderHeading = lerpAngle(car.prevHeading, car.heading, alpha);
  const renderCamera = {
    x: lerp(camera.prevPosition.x, camera.position.x, alpha),
    y: lerp(camera.prevPosition.y, camera.position.y, alpha),
  };
  const shakeOffset = getCameraShakeOffset();
  renderCamera.x += shakeOffset.x;
  renderCamera.y += shakeOffset.y;

  context.save();
  if (settings.showSkyline) {
    const currentImage = assets ? assets[skylineState.currentKey] : null;
    const nextImage = assets && skylineState.nextKey ? assets[skylineState.nextKey] : null;
    const fallbackImage = assets ? assets.skyMetro : null;
    const pixelScale = canvas.width / Math.max(1, state.width);
    drawSkylineFallback(context);
    const farImage = fallbackImage || currentImage;
    const nearImage = currentImage || fallbackImage;
    if (farImage) {
      drawSkylineLayer(context, renderCamera, farImage, {
        ...SKYLINE_LAYERS.far,
        pixelScale,
      });
    }
    if (nearImage) {
      const nearAlpha = SKYLINE_LAYERS.near.alpha;
      if (nextImage) {
        drawSkylineLayer(context, renderCamera, nearImage, {
          ...SKYLINE_LAYERS.near,
          alpha: nearAlpha * (1 - skylineState.fadeAlpha),
          pixelScale,
        });
        drawSkylineLayer(context, renderCamera, nextImage, {
          ...SKYLINE_LAYERS.near,
          alpha: nearAlpha * skylineState.fadeAlpha,
          pixelScale,
        });
      } else {
        drawSkylineLayer(context, renderCamera, nearImage, {
          ...SKYLINE_LAYERS.near,
          alpha: nearAlpha,
          pixelScale,
        });
      }
    }
  }
  context.translate(state.width / 2 - renderCamera.x, state.height / 2 - renderCamera.y);

  drawBackgroundGrid(renderCamera);
  drawTrack();
  drawBoostPads(boostPads, renderCarPos);
  if (settings.showTrackDebug) {
    drawBoostPadsScreenDebug(boostPads);
  }
  if (settings.showNeonProps) {
    drawProps(landmarks);
    drawProps(props);
  }
  drawTrafficCars();
  if (useSprite) {
    drawCarSprite(context, assets?.playerCar, renderCarPos, renderHeading, CAR_RENDER_SIZE);
  } else {
    drawCarPlaceholder(renderCarPos, renderHeading);
  }
  drawVelocityArrow(renderCarPos, {
    x: lerp(car.prevVel.x, car.vel.x, alpha),
    y: lerp(car.prevVel.y, car.vel.y, alpha),
  });
  if (settings.showPropDebug) {
    drawPropDebug(landmarks.concat(props));
  }

  if (settings.showGlow) {
    context.save();
    context.globalCompositeOperation = "lighter";
    if (settings.showParticles) {
      particlePool.render(context);
    }
    drawBoostPadGlow(boostPads);
    if (settings.showNeonProps) {
      drawPropGlow(landmarks);
      drawPropGlow(props);
    }
    context.restore();
  } else if (settings.showParticles) {
    particlePool.render(context);
  }

  if (settings.showTrackDebug) {
    drawTrackDebug(renderCarPos);
  }

  context.restore();

  if (impactState.flashAlpha > 0) {
    context.save();
    context.fillStyle = `rgba(255, 255, 255, ${impactState.flashAlpha.toFixed(3)})`;
    context.fillRect(0, 0, state.width, state.height);
    context.restore();
  }

  drawHud(renderCamera);
  renderNotifications(context, raceState.notifications, state.width);
  renderHelpOverlay(context, {
    showHelp: settings.showHelp,
    showSkyline: settings.showSkyline,
    showNeonProps: settings.showNeonProps,
    showLaneMarkings: settings.showLaneMarkings,
    showParticles: settings.showParticles,
    showGlow: settings.showGlow,
    showMotionBlur: settings.showMotionBlur,
    showTrackDebug: settings.showTrackDebug,
    showPropDebug: settings.showPropDebug,
    showCollisions: settings.showCollisions,
    showTraffic: settings.showTraffic,
    showNearMissDebug: settings.showNearMissDebug,
    showBully: settings.enableBully,
  });
  const overlayState = getOverlayState();
  if (overlayState) {
    drawCenterOverlay(context, overlayState);
  }
  if (raceState.phase === RACE_PHASE.FINISHED) {
    drawFinishPanel(context, {
      screenWidth: state.width,
      screenHeight: state.height,
      elapsed: raceState.runElapsed,
      score: scoreState.runScore,
      bestScore: bestRunState.bestScore,
      bestTime: bestRunState.bestTime,
      newBestScore: bestRunState.newBestScore,
      newBestTime: bestRunState.newBestTime,
      showPanel: shouldShowFinishPanel(),
      splitTimes: raceState.splitTimes,
      bestSplitIndex: raceState.bestSplitIndex,
    });
  }
}

function drawBackgroundGrid(cameraPos) {
  const spacing = 80;
  const lineColor = "rgba(0, 196, 255, 0.15)";
  const left = cameraPos.x - state.width / 2;
  const right = cameraPos.x + state.width / 2;
  const top = cameraPos.y - state.height / 2;
  const bottom = cameraPos.y + state.height / 2;

  const startX = Math.floor(left / spacing) * spacing;
  const startY = Math.floor(top / spacing) * spacing;

  context.save();
  context.strokeStyle = lineColor;
  context.lineWidth = 1;
  context.beginPath();

  for (let x = startX; x <= right; x += spacing) {
    context.moveTo(x, top);
    context.lineTo(x, bottom);
  }

  for (let y = startY; y <= bottom; y += spacing) {
    context.moveTo(left, y);
    context.lineTo(right, y);
  }

  context.stroke();
  context.restore();
}

function drawTrack() {
  const points = track.centerline;
  const boundaries = track.getBoundaries();
  const inner = boundaries.inner;
  const outer = boundaries.outer;

  context.save();
  context.lineJoin = "round";
  context.lineCap = "round";

  // Road underlay
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i += 1) {
    context.lineTo(points[i].x, points[i].y);
  }
  context.closePath();
  context.strokeStyle = "#0f141e";
  context.lineWidth = track.width * 2;
  context.stroke();

  // Asphalt pattern overlay
  context.strokeStyle = asphaltPattern || "#121722";
  context.lineWidth = track.width * 2;
  context.stroke();

  context.strokeStyle = "rgba(120, 140, 170, 0.35)";
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(outer[0].x, outer[0].y);
  for (let i = 1; i < outer.length; i += 1) {
    context.lineTo(outer[i].x, outer[i].y);
  }
  context.closePath();
  context.stroke();

  context.beginPath();
  context.moveTo(inner[0].x, inner[0].y);
  for (let i = 1; i < inner.length; i += 1) {
    context.lineTo(inner[i].x, inner[i].y);
  }
  context.closePath();
  context.stroke();

  if (settings.showLaneMarkings) {
    context.save();
    context.strokeStyle = "rgba(240, 250, 255, 0.35)";
    context.lineWidth = 2;
    context.setLineDash([18, 22]);
    context.lineDashOffset = 0;
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i += 1) {
      context.lineTo(points[i].x, points[i].y);
    }
    context.closePath();
    context.stroke();
    context.restore();
  }

  context.restore();
}

function drawCarPlaceholder(position, heading) {
  context.save();
  context.translate(position.x, position.y);
  context.rotate(heading);
  context.fillStyle = "rgba(255, 0, 128, 0.9)";
  context.shadowColor = "rgba(255, 0, 128, 0.5)";
  context.shadowBlur = 16;

  context.beginPath();
  context.moveTo(28, 0);
  context.lineTo(-20, -14);
  context.lineTo(-20, 14);
  context.closePath();
  context.fill();

  context.restore();
}

function updateTraffic(dt) {
  if (!settings.showTraffic || !trafficState.system) {
    return;
  }

  trafficState.system.update(dt);

  const debugMode = settings.showTrackDebug || settings.showPropDebug;
  if (!debugMode) {
    return;
  }

  for (const carEntity of trafficState.system.cars) {
    if (!Number.isFinite(carEntity.pos.x) || !Number.isFinite(carEntity.pos.y)) {
      const sample = track.getPointAtProgress(carEntity.progress);
      carEntity.pos.x = sample.point.x;
      carEntity.pos.y = sample.point.y;
      carEntity.vel.x = 0;
      carEntity.vel.y = 0;
    }
  }

}

function updateSkylineState(dt) {
  if (!settings.showSkyline) {
    return;
  }

  const progress = track.getProgressAlongTrack(car.position);
  const district = track.getDistrictAtProgress(progress);
  const desiredKey = getSkylineKeyForDistrictId(district?.id);

  if (!skylineState.currentKey) {
    skylineState.currentKey = desiredKey;
    skylineState.nextKey = null;
    skylineState.fadeAlpha = 1;
    return;
  }

  if (desiredKey !== skylineState.currentKey && skylineState.nextKey !== desiredKey) {
    skylineState.nextKey = desiredKey;
    skylineState.fadeAlpha = 0;
  }

  if (skylineState.nextKey) {
    skylineState.fadeAlpha = Math.min(
      1,
      skylineState.fadeAlpha + skylineState.fadeSpeed * dt,
    );
    if (skylineState.fadeAlpha >= 1) {
      skylineState.currentKey = skylineState.nextKey;
      skylineState.nextKey = null;
      skylineState.fadeAlpha = 1;
    }
  }
}

function runDebugSafetyChecks() {
  const debugMode = settings.showTrackDebug || settings.showPropDebug;
  if (!debugMode) {
    return;
  }

  if (!Number.isFinite(camera.position.x) || !Number.isFinite(camera.position.y)) {
    camera.position.x = car.position.x;
    camera.position.y = car.position.y;
  }
}

function resolveTrafficInteractions(dt) {
  if (!settings.showTraffic || !trafficState.system) {
    return;
  }

  trafficState.impactCooldown = Math.max(0, trafficState.impactCooldown - dt);
  trafficState.sparkCooldown = Math.max(0, trafficState.sparkCooldown - dt);

  const playerSpeed = car.speed;
  const minSpeed = TRAFFIC.nearMissMinSpeed;

  for (let i = 0; i < trafficState.system.cars.length; i += 1) {
    const npc = trafficState.system.cars[i];
    const dx = npc.pos.x - car.position.x;
    const dy = npc.pos.y - car.position.y;
    const distance = Math.hypot(dx, dy);
    const combinedRadius = car.radius + npc.radius;

    if (settings.enableBully) {
      const collision = resolvePlayerNpcCollision(car, npc, dt);
      if (collision) {
        if (
          trafficState.impactCooldown === 0 &&
          playerSpeed > BULLY.impactFxMinSpeed &&
          collision.penetration > BULLY.impactFxMinPenetration
        ) {
          trafficState.impactCooldown = BULLY.impactFxCooldown;
          impactState.shakeIntensity = Math.min(1, impactState.shakeIntensity + 0.25);
          impactState.flashAlpha = Math.min(0.7, impactState.flashAlpha + 0.2);
          if (settings.showParticles) {
            spawnImpactSparks({
              position: { x: npc.pos.x, y: npc.pos.y },
              normal: collision.normal,
              strength: Math.min(1, collision.penetration / (car.radius * 0.6)),
            });
          }
        }
        continue;
      }
    }

    if (
      playerSpeed > minSpeed &&
      distance < TRAFFIC.nearMissRadius &&
      distance > combinedRadius &&
      npc.nearMissCooldown === 0
    ) {
      npc.nearMissCooldown = 0.8;
      registerNearMiss(scoreState, SCORE.nearMissBonus);
      if (settings.showParticles && trafficState.sparkCooldown === 0) {
        spawnNearMissSparks(npc.pos);
        trafficState.sparkCooldown = TRAFFIC.sparkCooldown;
      }
    }
  }
}

function resolvePlayerNpcCollision(player, npc, dt) {
  const dx = npc.pos.x - player.position.x;
  const dy = npc.pos.y - player.position.y;
  const distance = Math.hypot(dx, dy);
  const minDist = player.radius + npc.radius;
  if (!(distance < minDist)) {
    return null;
  }

  const normal = safeNormalize(dx, dy);
  const penetration = minDist - distance;
  const totalMass = player.mass + npc.mass;
  const playerShare = npc.mass / totalMass;
  const npcShare = player.mass / totalMass;

  player.position.x -= normal.x * penetration * playerShare;
  player.position.y -= normal.y * penetration * playerShare;
  npc.pos.x += normal.x * penetration * npcShare;
  npc.pos.y += normal.y * penetration * npcShare;

  const relVelX = npc.vel.x - player.vel.x;
  const relVelY = npc.vel.y - player.vel.y;
  const relN = relVelX * normal.x + relVelY * normal.y;
  if (relN < 0) {
    const impulseMag = -relN * BULLY.impulseScale;
    const npcBoost = impulseMag * (player.mass / npc.mass) * BULLY.npcBoost;
    const playerDamp = impulseMag * (npc.mass / player.mass) * BULLY.playerDamp;
    npc.vel.x += normal.x * npcBoost;
    npc.vel.y += normal.y * npcBoost;
    player.vel.x -= normal.x * playerDamp;
    player.vel.y -= normal.y * playerDamp;
  }

  const npcSpeed = Math.hypot(npc.vel.x, npc.vel.y);
  if (npcSpeed > BULLY.maxNpcKnockSpeed) {
    const scale = BULLY.maxNpcKnockSpeed / npcSpeed;
    npc.vel.x *= scale;
    npc.vel.y *= scale;
  }

  npc.knockbackTimer = Math.max(npc.knockbackTimer, BULLY.knockbackHold);
  npc.speedHoldTimer = Math.max(npc.speedHoldTimer, BULLY.knockbackSpeedHold);

  return { penetration, normal };
}

function safeNormalize(x, y) {
  const length = Math.hypot(x, y);
  if (!Number.isFinite(length) || length < 1e-6) {
    return { x: 1, y: 0 };
  }
  return { x: x / length, y: y / length };
}

function drawTrafficCars() {
  const system = trafficState.system;
  const cars = system?.cars || [];
  if (!settings.showTraffic) {
    trafficState.renderStats = {
      total: cars.length,
      rendered: 0,
      skippedDisabled: cars.length,
      skippedNoAssets: 0,
      skippedMissingSprite: 0,
    };
    return;
  }
  if (!system) {
    trafficState.renderStats = {
      total: 0,
      rendered: 0,
      skippedDisabled: 0,
      skippedNoAssets: 0,
      skippedMissingSprite: 0,
    };
    return;
  }
  if (!assets) {
    trafficState.renderStats = {
      total: cars.length,
      rendered: 0,
      skippedDisabled: 0,
      skippedNoAssets: cars.length,
      skippedMissingSprite: 0,
    };
    return;
  }

  let rendered = 0;
  let missingSprite = 0;
  for (let i = 0; i < cars.length; i += 1) {
    const npc = cars[i];
    const spriteKey = trafficState.carSprites[i];
    const sprite = assets[spriteKey];
    if (useSprite && !sprite) {
      missingSprite += 1;
      continue;
    }
    if (useSprite) {
      drawCarSprite(context, sprite, npc.pos, npc.heading, CAR_RENDER_SIZE);
    } else {
      drawCarPlaceholder(npc.pos, npc.heading);
    }
    rendered += 1;
  }
  trafficState.renderStats = {
    total: cars.length,
    rendered,
    skippedDisabled: 0,
    skippedNoAssets: 0,
    skippedMissingSprite: missingSprite,
  };

  if (settings.showNearMissDebug) {
    drawTrafficDebug();
  }
}

function drawTrafficDebug() {
  if (!trafficState.system) {
    return;
  }

  context.save();
  context.strokeStyle = "rgba(255, 200, 80, 0.55)";
  context.lineWidth = 1;
  context.beginPath();
  context.arc(car.position.x, car.position.y, TRAFFIC.nearMissRadius, 0, Math.PI * 2);
  context.stroke();
  for (const npc of trafficState.system.cars) {
    context.beginPath();
    context.arc(npc.pos.x, npc.pos.y, TRAFFIC.nearMissRadius, 0, Math.PI * 2);
    context.stroke();
    context.strokeStyle = "rgba(255, 80, 80, 0.45)";
    context.beginPath();
    context.arc(npc.pos.x, npc.pos.y, npc.radius, 0, Math.PI * 2);
    context.stroke();
    context.strokeStyle = "rgba(255, 200, 80, 0.55)";
  }
  context.restore();
}

function spawnNearMissSparks(origin) {
  const count = 8;
  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 90 + Math.random() * 120;
    particlePool.spawn({
      x: origin.x + Math.cos(angle) * 6,
      y: origin.y + Math.sin(angle) * 6,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.18 + Math.random() * 0.12,
      size: 2 + Math.random() * 1.6,
      color: "rgb(255, 230, 190)",
      alpha: 0.8,
    });
  }
}

function drawHud(renderCamera) {
  const headingDeg = ((car.heading * 180) / Math.PI + 360) % 360;
  const driftDeg = (car.driftAngle * 180) / Math.PI;
  const velDeg = ((car.velAngle * 180) / Math.PI + 360) % 360;
  const particleCount = particlePool.activeCount;
  const roadStatus = car.onRoad ? "On Road" : "Off Road";
  const propCount = props.length + landmarks.length;
  const propDistrictCounts = settings.showPropDebug
    ? countPropsByDistrict(landmarks, props)
    : null;
  const districtName = settings.showTrackDebug
    ? track.getDistrictName(track.getProgressAlongTrack(car.position))
    : null;
  const trackDebugInfo = settings.showTrackDebug ? track.debugInfo : null;
  const skylineInfo = settings.showTrackDebug
    ? {
        currentKey: skylineState.currentKey,
        nextKey: skylineState.nextKey,
        fadeAlpha: skylineState.fadeAlpha,
        farKey: skylineState.currentKey && assets ? assets.skyMetro ? "skyMetro" : skylineState.currentKey : null,
        nearParallax: SKYLINE_LAYERS.near.parallaxFactor,
        farParallax: SKYLINE_LAYERS.far.parallaxFactor,
      }
    : null;
  const asphaltInfo = settings.showTrackDebug
    ? {
        ok: Boolean(asphaltPattern),
        scale: asphaltPatternScale,
      }
    : null;
  const trafficStats = settings.showNearMissDebug
    ? getTrafficStats(track, trafficState.system, trafficState.renderStats)
    : null;
  const knockedCount =
    settings.showNearMissDebug && trafficState.system
      ? trafficState.system.cars.filter((npc) => npc.knockbackTimer > 0).length
      : 0;
  const lapProgress = Number.isFinite(raceState.lapProgressUnwrapped)
    ? clamp(raceState.lapProgressUnwrapped, 0, 1)
    : 0;
  const progressT = Number.isFinite(raceState.lastProgress)
    ? raceState.lastProgress
    : track.getProgressAlongTrack(car.position);
  const runTimerSeconds = raceState.phase === RACE_PHASE.RACING
    ? raceState.runElapsed
    : null;
  const nextCheckpoint = raceState.checkpoints[raceState.currentCheckpointIndex];
  const nextCheckpointThreshold = nextCheckpoint ? nextCheckpoint.t : null;
  const boostReady =
    raceState.phase === RACE_PHASE.RACING &&
    boostPads.some((pad) => pad.cooldownTimer <= 0);
  const boostStatus = car.boostActive ? "ACTIVE" : boostReady ? "READY" : "COOLDOWN";
  const boostSpriteLoaded = Boolean(
    assets?.abstractArrows &&
      assets.abstractArrows.width > 0 &&
      assets.abstractArrows.height > 0,
  );
  const boostTimeAgo = raceState.lastBoostTime
    ? (performance.now() - raceState.lastBoostTime) / 1000
    : null;

  renderHUD(context, {
    fps: state.fps,
    version: VERSION,
    score: scoreState.runScore,
    bestScore: scoreState.bestScore,
    multiplier: scoreState.multiplier,
    speed: car.speed,
    headingDeg,
    velDeg,
    driftDeg,
    driftActive: car.driftActive,
    particleCount,
    trailRate: particleState.trailRate,
    roadStatus,
    boostStatus,
    boostSpriteLoaded,
    boostPadCount: Array.isArray(boostPads) ? boostPads.length : 0,
    padsDrawnThisFrame: state.padsDrawnThisFrame,
    lastBoostPadIndex: raceState.lastBoostPadIndex,
    lastBoostTimeAgo: boostTimeAgo,
    boostTimerRemaining: car.boostTimer,
    lastBoostImpulse: raceState.lastBoostImpulse,
    lastBoostSpeedDelta: raceState.lastBoostSpeedDelta,
    racePhase: raceState.phase,
    boostUpdateCalls: raceState.boostUpdateCalls,
    boostUpdateThisFrame: raceState.boostUpdateThisFrame,
    boostDebug: raceState.boostDebug,
    lastBoostTriggerTime: raceState.lastBoostTriggerTime,
    lastBoostTriggerIndex: raceState.lastBoostTriggerIndex,
    lastBoostTriggerAttempt: raceState.lastBoostTriggerAttempt,
    manualBoostCount: raceState.manualBoostCount,
    boostAppliedThisFrame: raceState.boostAppliedThisFrame,
    compactDebugPanel: settings.compactDebugPanel,
    showPropDebug: settings.showPropDebug,
    showCollisions: settings.showCollisions,
    propCount,
    propDistrictCounts,
    cameraX: renderCamera.x,
    cameraY: renderCamera.y,
    showTrackDebug: settings.showTrackDebug,
    districtName,
    trackDebugInfo,
    asphaltInfo,
    skylineInfo,
    boostActive: car.boostActive,
    boostTimer: car.boostTimer,
    boostDuration: car.boostDuration,
    trafficCount: settings.showTraffic ? trafficState.system?.cars.length || 0 : 0,
    nearMissCount: scoreState.nearMissCount,
    showNearMissDebug: settings.showNearMissDebug,
    knockedCount,
    trafficStats,
    raceArmed: raceState.raceArmed,
    raceFinished: raceState.raceFinished,
    finishDebug: raceState.finishDebug,
    lapProgress,
    finishCrossCount: raceState.finishCrossCount,
    lapsTotal: LAPS_TOTAL,
    startT: Number.isFinite(track.startT) ? track.startT : 0,
    progressT,
    lastProgress: raceState.prevProgressT,
    predictedProgressT: raceState.predictedProgressT,
    chosenProgressT: raceState.chosenProgressT,
    rawProgressDelta: raceState.rawProgressDelta,
    clampedProgressDelta: raceState.clampedProgressDelta,
    plausibleProgressDelta: raceState.plausibleProgressDelta,
    branchSnapPrevented: raceState.branchSnapPrevented,
    lapProgressUnwrapped: raceState.lapProgressUnwrapped,
    gateD: raceState.gateD,
    gateCrossed: raceState.gateCrossed,
    phase: raceState.phase,
    runTimerSeconds,
    screenWidth: state.width,
    checkpointIndex: raceState.currentCheckpointIndex,
    checkpointCount: raceState.checkpoints.length,
    lastSplitDelta: raceState.lastSplitDelta,
    prevLapProgress: raceState.prevLapProgress,
    nextCheckpointThreshold,
    progressWindowSegments: PROGRESS_TRACKING.windowSegments,
  });
}

function lerpAngle(a, b, t) {
  const delta = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + delta * t;
}

function wrap01(value) {
  return ((value % 1) + 1) % 1;
}

function wrapDiffSigned(a, b) {
  let delta = a - b;
  if (delta > 0.5) delta -= 1;
  if (delta < -0.5) delta += 1;
  return delta;
}

function queueNotification(text, type, now, duration = 0.6) {
  raceState.notifications.push({
    text,
    type,
    expiresAt: now + duration * 1000,
  });
}

function getBoostDebugSnapshot(pads, carRef) {
  if (!Array.isArray(pads) || pads.length === 0) {
    return null;
  }
  let bestIndex = 0;
  let bestDist = Number.POSITIVE_INFINITY;
  for (let i = 0; i < pads.length; i += 1) {
    const pad = pads[i];
    if (!pad || !pad.position) {
      continue;
    }
    const dx = carRef.position.x - pad.position.x;
    const dy = carRef.position.y - pad.position.y;
    const dist = Math.hypot(dx, dy);
    if (dist < bestDist) {
      bestDist = dist;
      bestIndex = i;
    }
  }
  const pad = pads[bestIndex];
  if (!pad || !pad.position) {
    return null;
  }
  return {
    index: bestIndex,
    dist: bestDist,
    radius: pad.triggerRadius,
    cooldown: pad.cooldownTimer,
  };
}

function buildBoostPadsFromTs(trackRef) {
  return BOOST_PAD_TS.map((t, index) => {
    const sample = trackRef.getPointAtProgress(t);
    return {
      id: index,
      t,
      position: createVec2(sample.point.x, sample.point.y),
      tangent: sample.tangent,
      normal: sample.normal,
      radius: 34,
      triggerRadius: 220,
      strength: 1.0,
      duration: 0.75,
      cooldown: 2.0,
      cooldownTimer: 0,
    };
  });
}

function ensureBoostPads(trackRef, pads) {
  if (!Array.isArray(pads) || pads.length !== BOOST_PAD_TS.length) {
    return buildBoostPadsFromTs(trackRef);
  }
  let needsRepair = false;
  for (const pad of pads) {
    if (!pad || !pad.position || !Number.isFinite(pad.position.x) || !Number.isFinite(pad.position.y)) {
      needsRepair = true;
      break;
    }
  }
  if (needsRepair) {
    return buildBoostPadsFromTs(trackRef);
  }
  return pads;
}

function getTrafficStats(trackRef, system, renderStats) {
  if (!system) {
    return null;
  }
  const cars = system.cars;
  if (!cars.length) {
    return {
      settingCount: system.settings.trafficCount,
      activeCount: 0,
      avgSpacing: 0,
      generatedCount: system.spawnStats?.generatedCount ?? 0,
      renderStats,
      spawnStats: system.spawnStats,
    };
  }
  const byLane = new Map();
  for (const carEntity of cars) {
    const list = byLane.get(carEntity.laneIndex) || [];
    list.push(carEntity);
    byLane.set(carEntity.laneIndex, list);
  }
  let totalGap = 0;
  let gapCount = 0;
  for (const list of byLane.values()) {
    list.sort((a, b) => a.progress - b.progress);
    for (let i = 0; i < list.length; i += 1) {
      const carEntity = list[i];
      const ahead = list[(i + 1) % list.length];
      const gapProgress = (ahead.progress - carEntity.progress + 1) % 1;
      totalGap += gapProgress * trackRef.totalLength;
      gapCount += 1;
    }
  }
  return {
    settingCount: system.settings.trafficCount,
    activeCount: cars.length,
    avgSpacing: gapCount ? totalGap / gapCount : 0,
    generatedCount: system.spawnStats?.generatedCount ?? cars.length,
    renderStats,
    spawnStats: system.spawnStats,
    debugInfo: system.spawnStats
      ? {
          settingsTrafficCount: system.spawnStats.settingsTrafficCount,
          settingsMaxCount: system.spawnStats.settingsMaxCount,
          targetCount: system.spawnStats.targetCount,
          laneMax: system.spawnStats.laneMax,
          trackWidth: system.spawnStats.trackWidth,
          laneMargin: system.spawnStats.laneMargin,
          laneMaxCapActive: system.spawnStats.laneMaxCapActive,
          centersCount: system.spawnStats.centersCount,
          minProgressSep: system.spawnStats.minProgressSep,
        }
      : null,
  };
}

function countPropsByDistrict(landmarkList, propList) {
  const counts = {
    beach: 0,
    downtown: 0,
    neon: 0,
    harbor: 0,
  };
  for (let i = 0; i < landmarkList.length; i += 1) {
    const district = landmarkList[i].districtId;
    if (district && counts[district] !== undefined) {
      counts[district] += 1;
    }
  }
  for (let i = 0; i < propList.length; i += 1) {
    const district = propList[i].districtId;
    if (district && counts[district] !== undefined) {
      counts[district] += 1;
    }
  }
  return counts;
}

function smallestAngleBetween(a, b) {
  return Math.atan2(Math.sin(b - a), Math.cos(b - a));
}

function updateCarPhysics(dt, controlsLocked = false) {
  const throttle = !controlsLocked && (isDown("KeyW") || isDown("ArrowUp"));
  const brake = !controlsLocked && (isDown("KeyS") || isDown("ArrowDown"));
  const steerLeft = !controlsLocked && (isDown("KeyA") || isDown("ArrowLeft"));
  const steerRight = !controlsLocked && (isDown("KeyD") || isDown("ArrowRight"));

  car.throttleInput = clamp((throttle ? 1 : 0) - (brake ? 1 : 0), -1, 1);
  car.steerInput = clamp((steerRight ? 1 : 0) - (steerLeft ? 1 : 0), -1, 1);
  car.handbrake = !controlsLocked && isDown("Space");

  const onRoad = track.isOnRoad(car.position);
  car.onRoad = onRoad;

  const speed = Math.hypot(car.vel.x, car.vel.y);
  const speedNorm = clamp(speed / PHYSICS.maxSpeedForward, 0, 1);
  const steerRate = lerp(PHYSICS.steerRateMin, PHYSICS.steerRateMax, speedNorm);

  const steerScale = onRoad ? 1 : PHYSICS.offRoadSteerScale;
  car.heading += car.steerInput * steerRate * steerScale * dt;

  const forwardDir = {
    x: Math.cos(car.heading),
    y: Math.sin(car.heading),
  };
  const rightDir = { x: -forwardDir.y, y: forwardDir.x };
  const forwardSpeed = car.vel.x * forwardDir.x + car.vel.y * forwardDir.y;

  const boostScale = car.boostActive
    ? car.boostStrength * BOOST.accelMultiplier
    : 1;
  let accel = 0;
  if (car.throttleInput > 0) {
    accel = PHYSICS.engineAccel * boostScale * car.throttleInput;
  } else if (car.throttleInput < 0) {
    if (forwardSpeed > 0) {
      accel = -PHYSICS.brakeDecel * Math.abs(car.throttleInput);
    } else {
      accel = -PHYSICS.reverseAccel * Math.abs(car.throttleInput);
    }
  }

  car.vel.x += forwardDir.x * accel * dt;
  car.vel.y += forwardDir.y * accel * dt;

  let vf = car.vel.x * forwardDir.x + car.vel.y * forwardDir.y;
  let vl = car.vel.x * rightDir.x + car.vel.y * rightDir.y;

  const speedAfterAccel = Math.hypot(car.vel.x, car.vel.y);
  const velAngle = Math.atan2(car.vel.y, car.vel.x);
  const driftAngle =
    speedAfterAccel > PHYSICS.minDriftSpeed
      ? smallestAngleBetween(car.heading, velAngle)
      : 0;
  const driftActive =
    speedAfterAccel > PHYSICS.minDriftSpeed &&
    Math.abs(driftAngle) > PHYSICS.driftThreshold;
  car.driftActive = driftActive || car.handbrake;

  const lateralDamp = car.driftActive
    ? PHYSICS.lateralDampDrift
    : PHYSICS.lateralDampGrip;
  let forwardDrag = car.driftActive ? PHYSICS.forwardDrag * 0.6 : PHYSICS.forwardDrag;
  if (car.boostActive) {
    forwardDrag *= BOOST.dragReduction;
  }

  vl *= Math.exp(-lateralDamp * dt);
  vf *= Math.exp(-forwardDrag * dt);

  const maxForward = car.boostActive
    ? PHYSICS.maxSpeedForward * BOOST.maxSpeedMultiplier
    : PHYSICS.maxSpeedForward;
  vf = clamp(vf, -PHYSICS.maxSpeedReverse, maxForward);

  car.vel.x = forwardDir.x * vf + rightDir.x * vl;
  car.vel.y = forwardDir.y * vf + rightDir.y * vl;

  if (!onRoad) {
    const offRoadDrag = Math.exp(-PHYSICS.offRoadDrag * dt);
    car.vel.x *= offRoadDrag;
    car.vel.y *= offRoadDrag;
  }

  car.position.x += car.vel.x * dt;
  car.position.y += car.vel.y * dt;

  car.speed = Math.hypot(car.vel.x, car.vel.y);
  car.velAngle = car.speed > 0.001 ? Math.atan2(car.vel.y, car.vel.x) : car.heading;
  car.driftAngle =
    car.speed > PHYSICS.minDriftSpeed
      ? smallestAngleBetween(car.heading, car.velAngle)
      : 0;
}

function resolveTrackCollision() {
  if (!settings.showCollisions) {
    return null;
  }

  const closest = track.getClosestPoint(car.position);
  const distance = closest.distance;
  if (distance <= track.width) {
    return null;
  }

  let normalX = car.position.x - closest.point.x;
  let normalY = car.position.y - closest.point.y;
  const normalLen = Math.hypot(normalX, normalY);

  if (normalLen < 0.001) {
    const nextIndex = (closest.segmentIndex + 1) % track.centerline.length;
    const a = track.centerline[closest.segmentIndex];
    const b = track.centerline[nextIndex];
    const tx = b.x - a.x;
    const ty = b.y - a.y;
    const tLen = Math.hypot(tx, ty) || 1;
    normalX = -ty / tLen;
    normalY = tx / tLen;
  } else {
    normalX /= normalLen;
    normalY /= normalLen;
  }

  const correction = distance - track.width;
  if (correction > 0) {
    car.position.x -= normalX * correction;
    car.position.y -= normalY * correction;
  }

  const vn = car.vel.x * normalX + car.vel.y * normalY;
  if (vn > 0) {
    car.vel.x -= normalX * (COLLISION.bounceScale * vn);
    car.vel.y -= normalY * (COLLISION.bounceScale * vn);
  }

  car.vel.x *= COLLISION.velocityDamping;
  car.vel.y *= COLLISION.velocityDamping;

  if (correction < COLLISION.minCorrection) {
    return null;
  }

  const impactStrength = Math.min(
    1,
    Math.hypot(car.vel.x, car.vel.y) * COLLISION.impactScale +
      correction * 0.01,
  );

  return {
    position: { x: closest.point.x, y: closest.point.y },
    normal: { x: normalX, y: normalY },
    strength: impactStrength,
  };
}

function updateImpactState(dt, impact) {
  impactState.shakeIntensity *= Math.exp(-6 * dt);
  impactState.shakeTime += dt;
  impactState.flashAlpha = Math.max(0, impactState.flashAlpha - dt * 4.2);

  if (!impact) {
    return;
  }

  impactState.shakeIntensity = Math.min(
    1,
    impactState.shakeIntensity + impact.strength * COLLISION.shakeScale,
  );
  impactState.flashAlpha = Math.min(
    0.7,
    impactState.flashAlpha + impact.strength * COLLISION.flashScale,
  );
}

function getCameraShakeOffset() {
  const intensity = impactState.shakeIntensity;
  if (intensity < 0.001) {
    return { x: 0, y: 0 };
  }

  const t = impactState.shakeTime;
  const shakeX = Math.sin(t * 18.3) * intensity * 6;
  const shakeY = Math.cos(t * 22.7) * intensity * 4;
  return { x: shakeX, y: shakeY };
}

function updateBoostState(dt) {
  if (!car.boostActive) {
    return;
  }

  car.boostTimer = Math.max(0, car.boostTimer - dt);
  if (car.boostTimer === 0) {
    car.boostActive = false;
    car.boostStrength = 1;
    car.boostDuration = 0;
  }
}

function updateRacePhase(now) {
  if (raceState.phase === RACE_PHASE.PRE_RACE) {
    if (!raceState.countdownStartTime) {
      raceState.countdownStartTime = now + RACE_TIMING.autoStartDelay * 1000;
      return;
    }
    if (now >= raceState.countdownStartTime) {
      raceState.phase = RACE_PHASE.COUNTDOWN;
      raceState.countdownStartTime = now;
    }
  } else if (raceState.phase === RACE_PHASE.COUNTDOWN) {
    const elapsed = (now - raceState.countdownStartTime) / 1000;
    if (elapsed >= RACE_TIMING.countdownStep * 3) {
      raceState.phase = RACE_PHASE.GO_FLASH;
      raceState.goStartTime = now;
    }
  } else if (raceState.phase === RACE_PHASE.GO_FLASH) {
    const elapsed = (now - raceState.goStartTime) / 1000;
    if (elapsed >= RACE_TIMING.goFlashDuration) {
      raceState.phase = RACE_PHASE.RACING;
      raceState.runStartTime = now;
      raceState.runElapsed = 0;
    }
  } else if (raceState.phase === RACE_PHASE.RACING) {
    raceState.runElapsed = getRunElapsedSeconds(now);
  }
}

function getRunElapsedSeconds(now) {
  if (!raceState.runStartTime) {
    return 0;
  }
  return Math.max(0, (now - raceState.runStartTime) / 1000);
}

function getOverlayState() {
  const { phase } = raceState;
  if (phase === RACE_PHASE.COUNTDOWN) {
    const elapsed = (performance.now() - raceState.countdownStartTime) / 1000;
    const index = Math.floor(elapsed / RACE_TIMING.countdownStep);
    const count = 3 - index;
    if (count > 0) {
      return {
        text: String(count),
        screenWidth: state.width,
        screenHeight: state.height,
        style: "countdown",
      };
    }
    return null;
  }
  if (phase === RACE_PHASE.GO_FLASH) {
    return {
      text: "RACE!",
      screenWidth: state.width,
      screenHeight: state.height,
      style: "go",
    };
  }
  // Notifications handle checkpoint/boost/finish pops.
  return null;
}

function shouldShowFinishPanel() {
  if (!raceState.finishStartTime) {
    return false;
  }
  const elapsed = (performance.now() - raceState.finishStartTime) / 1000;
  return elapsed >= RACE_TIMING.finishSplashDuration;
}

function updateBestRunStats() {
  const runScore = scoreState.runScore;
  const runTime = raceState.runElapsed;
  if (runScore > bestRunState.bestScore) {
    bestRunState.bestScore = runScore;
    bestRunState.newBestScore = true;
    storeBestScore(bestRunState.bestScore);
  }
  if (runTime > 0 && (bestRunState.bestTime === null || runTime < bestRunState.bestTime)) {
    bestRunState.bestTime = runTime;
    bestRunState.newBestTime = true;
    storeBestTime(bestRunState.bestTime);
  }
}

function getBestSplitIndex(splitTimes) {
  if (!splitTimes.length) {
    return null;
  }
  let bestIndex = 0;
  let bestDelta = splitTimes[0];
  for (let i = 1; i < splitTimes.length; i += 1) {
    const prev = splitTimes[i - 1];
    const delta = splitTimes[i] - prev;
    if (delta < bestDelta) {
      bestDelta = delta;
      bestIndex = i;
    }
  }
  return bestIndex;
}

function loadStoredBestScore() {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.bestScore);
    return stored ? Number(stored) || 0 : 0;
  } catch {
    return 0;
  }
}

function loadStoredBestTime() {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.bestTime);
    return stored ? Number(stored) || 0 : null;
  } catch {
    return null;
  }
}

function storeBestScore(score) {
  try {
    localStorage.setItem(STORAGE_KEYS.bestScore, score.toFixed(0));
  } catch {
    // Ignore storage failures.
  }
}

function storeBestTime(timeSeconds) {
  try {
    localStorage.setItem(STORAGE_KEYS.bestTime, timeSeconds.toFixed(3));
  } catch {
    // Ignore storage failures.
  }
}

function updateRaceProgress(now) {
  const lastProgressT = Number.isFinite(raceState.lastProgress)
    ? raceState.lastProgress
    : track.getProgressAlongTrack(car.position);
  const totalLength = track.totalLength || 1;
  const dtSeconds = raceState.lastProgressTime ? Math.max(0, (now - raceState.lastProgressTime) / 1000) : 0;
  const speed = car.speed;
  const plausibleDelta = totalLength > 0 ? (speed * dtSeconds) / totalLength : 0;
  const lastSample = track.getPointAtProgress(lastProgressT);
  const travelDot = car.vel.x * lastSample.tangent.x + car.vel.y * lastSample.tangent.y;
  const travelSign = travelDot >= 0 ? 1 : -1;
  const predictedDelta = clamp(
    travelSign * plausibleDelta,
    -PROGRESS_TRACKING.predictedClamp,
    PROGRESS_TRACKING.predictedClamp,
  );
  const predictedT = wrap01(lastProgressT + predictedDelta);
  const progressLookup =
    typeof track.getProgressAlongTrackBest === "function"
      ? track.getProgressAlongTrackBest.bind(track)
      : track.getProgressAlongTrack.bind(track);
  const candidateT =
    progressLookup === track.getProgressAlongTrack
      ? progressLookup(car.position)
      : progressLookup(
          car.position,
          lastProgressT,
          predictedT,
          PROGRESS_TRACKING.windowSegments,
        );
  if (!Number.isFinite(candidateT)) {
    return;
  }
  const rawDelta = Number.isFinite(raceState.lastProgress)
    ? wrapDiffSigned(candidateT, lastProgressT)
    : 0;
  const maxDelta = plausibleDelta * PROGRESS_TRACKING.clampScale;
  const clampedDelta = Number.isFinite(rawDelta)
    ? clamp(rawDelta, -maxDelta, maxDelta)
    : 0;
  const branchSnapPrevented =
    Number.isFinite(rawDelta) && Math.abs(rawDelta) > Math.abs(clampedDelta) + 1e-6;
  const adjustedT =
    Number.isFinite(raceState.lastProgress) ? wrap01(lastProgressT + clampedDelta) : candidateT;
  if (Number.isFinite(clampedDelta)) {
    raceState.lapProgressUnwrapped += clampedDelta;
  }
  raceState.prevProgressT = raceState.lastProgress;
  raceState.lastProgress = adjustedT;
  raceState.lastProgressTime = now;
  raceState.predictedProgressT = predictedT;
  raceState.chosenProgressT = candidateT;
  raceState.rawProgressDelta = rawDelta;
  raceState.clampedProgressDelta = clampedDelta;
  raceState.plausibleProgressDelta = plausibleDelta;
  raceState.branchSnapPrevented = branchSnapPrevented;

  if (!Number.isFinite(raceState.lapProgressUnwrapped)) {
    raceState.lapProgressUnwrapped = 0;
  }

  if (!raceState.raceArmed && raceState.lapProgressUnwrapped > 0.15) {
    raceState.raceArmed = true;
  }

  if (!raceState.checkpoints.length) {
    raceState.checkpoints = track.getCheckpoints();
  }

  const finishGate = track.getFinishGate();
  const gatePos = finishGate.gatePos || finishGate.pos;
  const gateNormal = finishGate.gateNormal || finishGate.normal;
  const gateTangent =
    finishGate.gateTangent || finishGate.tangent || track.getPointAtProgress(track.startT).tangent;
  const dx = car.position.x - gatePos.x;
  const dy = car.position.y - gatePos.y;
  const d = dx * gateNormal.x + dy * gateNormal.y;
  const prevGateD = raceState.prevGateD;
  const forwardDot = gateTangent
    ? car.vel.x * gateTangent.x + car.vel.y * gateTangent.y
    : car.speed;
  const crossing =
    prevGateD !== null && prevGateD < 0 && d >= 0 && forwardDot > FINISH_MIN_FORWARD;
  raceState.gateD = d;
  raceState.gateCrossed = crossing;
  raceState.prevGateD = d;

  const perLapProgress = Math.max(0, raceState.lapProgressUnwrapped - raceState.perLapBase);
  if (raceState.phase === RACE_PHASE.RACING && CHECKPOINT_TS_PER_LAP.length) {
    while (raceState.currentCheckpointIndex < CHECKPOINT_TS_PER_LAP.length) {
      const index = raceState.currentCheckpointIndex;
      const targetT = CHECKPOINT_TS_PER_LAP[index];
      if (perLapProgress >= targetT) {
        const elapsed = raceState.runElapsed;
        const prevSplit = index > 0 ? raceState.splitTimes[index - 1] : 0;
        raceState.splitTimes[index] = elapsed;
        raceState.lastSplitDelta = elapsed - prevSplit;
        raceState.currentCheckpointIndex += 1;
        raceState.checkpointFlashTime = now;
        raceState.checkpointFlashText = `CHECKPOINT ${raceState.currentCheckpointIndex}/${CHECKPOINT_TS_PER_LAP.length}`;
        queueNotification(raceState.checkpointFlashText, "checkpoint", now, 0.6);
      } else {
        break;
      }
    }
  }
  raceState.prevLapProgress = raceState.lapProgressUnwrapped;
  raceState.finishDebug = {
    evaluated: true,
    t: raceState.lastProgress,
    unwrapped: raceState.lapProgressUnwrapped,
    perLap: perLapProgress,
    gateD: raceState.gateD,
    prevGateD,
    crossed: crossing,
    forward: forwardDot,
    cooldown: raceState.finishGateCooldown,
    allowed: raceState.phase === RACE_PHASE.RACING,
    finishCrossCount: raceState.finishCrossCount,
  };

  if (
    raceState.phase === RACE_PHASE.RACING &&
    crossing &&
    raceState.finishGateCooldown === 0
  ) {
    raceState.finishCrossCount += 1;
    raceState.finishGateCooldown = 1.0;
    if (raceState.finishCrossCount >= LAPS_TOTAL) {
      raceState.raceFinished = true;
      raceState.phase = RACE_PHASE.FINISHED;
      raceState.finishStartTime = now;
      raceState.runElapsed = getRunElapsedSeconds(now);
      raceState.bestSplitIndex = getBestSplitIndex(raceState.splitTimes);
      updateBestRunStats();
      queueNotification("FINISH!", "finish", now, 0.8);
    } else {
      const nextLap = Math.min(raceState.finishCrossCount + 1, LAPS_TOTAL);
      queueNotification(`LAP ${nextLap}/${LAPS_TOTAL}`, "lap", now, 0.7);
      raceState.perLapBase += 1;
      raceState.currentCheckpointIndex = 0;
      raceState.splitTimes = [];
      raceState.lastSplitDelta = null;
    }
  }
}

function resetToStart() {
  const startT = Number.isFinite(track.startT) ? track.startT : 0;
  const sample = track.getPointAtProgress(startT);
  const pose = {
    pos: sample.point,
    heading: Math.atan2(sample.tangent.y, sample.tangent.x),
    tangent: sample.tangent,
    normal: sample.normal,
  };
  car.position.x = pose.pos.x;
  car.position.y = pose.pos.y;
  car.prevPosition.x = pose.pos.x;
  car.prevPosition.y = pose.pos.y;
  car.heading = pose.heading;
  car.prevHeading = pose.heading;
  car.vel.x = 0;
  car.vel.y = 0;
  car.prevVel.x = 0;
  car.prevVel.y = 0;
  car.speed = 0;
  car.velAngle = pose.heading;
  car.driftAngle = 0;
  car.driftActive = false;
  car.boostActive = false;
  car.boostTimer = 0;
  car.boostStrength = 1;
  car.boostDuration = 0;
  camera.position.x = pose.pos.x;
  camera.position.y = pose.pos.y;
  camera.prevPosition.x = pose.pos.x;
  camera.prevPosition.y = pose.pos.y;
  raceState.raceArmed = false;
  raceState.raceFinished = false;
  raceState.lastProgress = null;
  raceState.prevProgressT = null;
  raceState.lastProgressTime = null;
  raceState.predictedProgressT = null;
  raceState.chosenProgressT = null;
  raceState.rawProgressDelta = null;
  raceState.clampedProgressDelta = null;
  raceState.plausibleProgressDelta = null;
  raceState.branchSnapPrevented = false;
  raceState.lapProgressUnwrapped = 0;
  raceState.prevLapProgress = 0;
  raceState.phase = RACE_PHASE.PRE_RACE;
  raceState.countdownStartTime = null;
  raceState.goStartTime = null;
  raceState.finishStartTime = null;
  raceState.runStartTime = null;
  raceState.runElapsed = 0;
  raceState.checkpoints = track.getCheckpoints();
  raceState.currentCheckpointIndex = 0;
  raceState.splitTimes = [];
  raceState.lastSplitDelta = null;
  raceState.checkpointFlashTime = null;
  raceState.checkpointFlashText = null;
  raceState.boostFlashTime = null;
  raceState.boostFlashText = null;
  raceState.lastBoostPadIndex = null;
  raceState.lastBoostTime = null;
  raceState.lastBoostImpulse = null;
  raceState.lastBoostSpeedDelta = null;
  raceState.lastBoostTriggerTime = null;
  raceState.lastBoostTriggerIndex = null;
  raceState.lastBoostTriggerAttempt = null;
  raceState.manualBoostCount = 0;
  raceState.boostAppliedThisFrame = false;
  raceState.finishCrossCount = 0;
  raceState.perLapBase = 0;
  raceState.finishGateCooldown = 0;
  raceState.bestSplitIndex = null;
  boostPads = ensureBoostPads(track, generateBoostPads(track));
  const finishGate = track.getFinishGate();
  const gatePos = finishGate.gatePos || finishGate.pos;
  const gateNormal = finishGate.gateNormal || finishGate.normal;
  const gateDx = car.position.x - gatePos.x;
  const gateDy = car.position.y - gatePos.y;
  const gateD = gateDx * gateNormal.x + gateDy * gateNormal.y;
  raceState.prevGateD = gateD;
  raceState.gateD = gateD;
  raceState.gateCrossed = false;
  bestRunState.newBestScore = false;
  bestRunState.newBestTime = false;
  resetRun(scoreState);
}

function drawBoostPads(pads, renderCarPos) {
  if (!pads.length) {
    return;
  }
  const sprite = assets?.abstractArrows;
  const spriteLoaded = Boolean(sprite && sprite.width > 0 && sprite.height > 0);
  const baseLength = Math.max(160, track.width * 1.6);
  const baseThickness = Math.max(40, track.width * 0.4);
  context.save();
  context.globalCompositeOperation = "source-over";
  for (let i = 0; i < pads.length; i += 1) {
    const pad = pads[i];
    if (!pad || !pad.position) {
      continue;
    }
    const padT = Number.isFinite(pad.t)
      ? pad.t
      : track.getProgressAlongTrack(pad.position);
    const sample = track.getPointAtProgress(padT);
    const position = pad.position || sample.point;
    const tangent = pad.tangent || sample.tangent;
    if (!position || !tangent) {
      continue;
    }
    pad.t = padT;
    pad.position = position;
    pad.tangent = tangent;
    const pulse = 0.95 + 0.08 * Math.sin(performance.now() * 0.004 + i);
    const angle = Math.atan2(tangent.y, tangent.x);
    const length = baseLength * pulse;
    const thickness = baseThickness * pulse;
    context.save();
    context.translate(position.x, position.y);
    context.rotate(angle);
    context.globalAlpha = 0.9;
    drawBoostPadStrip(context, length, thickness, "rgba(120, 255, 220, 0.85)");
    if (spriteLoaded) {
      const spriteHeight = (length * sprite.height) / sprite.width;
      context.globalAlpha = 0.85;
      context.drawImage(sprite, -length / 2, -spriteHeight / 2, length, spriteHeight);
    }
    context.restore();
    context.save();
    context.globalCompositeOperation = "lighter";
    context.translate(position.x, position.y);
    context.rotate(angle);
    context.globalAlpha = 0.35;
    drawBoostPadStrip(context, length * 1.08, thickness * 1.08, "rgba(140, 255, 240, 0.6)");
    context.restore();
    state.padsDrawnThisFrame += 1;
    if (settings.showTrackDebug) {
      context.save();
      context.strokeStyle = "rgba(120, 255, 220, 0.55)";
      context.lineWidth = 1;
      context.beginPath();
      context.arc(position.x, position.y, pad.triggerRadius, 0, Math.PI * 2);
      context.stroke();
      context.fillStyle = "rgba(220, 245, 255, 0.9)";
      context.font = "11px 'Segoe UI', system-ui, sans-serif";
      context.textBaseline = "middle";
      context.fillText(`${pad.id + 1} (${pad.t.toFixed(2)})`, position.x + 10, position.y);
      if (renderCarPos) {
        const dist = Math.hypot(
          renderCarPos.x - position.x,
          renderCarPos.y - position.y,
        );
        if (dist <= pad.triggerRadius + 40) {
          const cooldown = pad.cooldownTimer.toFixed(1);
          context.fillText(`cd ${cooldown}s`, position.x + 10, position.y + 12);
        }
      }
      context.restore();
    }
  }
  context.restore();
}

function drawBoostPadGlow(pads) {
  if (!pads.length) {
    return;
  }
  const sprite = assets?.abstractArrows;
  const spriteLoaded = Boolean(sprite && sprite.width > 0 && sprite.height > 0);
  const baseLength = Math.max(170, track.width * 1.75);
  const baseThickness = Math.max(42, track.width * 0.45);
  context.save();
  context.globalCompositeOperation = "lighter";
  for (let i = 0; i < pads.length; i += 1) {
    const pad = pads[i];
    if (!pad || !pad.position) {
      continue;
    }
    const padT = Number.isFinite(pad.t)
      ? pad.t
      : track.getProgressAlongTrack(pad.position);
    const sample = track.getPointAtProgress(padT);
    const position = pad.position || sample.point;
    const tangent = pad.tangent || sample.tangent;
    if (!position || !tangent) {
      continue;
    }
    pad.t = padT;
    pad.position = position;
    pad.tangent = tangent;
    const pulse = 1 + 0.06 * Math.sin(performance.now() * 0.004 + i);
    const angle = Math.atan2(tangent.y, tangent.x);
    const length = baseLength * pulse;
    const thickness = baseThickness * pulse;
    context.save();
    context.translate(position.x, position.y);
    context.rotate(angle);
    context.globalAlpha = 0.3;
    drawBoostPadStrip(context, length, thickness, "rgba(140, 255, 240, 0.5)");
    if (spriteLoaded) {
      const spriteHeight = (length * sprite.height) / sprite.width;
      context.globalAlpha = 0.25;
      context.drawImage(sprite, -length / 2, -spriteHeight / 2, length, spriteHeight);
    }
    context.restore();
  }
  context.restore();
}

function drawBoostPadsScreenDebug(pads) {
  if (!pads.length) {
    return;
  }
  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.globalCompositeOperation = "source-over";
  context.font = "12px 'Segoe UI', system-ui, sans-serif";
  context.textBaseline = "middle";
  for (let i = 0; i < pads.length; i += 1) {
    const y = 80 + i * 22;
    context.fillStyle = "magenta";
    context.fillRect(40, y, 180, 16);
    context.fillStyle = "white";
    context.fillText(`Pad ${i + 1}`, 50, y + 8);
  }
  context.restore();
}

function drawBoostPadStrip(ctx, length, thickness, color) {
  const radius = Math.min(10, thickness * 0.35);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(-length / 2 + radius, -thickness / 2);
  ctx.lineTo(length / 2 - radius, -thickness / 2);
  ctx.quadraticCurveTo(length / 2, -thickness / 2, length / 2, -thickness / 2 + radius);
  ctx.lineTo(length / 2, thickness / 2 - radius);
  ctx.quadraticCurveTo(length / 2, thickness / 2, length / 2 - radius, thickness / 2);
  ctx.lineTo(-length / 2 + radius, thickness / 2);
  ctx.quadraticCurveTo(-length / 2, thickness / 2, -length / 2, thickness / 2 - radius);
  ctx.lineTo(-length / 2, -thickness / 2 + radius);
  ctx.quadraticCurveTo(-length / 2, -thickness / 2, -length / 2 + radius, -thickness / 2);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "rgba(230, 255, 255, 0.85)";
  const chevronCount = 3;
  const chevronWidth = length * 0.18;
  const chevronHeight = thickness * 0.55;
  const startX = -length * 0.22;
  for (let i = 0; i < chevronCount; i += 1) {
    const x = startX + i * chevronWidth;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x - chevronWidth * 0.45, -chevronHeight / 2);
    ctx.lineTo(x - chevronWidth * 0.45, chevronHeight / 2);
    ctx.closePath();
    ctx.fill();
  }
}

function updateParticles(dt, handbrakePressed, boostTriggered) {
  particlePool.update(dt);

  if (!settings.showParticles) {
    particleState.trailRate = 0;
    return;
  }

  const speed = car.speed;
  if (speed <= 0.1) {
    particleState.trailRate = 0;
    return;
  }

  const forwardDir = {
    x: Math.cos(car.heading),
    y: Math.sin(car.heading),
  };
  const rightDir = { x: -forwardDir.y, y: forwardDir.x };
  const rearOffset = PARTICLES.trailRearOffset;
  const baseX = car.position.x - forwardDir.x * rearOffset;
  const baseY = car.position.y - forwardDir.y * rearOffset;

  const driftFactor = clamp(
    Math.abs(car.driftAngle) / (Math.PI / 2),
    0,
    1,
  );
  let trailRate =
    PARTICLES.trailRateBase +
    speed * PARTICLES.trailRateSpeed +
    driftFactor * PARTICLES.trailRateDrift;

  if (car.handbrake) {
    trailRate *= PARTICLES.trailHandbrakeBoost;
  }

  if (car.boostActive) {
    trailRate *= BOOST.trailMultiplier;
  }

  if (handbrakePressed) {
    particleState.trailAccumulator += 4;
  }

  particleState.trailRate = trailRate;

  if (boostTriggered) {
    particleState.trailAccumulator += BOOST.triggerTrailBurst;
  }

  if (speed > PARTICLES.trailSpeedThreshold) {
    particleState.trailAccumulator += trailRate * dt;
    while (particleState.trailAccumulator >= 1) {
      particleState.trailAccumulator -= 1;

      const colorMix = Math.random();
      const r = Math.round(80 + 140 * colorMix);
      const g = Math.round(220 + 20 * (1 - colorMix));
      const b = Math.round(255 - 100 * colorMix);

      particlePool.spawn({
        x: baseX + (Math.random() - 0.5) * 6,
        y: baseY + (Math.random() - 0.5) * 6,
        vx: -forwardDir.x * 12 + rightDir.x * (Math.random() - 0.5) * 8,
        vy: -forwardDir.y * 12 + rightDir.y * (Math.random() - 0.5) * 8,
        life: PARTICLES.trailLife * (0.85 + Math.random() * 0.3),
        size: PARTICLES.trailSize * (0.8 + Math.random() * 0.5),
        color: `rgb(${r}, ${g}, ${b})`,
        alpha: PARTICLES.trailAlpha,
      });
    }
  }

  if (!car.driftActive || speed < PARTICLES.sparkMinSpeed) {
    return;
  }

  let sparkRate =
    PARTICLES.sparkRateBase + driftFactor * PARTICLES.sparkRateDrift;
  if (car.handbrake) {
    sparkRate *= 1.2;
  }

  particleState.sparkAccumulator += sparkRate * dt;
  while (particleState.sparkAccumulator >= 1) {
    particleState.sparkAccumulator -= 1;

    const spread = (Math.random() - 0.5) * 1.2;
    const sparkDir = {
      x: -forwardDir.x + rightDir.x * spread,
      y: -forwardDir.y + rightDir.y * spread,
    };
    const sparkSpeed = PARTICLES.sparkSpeed + speed * 0.4;

    particlePool.spawn({
      x: car.position.x - forwardDir.x * PARTICLES.sparkRearOffset,
      y: car.position.y - forwardDir.y * PARTICLES.sparkRearOffset,
      vx: sparkDir.x * sparkSpeed + car.vel.x * 0.2,
      vy: sparkDir.y * sparkSpeed + car.vel.y * 0.2,
      life: PARTICLES.sparkLife * (0.7 + Math.random() * 0.4),
      size: PARTICLES.sparkSize * (0.8 + Math.random() * 0.6),
      color: "rgb(255, 242, 200)",
      alpha: PARTICLES.sparkAlpha,
    });
  }
}

function spawnImpactSparks(impact) {
  const count = Math.floor(6 + impact.strength * 18);
  for (let i = 0; i < count; i += 1) {
    const spread = (Math.random() - 0.5) * 0.7;
    const dirX = -impact.normal.x + impact.normal.y * spread;
    const dirY = -impact.normal.y - impact.normal.x * spread;
    const speed = 160 + Math.random() * 160;

    particlePool.spawn({
      x: impact.position.x + impact.normal.x * 6,
      y: impact.position.y + impact.normal.y * 6,
      vx: dirX * speed,
      vy: dirY * speed,
      life: 0.18 + Math.random() * 0.12,
      size: 2.2 + Math.random() * 1.8,
      color: "rgb(255, 242, 200)",
      alpha: 0.85,
    });
  }
}

function drawProps(propList) {
  if (!assets) {
    return;
  }

  for (let i = 0; i < propList.length; i += 1) {
    const prop = propList[i];
    const image = assets[prop.imageKey];
    if (!image) {
      continue;
    }

    context.save();
    context.translate(prop.position.x, prop.position.y);
    context.rotate(prop.rotation);
    context.globalAlpha = 0.85;
    const width = image.width * prop.scale;
    const height = image.height * prop.scale;
    context.drawImage(image, -width / 2, -height / 2, width, height);
    context.restore();
  }
}

function drawPropGlow(propList) {
  if (!assets) {
    return;
  }

  for (let i = 0; i < propList.length; i += 1) {
    const prop = propList[i];
    const image = assets[prop.imageKey];
    if (!image) {
      continue;
    }

    const flicker =
      0.97 + 0.03 * Math.sin(prop.flickerSeed + performance.now() * 0.003);
    const glowScale = 1.03;

    context.save();
    context.translate(prop.position.x, prop.position.y);
    context.rotate(prop.rotation);
    context.globalAlpha = Math.min(0.6, prop.emissiveStrength * flicker);
    const width = image.width * prop.scale * glowScale;
    const height = image.height * prop.scale * glowScale;
    context.drawImage(image, -width / 2, -height / 2, width, height);
    context.restore();
  }
}

function drawPropDebug(propList) {
  if (!assets) {
    return;
  }

  const districtColors = {
    beach: "rgba(102, 225, 255, 0.55)",
    downtown: "rgba(122, 255, 156, 0.55)",
    neon: "rgba(255, 122, 217, 0.55)",
    harbor: "rgba(255, 210, 111, 0.55)",
  };

  context.save();
  context.lineWidth = 1;
  for (let i = 0; i < propList.length; i += 1) {
    const prop = propList[i];
    const image = assets[prop.imageKey];
    if (!image) {
      continue;
    }
    context.strokeStyle =
      districtColors[prop.districtId] || "rgba(120, 240, 255, 0.45)";
    const radius = Math.max(image.width, image.height) * prop.scale * 0.5;
    context.beginPath();
    context.arc(prop.position.x, prop.position.y, radius, 0, Math.PI * 2);
    context.stroke();
    if (settings.showTrackDebug && prop.isLandmark) {
      context.fillStyle = "rgba(240, 250, 255, 0.85)";
      context.font = "11px 'Segoe UI', system-ui, sans-serif";
      context.textBaseline = "bottom";
      context.fillText(prop.districtId, prop.position.x + 8, prop.position.y - 6);
    }
  }
  context.restore();
}

function drawTrackDebug(renderCarPos) {
  const points = track.centerline;
  const boundaries = track.getBoundaries();
  const inner = boundaries.inner;
  const outer = boundaries.outer;

  context.save();

  context.strokeStyle = "rgba(0, 255, 170, 0.5)";
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i += 1) {
    context.lineTo(points[i].x, points[i].y);
  }
  context.closePath();
  context.stroke();

  if (track.districts?.length) {
    const colors = ["#66e1ff", "#7aff9c", "#ff7ad9", "#ffd26f"];
    for (let i = 0; i < track.districts.length; i += 1) {
      const district = track.districts[i];
      const marker = track.getPointAtProgress(district.startT);
      context.fillStyle = colors[i % colors.length];
      context.beginPath();
      context.arc(marker.point.x, marker.point.y, 6, 0, Math.PI * 2);
      context.fill();
    }
  }

  const finishGate = track.getFinishGate();
  const gatePos = finishGate.gatePos || finishGate.pos;
  const gateNormal = finishGate.gateNormal || finishGate.normal;
  const gateHalfWidth = track.width * 1.05;
  const gateA = {
    x: gatePos.x - gateNormal.x * gateHalfWidth,
    y: gatePos.y - gateNormal.y * gateHalfWidth,
  };
  const gateB = {
    x: gatePos.x + gateNormal.x * gateHalfWidth,
    y: gatePos.y + gateNormal.y * gateHalfWidth,
  };
  context.strokeStyle = "rgba(255, 230, 140, 0.85)";
  context.lineWidth = 3;
  context.beginPath();
  context.moveTo(gateA.x, gateA.y);
  context.lineTo(gateB.x, gateB.y);
  context.stroke();
  context.fillStyle = "rgba(255, 230, 140, 0.95)";
  context.beginPath();
  context.arc(gatePos.x, gatePos.y, 5, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = "rgba(255, 180, 120, 0.9)";
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(gatePos.x, gatePos.y);
  context.lineTo(gatePos.x + gateNormal.x * 40, gatePos.y + gateNormal.y * 40);
  context.stroke();

  const checkpoints = raceState.checkpoints.length
    ? raceState.checkpoints
    : track.getCheckpoints();
  if (checkpoints.length) {
    context.fillStyle = "rgba(120, 255, 220, 0.85)";
    context.strokeStyle = "rgba(120, 255, 220, 0.55)";
    context.font = "12px 'Segoe UI', system-ui, sans-serif";
    context.textBaseline = "middle";
    for (let i = 0; i < checkpoints.length; i += 1) {
      const checkpoint = checkpoints[i];
      context.beginPath();
      context.arc(checkpoint.pos.x, checkpoint.pos.y, 7, 0, Math.PI * 2);
      context.stroke();
      context.fillText(String(i + 1), checkpoint.pos.x + 10, checkpoint.pos.y);
    }
  }

  if (track.waypoints?.length) {
    context.fillStyle = "rgba(230, 240, 255, 0.85)";
    context.strokeStyle = "rgba(230, 240, 255, 0.4)";
    context.font = "11px 'Segoe UI', system-ui, sans-serif";
    context.textBaseline = "middle";
    for (let i = 0; i < track.waypoints.length; i += 1) {
      const wp = track.waypoints[i];
      const isSharp = track.sharpCorners?.includes(i);
      if (isSharp) {
        context.strokeStyle = "rgba(255, 100, 120, 0.75)";
        context.fillStyle = "rgba(255, 100, 120, 0.9)";
      } else {
        context.strokeStyle = "rgba(230, 240, 255, 0.4)";
        context.fillStyle = "rgba(230, 240, 255, 0.85)";
      }
      context.beginPath();
      context.arc(wp.x, wp.y, isSharp ? 6 : 5, 0, Math.PI * 2);
      context.stroke();
      context.fillText(String(i), wp.x + 8, wp.y);
    }
  }

  context.strokeStyle = "rgba(255, 200, 100, 0.6)";
  context.beginPath();
  context.moveTo(inner[0].x, inner[0].y);
  for (let i = 1; i < inner.length; i += 1) {
    context.lineTo(inner[i].x, inner[i].y);
  }
  context.closePath();
  context.stroke();

  context.strokeStyle = "rgba(255, 120, 220, 0.6)";
  context.beginPath();
  context.moveTo(outer[0].x, outer[0].y);
  for (let i = 1; i < outer.length; i += 1) {
    context.lineTo(outer[i].x, outer[i].y);
  }
  context.closePath();
  context.stroke();

  const closest = track.getClosestPoint(renderCarPos);
  context.strokeStyle = "rgba(255, 255, 255, 0.75)";
  context.beginPath();
  context.moveTo(renderCarPos.x, renderCarPos.y);
  context.lineTo(closest.point.x, closest.point.y);
  context.stroke();

  context.restore();
}

function drawVelocityArrow(position, velocity) {
  const speed = Math.hypot(velocity.x, velocity.y);
  if (speed < 1) {
    return;
  }

  const dirX = velocity.x / speed;
  const dirY = velocity.y / speed;
  const arrowLength = clamp(speed * 0.18, 18, 60);
  const endX = position.x + dirX * arrowLength;
  const endY = position.y + dirY * arrowLength;
  const headSize = 6;
  const angle = Math.atan2(dirY, dirX);

  context.save();
  context.strokeStyle = "rgba(0, 255, 170, 0.75)";
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(position.x, position.y);
  context.lineTo(endX, endY);
  context.stroke();

  context.beginPath();
  context.moveTo(endX, endY);
  context.lineTo(
    endX - Math.cos(angle - Math.PI / 6) * headSize,
    endY - Math.sin(angle - Math.PI / 6) * headSize,
  );
  context.lineTo(
    endX - Math.cos(angle + Math.PI / 6) * headSize,
    endY - Math.sin(angle + Math.PI / 6) * headSize,
  );
  context.closePath();
  context.stroke();
  context.restore();
}

function gameLoop(now) {
  let delta = now - state.lastTime;
  state.lastTime = now;

  if (delta > MAX_FRAME_TIME) {
    delta = MAX_FRAME_TIME;
  }

  state.accumulator += delta;

  while (state.accumulator >= FIXED_TIME_STEP) {
    updateFixed();
    state.accumulator -= FIXED_TIME_STEP;
  }

  const alpha = state.accumulator / FIXED_TIME_STEP;
  render(alpha);

  updateFps(now);
  endFrame();
  requestAnimationFrame(gameLoop);
}

function updateFps(now) {
  state.fpsFrameCount += 1;
  const elapsed = now - state.fpsLastTime;

  if (elapsed >= 500) {
    state.fps = (state.fpsFrameCount / elapsed) * 1000;
    state.fpsFrameCount = 0;
    state.fpsLastTime = now;
  }
}

function drawLoadingScreen(message = "Loading...") {
  context.clearRect(0, 0, state.width, state.height);
  context.save();
  context.fillStyle = "#05060b";
  context.fillRect(0, 0, state.width, state.height);
  context.fillStyle = "rgba(207, 232, 255, 0.9)";
  context.font = "20px 'Segoe UI', system-ui, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(message, state.width / 2, state.height / 2);
  context.restore();
}

async function loadGameAssets() {
  const manifest = {
    playerCar: "assets/cars/player_car.png",
    npcSedan: "assets/cars/npc_sedan.png",
    npcCoupe: "assets/cars/npc_coupe.png",
    npcMuscle: "assets/cars/npc_muscle.png",
    npcTaxi: "assets/cars/npc_taxi.png",
    npcBike: "assets/cars/npc_bike.png",
    skyBeach: "assets/skylines/miami_beach_causeway_skyline.png",
    skyDowntown: "assets/skylines/miami_downtown_grid_skyline.png",
    skyNeon: "assets/skylines/miami_neon_alley_skyline.png",
    skyHarbor: "assets/skylines/miami_harbor_run_skyline.png",
    skyMetro: "assets/skylines/miami_metro_skyline.png",
    asphalt: "assets/ashphalt_tile.png",
    viceCity: "assets/vice_city_neon_sign.png",
    palmTree: "assets/palm_tree_neon_sign.png",
    flamingo: "assets/flamingo_neon_sign.png",
    neonDistrict: "assets/neon_district_billboard.png",
    abstractArrows: "assets/abstract_neon_arrows.png",
    open24h: "assets/open_24h_retro_sign.png",
    artDecoHotel: "assets/art_deco_hotel_sign.png",
    neonSkull: "assets/neon_skull.png",
  };

  assets = await loadAssets(manifest);
  asphaltPattern = context.createPattern(assets.asphalt, "repeat");
  asphaltPatternScale = ROAD_PATTERN_SCALE;
  if (asphaltPattern && asphaltPattern.setTransform) {
    try {
      asphaltPattern.setTransform(new DOMMatrix().scale(ROAD_PATTERN_SCALE));
    } catch {
      asphaltPatternScale = 1;
    }
  } else {
    asphaltPatternScale = asphaltPattern ? 1 : 0;
  }
  props = generateProps(track, 202602);
  landmarks = generateLandmarks(track, 5067);
  boostPads = ensureBoostPads(track, generateBoostPads(track));
  trafficState.system = createTrafficSystem(track, 77123);
  trafficState.carSprites = trafficState.system.cars.map(
    (car) => ["npcSedan", "npcCoupe", "npcMuscle", "npcTaxi", "npcBike"][car.id % 5],
  );
  resetToStart();
}

drawLoadingScreen("Loading assets...");
loadGameAssets().then(() => {
  requestAnimationFrame(gameLoop);
});
