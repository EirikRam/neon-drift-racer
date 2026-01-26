import { createVec2, clamp } from "./math.js";

const BOOST_CONSTANTS = {
  minPads: 6,
  maxPads: 10,
  minSpacing: 420,
  baseRadius: 36,
  baseStrength: 1.35,
  baseDuration: 0.9,
  baseCooldown: 4,
};

function mulberry32(seed) {
  return function random() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function getTangent(points, index) {
  const prevIndex = (index - 1 + points.length) % points.length;
  const nextIndex = (index + 1) % points.length;
  const prev = points[prevIndex];
  const next = points[nextIndex];
  const tx = next.x - prev.x;
  const ty = next.y - prev.y;
  const len = Math.hypot(tx, ty) || 1;
  return { x: tx / len, y: ty / len };
}

function getCurvature(points, index) {
  const prevIndex = (index - 1 + points.length) % points.length;
  const nextIndex = (index + 1) % points.length;
  const prev = points[prevIndex];
  const curr = points[index];
  const next = points[nextIndex];
  const ax = curr.x - prev.x;
  const ay = curr.y - prev.y;
  const bx = next.x - curr.x;
  const by = next.y - curr.y;
  const aLen = Math.hypot(ax, ay) || 1;
  const bLen = Math.hypot(bx, by) || 1;
  const dot = (ax * bx + ay * by) / (aLen * bLen);
  return 1 - clamp(dot, -1, 1);
}

function distanceSq(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

export function generateBoostPads(track, seed = 2401) {
  const rng = mulberry32(seed);
  const points = track.centerline;
  const candidates = [];

  for (let i = 0; i < points.length; i += 1) {
    const curvature = getCurvature(points, i);
    candidates.push({ index: i, weight: curvature });
  }

  candidates.sort((a, b) => b.weight - a.weight);

  const targetCount =
    BOOST_CONSTANTS.minPads +
    Math.floor(rng() * (BOOST_CONSTANTS.maxPads - BOOST_CONSTANTS.minPads + 1));

  const pads = [];
  const minSpacingSq = BOOST_CONSTANTS.minSpacing ** 2;

  for (let i = 0; i < candidates.length && pads.length < targetCount; i += 1) {
    const candidate = candidates[i];
    if (rng() < 0.35 && i > points.length * 0.15) {
      continue;
    }

    const base = points[candidate.index];
    const tangent = getTangent(points, candidate.index);
    const offset = 20 + rng() * 40;
    const position = createVec2(
      base.x + tangent.x * offset,
      base.y + tangent.y * offset,
    );

    let tooClose = false;
    for (let j = 0; j < pads.length; j += 1) {
      if (distanceSq(position, pads[j].position) < minSpacingSq) {
        tooClose = true;
        break;
      }
    }
    if (tooClose) {
      continue;
    }

    pads.push({
      position,
      radius: BOOST_CONSTANTS.baseRadius,
      strength: BOOST_CONSTANTS.baseStrength,
      duration: BOOST_CONSTANTS.baseDuration,
      cooldown: BOOST_CONSTANTS.baseCooldown,
      cooldownTimer: 0,
    });
  }

  return pads;
}

export function updateBoostPads(car, pads, dt) {
  let triggered = null;

  for (let i = 0; i < pads.length; i += 1) {
    const pad = pads[i];
    if (pad.cooldownTimer > 0) {
      pad.cooldownTimer = Math.max(0, pad.cooldownTimer - dt);
    }

    if (pad.cooldownTimer > 0) {
      continue;
    }

    const dx = car.position.x - pad.position.x;
    const dy = car.position.y - pad.position.y;
    const distSq = dx * dx + dy * dy;
    if (distSq <= pad.radius * pad.radius) {
      pad.cooldownTimer = pad.cooldown;
      triggered = {
        pad,
        position: pad.position,
      };
    }
  }

  return triggered;
}

export const BOOST_CONFIG = BOOST_CONSTANTS;
