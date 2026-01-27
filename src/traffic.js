import { clamp, lerp } from "./math.js";
import { CAR_RENDER_SIZE } from "./carRender.js";

const DEFAULT_SETTINGS = {
  trafficCount: 200,
  maxCount: 500,
  minSpeed: 160,
  maxSpeed: 320,
  minSpacing: 170,
  positionFollow: 8,
  speedFollow: 2.8,
  laneFactor: 0.55,
  spawnJitter: 0.35,
  spawnAttempts: 30,
  spawnPassBMaxAttempts: 1500,
  exclusionZone: 0.04,
  bubbleCount: 40,
  bubbleRange: 0.1,
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

function getLaneCenters(trackWidth, laneFactor) {
  const laneMargin = CAR_RENDER_SIZE * 0.7;
  const laneMax = Math.max(0, trackWidth - laneMargin);
  const laneCenter = laneMax * laneFactor;
  return { laneMax, centers: [-laneCenter, laneCenter] };
}

export function createTrafficSystem(track, seed = 424242, overrides = {}) {
  const settings = { ...DEFAULT_SETTINGS, ...overrides };
  const rng = mulberry32(seed);
  const { laneMax, centers } = getLaneCenters(track.width, settings.laneFactor);
  const targetCount = Math.min(settings.trafficCount, settings.maxCount);
  const laneMaxCapActive = laneMax < CAR_RENDER_SIZE * 0.5;
  const trafficCount = targetCount;
  const spawnAttempts = Math.max(
    settings.spawnAttempts,
    trafficCount >= 80 ? 40 : 20,
  );
  const passBAttempts = Math.max(
    settings.spawnPassBMaxAttempts,
    trafficCount * 12,
  );
  const cars = [];
  const radius = CAR_RENDER_SIZE * 0.38;
  const playerStartProgress = track.getProgressAlongTrack({ x: 0, y: 0 });
  const minProgressSep = clamp(settings.minSpacing / track.totalLength, 0.01, 0.12);
  const spawnStats = {
    targetCount: trafficCount,
    settingsTrafficCount: settings.trafficCount,
    settingsMaxCount: settings.maxCount,
    laneMax,
    trackWidth: track.width,
    laneMargin: CAR_RENDER_SIZE * 0.7,
    laneMaxCapActive,
    centersCount: centers.length,
    minProgressSep,
    attempted: 0,
    accepted: 0,
    rejectedOverlap: 0,
    rejectedProgress: 0,
    rejectedOffRoad: 0,
    rejectedOther: 0,
    bubbleTarget: settings.bubbleCount,
    bubbleCreated: 0,
    bubbleFound: 0,
    generatedCount: 0,
  };

  for (let i = 0; i < trafficCount; i += 1) {
    const baseSpeed = lerp(settings.minSpeed, settings.maxSpeed, rng());
    let placed = false;
    for (let attempt = 0; attempt < spawnAttempts; attempt += 1) {
      const jitter = (rng() - 0.5) * (settings.spawnJitter / trafficCount);
      const baseProgress = (i + 0.5) / trafficCount;
      let progress = (baseProgress + jitter + attempt * 0.013) % 1;
      if (progress < 0) {
        progress += 1;
      }
      const laneIndex = (i + attempt) % centers.length;
      const laneOffset = clampLaneOffset(centers[laneIndex], laneMax);
      if (
        trySpawnCar(
          i,
          progress,
          laneIndex,
          laneOffset,
          baseSpeed,
          minProgressSep,
          settings.minSpacing,
        )
      ) {
        placed = true;
        break;
      }
    }
    if (!placed) {
      const laneIndex = i % centers.length;
      const laneOffset = clampLaneOffset(centers[laneIndex], laneMax);
      cars.push(
        createTrafficCar(
          i,
          (i / trafficCount) % 1,
          laneIndex,
          laneOffset,
          baseSpeed,
          radius,
        ),
      );
      spawnStats.rejectedOther += 1;
    }
  }

  if (cars.length < trafficCount) {
    const relaxProgressSep = minProgressSep * 0.8;
    const relaxSpacing = settings.minSpacing * 0.85;
    for (let attempt = 0; attempt < passBAttempts; attempt += 1) {
      if (cars.length >= trafficCount) {
        break;
      }
      let progress = rng();
      const laneIndex = attempt % centers.length;
      const laneOffset = clampLaneOffset(centers[laneIndex] * 0.6, laneMax);
      if (
        trySpawnCar(
          cars.length,
          progress,
          laneIndex,
          laneOffset,
          lerp(settings.minSpeed, settings.maxSpeed, rng()),
          relaxProgressSep,
          relaxSpacing,
        )
      ) {
        continue;
      }
    }
  }

  const bubbleRange = settings.bubbleRange;
  const bubbleTarget = Math.min(
    Math.max(settings.bubbleCount, trafficCount >= 120 ? 40 : 12),
    settings.maxCount,
  );
  spawnStats.bubbleTarget = bubbleTarget;
  spawnStats.bubbleFound = countCarsInBubble(cars, playerStartProgress, bubbleRange, settings.exclusionZone);
  let bubbleTries = 0;
  while (spawnStats.bubbleFound < bubbleTarget && cars.length < settings.maxCount && bubbleTries < 600) {
    bubbleTries += 1;
    const offset = (rng() * 2 - 1) * bubbleRange;
    let progress = (playerStartProgress + offset + 1) % 1;
    const deltaToPlayer = Math.min(
      (progress - playerStartProgress + 1) % 1,
      (playerStartProgress - progress + 1) % 1,
    );
    if (deltaToPlayer < settings.exclusionZone) {
      spawnStats.rejectedProgress += 1;
      continue;
    }
    const laneIndex = bubbleTries % centers.length;
    const laneOffset = clampLaneOffset(centers[laneIndex] * 0.85, laneMax);
    if (
      trySpawnCar(
        cars.length,
        progress,
        laneIndex,
        laneOffset,
        lerp(settings.minSpeed, settings.maxSpeed, rng()),
        minProgressSep * 0.9,
        settings.minSpacing * 0.9,
      )
    ) {
      spawnStats.bubbleCreated += 1;
      spawnStats.bubbleFound = countCarsInBubble(cars, playerStartProgress, bubbleRange, settings.exclusionZone);
    }
  }

  for (const car of cars) {
    const sample = track.getPointAtProgress(car.progress);
    car.laneOffset = ensureOnRoadOffset(track, sample, car.laneOffset, laneMax);
    car.pos.x = sample.point.x + sample.normal.x * car.laneOffset;
    car.pos.y = sample.point.y + sample.normal.y * car.laneOffset;
    car.heading = Math.atan2(sample.tangent.y, sample.tangent.x);
  }

  spawnStats.generatedCount = cars.length;

  return {
    cars,
    laneMax,
    settings,
    spawnStats,
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

  function trySpawnCar(id, progress, laneIndex, laneOffset, baseSpeed, progressSep, spacingForSpawn) {
    spawnStats.attempted += 1;
    const deltaToPlayer = Math.min(
      (progress - playerStartProgress + 1) % 1,
      (playerStartProgress - progress + 1) % 1,
    );
    if (deltaToPlayer < settings.exclusionZone) {
      spawnStats.rejectedProgress += 1;
      return false;
    }

    const sample = track.getPointAtProgress(progress);
    const safeOffset = ensureOnRoadOffset(track, sample, laneOffset, laneMax);
    const position = {
      x: sample.point.x + sample.normal.x * safeOffset,
      y: sample.point.y + sample.normal.y * safeOffset,
    };
    if (!track.isOnRoad(position)) {
      spawnStats.rejectedOffRoad += 1;
      return false;
    }

    for (let j = 0; j < cars.length; j += 1) {
      const other = cars[j];
      const gap = Math.min(
        (progress - other.progress + 1) % 1,
        (other.progress - progress + 1) % 1,
      );
      if (gap < progressSep) {
        spawnStats.rejectedProgress += 1;
        return false;
      }
      const dx = other.pos.x - position.x;
      const dy = other.pos.y - position.y;
      const minDist = (radius + other.radius) ** 2;
      if (dx * dx + dy * dy < minDist) {
        spawnStats.rejectedOverlap += 1;
        return false;
      }
      if (spacingForSpawn) {
        const dist = Math.hypot(dx, dy);
        if (dist < spacingForSpawn * 0.5) {
          spawnStats.rejectedOverlap += 1;
          return false;
        }
      }
    }

    const car = createTrafficCar(id, progress, laneIndex, safeOffset, baseSpeed, radius);
    car.pos.x = position.x;
    car.pos.y = position.y;
    car.heading = Math.atan2(sample.tangent.y, sample.tangent.x);
    cars.push(car);
    spawnStats.accepted += 1;
    return true;
  }
}

function countCarsInBubble(cars, playerProgress, range, exclusionZone) {
  let count = 0;
  for (let i = 0; i < cars.length; i += 1) {
    const progress = cars[i].progress;
    const delta = Math.min(
      (progress - playerProgress + 1) % 1,
      (playerProgress - progress + 1) % 1,
    );
    if (delta >= exclusionZone && delta <= range) {
      count += 1;
    }
  }
  return count;
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
