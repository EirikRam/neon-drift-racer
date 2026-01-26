import { isDown, wasPressed, endFrame } from "./input.js";
import { createVec2, clamp, lerp } from "./math.js";
import { ParticlePool } from "./particles.js";
import { track } from "./track.js";
import { loadAssets } from "./assets.js";
import { generateProps } from "./props.js";
import { renderHUD, renderHelpOverlay } from "./ui.js";

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

const app = document.getElementById("app");
const canvas = document.createElement("canvas");
const context = canvas.getContext("2d");

app.appendChild(canvas);

let assets = null;
let carImageReady = false;
let roadPattern = null;
let props = [];
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
  showHelp: false,
};

const particlePool = new ParticlePool(PARTICLES.maxCount);
const particleState = {
  trailAccumulator: 0,
  sparkAccumulator: 0,
  trailRate: 0,
};

const state = {
  width: 0,
  height: 0,
  accumulator: 0,
  lastTime: performance.now(),
  fps: 0,
  fpsFrameCount: 0,
  fpsLastTime: performance.now(),
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
};

const camera = {
  position: createVec2(0, 0),
  prevPosition: createVec2(0, 0),
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

function updateFixed() {
  const dt = FIXED_TIME_STEP / 1000;

  car.prevPosition.x = car.position.x;
  car.prevPosition.y = car.position.y;
  car.prevVel.x = car.vel.x;
  car.prevVel.y = car.vel.y;
  car.prevHeading = car.heading;

  camera.prevPosition.x = camera.position.x;
  camera.prevPosition.y = camera.position.y;

  if (wasPressed("KeyR")) {
    car.position.x = 0;
    car.position.y = 0;
    car.heading = 0;
    car.vel.x = 0;
    car.vel.y = 0;
    car.speed = 0;
    car.driftAngle = 0;
    car.driftActive = false;
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

  if (wasPressed("F1") || (wasPressed("Slash") && isDown("Shift"))) {
    settings.showHelp = !settings.showHelp;
  }

  updateCarPhysics(dt);
  updateParticles(dt, wasPressed("Space"));

  const cameraFollow = 1 - Math.exp(-5 * dt);
  camera.position.x = lerp(camera.position.x, car.position.x, cameraFollow);
  camera.position.y = lerp(camera.position.y, car.position.y, cameraFollow);
}

function render(alpha) {
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

  context.save();
  if (settings.showSkyline) {
    drawSkyline(renderCamera);
  }
  context.translate(state.width / 2 - renderCamera.x, state.height / 2 - renderCamera.y);

  drawBackgroundGrid(renderCamera);
  drawTrack();
  if (settings.showNeonProps) {
    drawProps(props);
  }
  if (useSprite) {
    drawCarSprite(renderCarPos, renderHeading);
  } else {
    drawCarPlaceholder(renderCarPos, renderHeading);
  }
  drawVelocityArrow(renderCarPos, {
    x: lerp(car.prevVel.x, car.vel.x, alpha),
    y: lerp(car.prevVel.y, car.vel.y, alpha),
  });
  if (settings.showPropDebug) {
    drawPropDebug(props);
  }

  if (settings.showGlow) {
    context.save();
    context.globalCompositeOperation = "lighter";
    if (settings.showParticles) {
      particlePool.render(context);
    }
    if (settings.showNeonProps) {
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

  drawHud(renderCamera);
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
  });
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
  context.beginPath();
  context.moveTo(outer[0].x, outer[0].y);
  for (let i = 1; i < outer.length; i += 1) {
    context.lineTo(outer[i].x, outer[i].y);
  }
  for (let i = inner.length - 1; i >= 0; i -= 1) {
    context.lineTo(inner[i].x, inner[i].y);
  }
  context.closePath();

  context.lineJoin = "round";
  context.lineCap = "round";

  context.save();
  context.clip();
  context.fillStyle = roadPattern || "#121722";
  context.fillRect(-5000, -5000, 10000, 10000);
  context.restore();

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

function drawCarSprite(position, heading) {
  if (!carImageReady || !assets) {
    return;
  }

  const carImage = assets.car;
  const spriteWidth = 64;
  const spriteHeight = (carImage.height / carImage.width) * spriteWidth;
  const rotationOffset = -Math.PI / 2;

  context.save();
  context.translate(position.x, position.y);
  context.rotate(heading + rotationOffset);
  context.drawImage(
    carImage,
    -spriteWidth / 2,
    -spriteHeight / 2,
    spriteWidth,
    spriteHeight,
  );
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

function drawHud(renderCamera) {
  const headingDeg = ((car.heading * 180) / Math.PI + 360) % 360;
  const driftDeg = (car.driftAngle * 180) / Math.PI;
  const velDeg = ((car.velAngle * 180) / Math.PI + 360) % 360;
  const particleCount = particlePool.activeCount;
  const roadStatus = car.onRoad ? "On Road" : "Off Road";
  const propCount = props.length;

  renderHUD(context, {
    fps: state.fps,
    version: VERSION,
    speed: car.speed,
    headingDeg,
    velDeg,
    driftDeg,
    driftActive: car.driftActive,
    particleCount,
    trailRate: particleState.trailRate,
    roadStatus,
    showPropDebug: settings.showPropDebug,
    propCount,
    cameraX: renderCamera.x,
    cameraY: renderCamera.y,
  });
}

function lerpAngle(a, b, t) {
  const delta = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + delta * t;
}

function drawSkyline(renderCamera) {
  if (!assets) {
    return;
  }

  const skyline = assets.skyline;
  const parallax = 0.2;
  const skyTop = 0;
  const skyHeight = state.height * 0.55;
  const skylineY = state.height * 0.2;

  context.save();
  const gradient = context.createLinearGradient(0, skyTop, 0, skyHeight);
  gradient.addColorStop(0, "#0c0b2f");
  gradient.addColorStop(1, "#05060b");
  context.fillStyle = gradient;
  context.fillRect(0, 0, state.width, skyHeight);

  const offsetX = -(renderCamera.x * parallax) % skyline.width;
  const drawY = skylineY;
  const startX = offsetX - skyline.width;
  for (let x = startX; x < state.width + skyline.width; x += skyline.width) {
    context.drawImage(skyline, x, drawY);
  }
  context.restore();
}

function smallestAngleBetween(a, b) {
  return Math.atan2(Math.sin(b - a), Math.cos(b - a));
}

function updateCarPhysics(dt) {
  const throttle = isDown("KeyW") || isDown("ArrowUp");
  const brake = isDown("KeyS") || isDown("ArrowDown");
  const steerLeft = isDown("KeyA") || isDown("ArrowLeft");
  const steerRight = isDown("KeyD") || isDown("ArrowRight");

  car.throttleInput = clamp((throttle ? 1 : 0) - (brake ? 1 : 0), -1, 1);
  car.steerInput = clamp((steerRight ? 1 : 0) - (steerLeft ? 1 : 0), -1, 1);
  car.handbrake = isDown("Space");

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

  let accel = 0;
  if (car.throttleInput > 0) {
    accel = PHYSICS.engineAccel * car.throttleInput;
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
  const forwardDrag = car.driftActive ? PHYSICS.forwardDrag * 0.6 : PHYSICS.forwardDrag;

  vl *= Math.exp(-lateralDamp * dt);
  vf *= Math.exp(-forwardDrag * dt);

  vf = clamp(vf, -PHYSICS.maxSpeedReverse, PHYSICS.maxSpeedForward);

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

function updateParticles(dt, handbrakePressed) {
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

  if (handbrakePressed) {
    particleState.trailAccumulator += 4;
  }

  particleState.trailRate = trailRate;

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

  context.save();
  context.strokeStyle = "rgba(120, 240, 255, 0.45)";
  context.lineWidth = 1;
  for (let i = 0; i < propList.length; i += 1) {
    const prop = propList[i];
    const image = assets[prop.imageKey];
    if (!image) {
      continue;
    }
    const radius = Math.max(image.width, image.height) * prop.scale * 0.5;
    context.beginPath();
    context.arc(prop.position.x, prop.position.y, radius, 0, Math.PI * 2);
    context.stroke();
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
    car: "assets/car.png",
    asphalt: "assets/ashphalt_tile.png",
    skyline: "assets/miami_skyline.png",
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
  carImageReady = true;
  roadPattern = context.createPattern(assets.asphalt, "repeat");
  props = generateProps(track, 202602);
}

drawLoadingScreen("Loading assets...");
loadGameAssets().then(() => {
  requestAnimationFrame(gameLoop);
});
