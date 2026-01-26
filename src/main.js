import { isDown, wasPressed, endFrame } from "./input.js";
import { createVec2, clamp, lerp } from "./math.js";

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
};

const app = document.getElementById("app");
const canvas = document.createElement("canvas");
const context = canvas.getContext("2d");

app.appendChild(canvas);

const carImage = new Image();
let carImageReady = false;
let useSprite = true;

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

  updateCarPhysics(dt);

  const cameraFollow = 1 - Math.exp(-5 * dt);
  camera.position.x = lerp(camera.position.x, car.position.x, cameraFollow);
  camera.position.y = lerp(camera.position.y, car.position.y, cameraFollow);
}

function render(alpha) {
  context.clearRect(0, 0, state.width, state.height);

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
  context.fillStyle = "#05060b";
  context.fillRect(0, 0, state.width, state.height);
  context.restore();

  context.save();
  context.translate(state.width / 2 - renderCamera.x, state.height / 2 - renderCamera.y);

  drawBackgroundGrid(renderCamera);
  drawTrack();
  if (useSprite) {
    drawCarSprite(renderCarPos, renderHeading);
  } else {
    drawCarPlaceholder(renderCarPos, renderHeading);
  }
  drawVelocityArrow(renderCarPos, {
    x: lerp(car.prevVel.x, car.vel.x, alpha),
    y: lerp(car.prevVel.y, car.vel.y, alpha),
  });

  context.restore();

  drawHud(renderCamera);
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
  const centerX = 0;
  const centerY = 0;
  const radiusX = 520;
  const radiusY = 320;

  context.save();
  context.beginPath();
  context.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2);
  context.strokeStyle = "#11141d";
  context.lineWidth = 140;
  context.lineCap = "round";
  context.stroke();

  context.strokeStyle = "rgba(0, 210, 255, 0.45)";
  context.lineWidth = 4;
  context.stroke();
  context.restore();
}

function drawCarSprite(position, heading) {
  if (!carImageReady) {
    return;
  }

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

  context.save();
  context.fillStyle = "rgba(207, 232, 255, 0.9)";
  context.font = "14px 'Segoe UI', system-ui, sans-serif";
  context.textBaseline = "top";
  context.fillText(`FPS: ${state.fps.toFixed(0)}`, 16, 12);
  context.fillText(`Neon Drift Runner ${VERSION}`, 16, 30);
  context.fillText(`Speed: ${car.speed.toFixed(1)} u/s`, 16, 50);
  context.fillText(`Heading: ${headingDeg.toFixed(1)}°`, 16, 68);
  context.fillText(`Vel Dir: ${velDeg.toFixed(1)}°`, 16, 86);
  context.fillText(`Drift: ${driftDeg.toFixed(1)}°`, 16, 104);
  context.fillText(`Drift Active: ${car.driftActive}`, 16, 122);
  context.fillText(
    `Camera: ${renderCamera.x.toFixed(1)}, ${renderCamera.y.toFixed(1)}`,
    16,
    140,
  );
  context.restore();
}

function lerpAngle(a, b, t) {
  const delta = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + delta * t;
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

  const speed = Math.hypot(car.vel.x, car.vel.y);
  const speedNorm = clamp(speed / PHYSICS.maxSpeedForward, 0, 1);
  const steerRate = lerp(PHYSICS.steerRateMin, PHYSICS.steerRateMax, speedNorm);

  car.heading += car.steerInput * steerRate * dt;

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

  car.position.x += car.vel.x * dt;
  car.position.y += car.vel.y * dt;

  car.speed = Math.hypot(car.vel.x, car.vel.y);
  car.velAngle = car.speed > 0.001 ? Math.atan2(car.vel.y, car.vel.x) : car.heading;
  car.driftAngle =
    car.speed > PHYSICS.minDriftSpeed
      ? smallestAngleBetween(car.heading, car.velAngle)
      : 0;
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

function drawLoadingScreen() {
  context.clearRect(0, 0, state.width, state.height);
  context.save();
  context.fillStyle = "#05060b";
  context.fillRect(0, 0, state.width, state.height);
  context.fillStyle = "rgba(207, 232, 255, 0.9)";
  context.font = "20px 'Segoe UI', system-ui, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText("Loading...", state.width / 2, state.height / 2);
  context.restore();
}

async function loadCarSprite() {
  carImage.src = "assets/car.png";
  if (carImage.decode) {
    await carImage.decode();
  } else {
    await new Promise((resolve, reject) => {
      carImage.onload = () => resolve();
      carImage.onerror = reject;
    });
  }
  carImageReady = true;
}

drawLoadingScreen();
loadCarSprite().then(() => {
  requestAnimationFrame(gameLoop);
});
