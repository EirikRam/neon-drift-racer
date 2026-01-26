import { clamp, lerp } from "./math.js";
import { CAR_RENDER_SIZE } from "./carRender.js";

const DEFAULT_SETTINGS = {
  trafficCount: 10,
  minSpeed: 160,
  maxSpeed: 320,
  minSpacing: 180,
  positionFollow: 8,
  speedFollow: 2.8,
  laneFactor: 0.55,
};

function mulberry32(seed) {
  return function random() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function createTrafficCar(id, progress, laneIndex, laneOffset, baseSpeed, radius) {
  return {
    id,
    progress,
    laneIndex,
    laneOffset,
    desiredSpeed: baseSpeed,
    speed: baseSpeed,
    baseSpeed,
    heading: 0,
    pos: { x: 0, y: 0 },
    vel: { x: 0, y: 0 },
    radius,
    mass: 0.6,
    knockbackTimer: 0,
    knockbackVelScale: 1,
    speedHoldTimer: 0,
    nearMissCooldown: 0,
  };
}

function clampLaneOffset(offset, laneMax) {
  if (laneMax <= 0) {
    return 0;
  }
  return clamp(offset, -laneMax, laneMax);
}

function ensureOnRoadOffset(track, sample, laneOffset, laneMax) {
  let adjusted = clampLaneOffset(laneOffset, laneMax);
  let attempts = 0;
  while (attempts < 6) {
    const targetPos = {
      x: sample.point.x + sample.normal.x * adjusted,
      y: sample.point.y + sample.normal.y * adjusted,
    };
    if (track.isOnRoad(targetPos)) {
      return adjusted;
    }
    adjusted *= 0.7;
    attempts += 1;
  }
  return clampLaneOffset(adjusted, laneMax);
}

function getLaneCenters(trackWidth) {
  const laneMargin = CAR_RENDER_SIZE * 0.7;
  const laneMax = Math.max(0, trackWidth - laneMargin);
  const laneCenter = laneMax * DEFAULT_SETTINGS.laneFactor;
  return { laneMax, centers: [-laneCenter, laneCenter] };
}

export function createTrafficSystem(track, seed = 424242, overrides = {}) {
  const settings = { ...DEFAULT_SETTINGS, ...overrides };
  const rng = mulberry32(seed);
  const { laneMax, centers } = getLaneCenters(track.width);
  const trafficCount =
    laneMax < CAR_RENDER_SIZE * 0.5
      ? Math.min(settings.trafficCount, 6)
      : settings.trafficCount;
  const cars = [];
  const radius = CAR_RENDER_SIZE * 0.38;

  for (let i = 0; i < trafficCount; i += 1) {
    const progress = (i / trafficCount + rng() * 0.08) % 1;
    const laneIndex = i % centers.length;
    const laneOffset = clampLaneOffset(centers[laneIndex], laneMax);
    const baseSpeed = lerp(settings.minSpeed, settings.maxSpeed, rng());
    cars.push(createTrafficCar(i, progress, laneIndex, laneOffset, baseSpeed, radius));
  }

  for (const car of cars) {
    const sample = track.getPointAtProgress(car.progress);
    car.laneOffset = ensureOnRoadOffset(track, sample, car.laneOffset, laneMax);
    car.pos.x = sample.point.x + sample.normal.x * car.laneOffset;
    car.pos.y = sample.point.y + sample.normal.y * car.laneOffset;
    car.heading = Math.atan2(sample.tangent.y, sample.tangent.x);
  }

  return {
    cars,
    laneMax,
    settings,
    update(dt) {
      updateSpacing(track, cars, settings);
      for (let i = 0; i < cars.length; i += 1) {
        const car = cars[i];
        car.nearMissCooldown = Math.max(0, car.nearMissCooldown - dt);
        car.speedHoldTimer = Math.max(0, car.speedHoldTimer - dt);
        const speedHoldScale = car.speedHoldTimer > 0 ? 0.85 : 1;
        const speedTarget = car.desiredSpeed * speedHoldScale;
        car.speed += (speedTarget - car.speed) * (1 - Math.exp(-settings.speedFollow * dt));
        car.progress = (car.progress + (car.speed / track.totalLength) * dt) % 1;

        const sample = track.getPointAtProgress(car.progress);
        car.laneOffset = ensureOnRoadOffset(track, sample, car.laneOffset, laneMax);
        const targetPos = {
          x: sample.point.x + sample.normal.x * car.laneOffset,
          y: sample.point.y + sample.normal.y * car.laneOffset,
        };
        const follow = 1 - Math.exp(-settings.positionFollow * dt);
        if (car.knockbackTimer > 0) {
          car.knockbackTimer = Math.max(0, car.knockbackTimer - dt);
          const toTargetX = targetPos.x - car.pos.x;
          const toTargetY = targetPos.y - car.pos.y;
          const desiredVelX = toTargetX / Math.max(dt, 0.0001);
          const desiredVelY = toTargetY / Math.max(dt, 0.0001);
          const steerBlend = follow * 0.35;
          const damp = Math.exp(-2.4 * dt * car.knockbackVelScale);
          car.vel.x = lerp(car.vel.x, desiredVelX, steerBlend) * damp;
          car.vel.y = lerp(car.vel.y, desiredVelY, steerBlend) * damp;
          car.pos.x += car.vel.x * dt;
          car.pos.y += car.vel.y * dt;
          if (!track.isOnRoad(car.pos)) {
            const recover = follow * 0.6;
            car.pos.x = lerp(car.pos.x, targetPos.x, recover);
            car.pos.y = lerp(car.pos.y, targetPos.y, recover);
          }
        } else {
          const prevX = car.pos.x;
          const prevY = car.pos.y;
          car.pos.x = lerp(car.pos.x, targetPos.x, follow);
          car.pos.y = lerp(car.pos.y, targetPos.y, follow);
          car.vel.x = (car.pos.x - prevX) / Math.max(dt, 0.0001);
          car.vel.y = (car.pos.y - prevY) / Math.max(dt, 0.0001);
        }
        car.heading = Math.atan2(sample.tangent.y, sample.tangent.x);
      }
    },
  };
}

function updateSpacing(track, cars, settings) {
  if (cars.length === 0) {
    return;
  }

  const byLane = new Map();
  for (const car of cars) {
    const list = byLane.get(car.laneIndex) || [];
    list.push(car);
    byLane.set(car.laneIndex, list);
  }

  for (const list of byLane.values()) {
    list.sort((a, b) => a.progress - b.progress);
    for (let i = 0; i < list.length; i += 1) {
      const car = list[i];
      const ahead = list[(i + 1) % list.length];
      const gapProgress = (ahead.progress - car.progress + 1) % 1;
      let gapDistance = gapProgress * track.totalLength;
      if (
        Number.isFinite(car.pos.x) &&
        Number.isFinite(car.pos.y) &&
        Number.isFinite(ahead.pos.x) &&
        Number.isFinite(ahead.pos.y)
      ) {
        const dx = ahead.pos.x - car.pos.x;
        const dy = ahead.pos.y - car.pos.y;
        const directDist = Math.hypot(dx, dy);
        if (Number.isFinite(directDist)) {
          gapDistance = Math.min(gapDistance, directDist);
        }
      }
      const spacingRatio = clamp(gapDistance / settings.minSpacing, 0.35, 1);
      const targetSpeed = car.baseSpeed * spacingRatio;
      car.desiredSpeed += (targetSpeed - car.desiredSpeed) * 0.12;
    }
  }
}
