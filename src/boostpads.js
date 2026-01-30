import { createVec2 } from "./math.js";

export const BOOST_PAD_TS = [
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

const BOOST_PAD_CONFIG = {
  radius: 34,
  triggerRadius: 140,
  duration: 0.95,
  cooldown: 2.0,
  strength: 1.0,
};

export function generateBoostPads(track) {
  return BOOST_PAD_TS.map((t, index) => {
    const sample = track.getPointAtProgress(t);
    return {
      id: index,
      t,
      position: createVec2(sample.point.x, sample.point.y),
      tangent: sample.tangent,
      normal: sample.normal,
      radius: BOOST_PAD_CONFIG.radius,
      triggerRadius: BOOST_PAD_CONFIG.triggerRadius,
      strength: BOOST_PAD_CONFIG.strength,
      duration: BOOST_PAD_CONFIG.duration,
      cooldown: BOOST_PAD_CONFIG.cooldown,
      cooldownTimer: 0,
    };
  });
}

export function updateBoostPads(
  car,
  pads,
  dt,
  phase,
  lapProgress,
  prevLapProgress,
  boostConfig,
) {
  const triggered = [];
  const playerWorldPos = car.position;
  const padsLen = Array.isArray(pads) ? pads.length : 0;
  let nearestIndex = -1;
  let nearestDistSq = Number.POSITIVE_INFINITY;
  if (padsLen && playerWorldPos) {
    for (let i = 0; i < padsLen; i += 1) {
      const pad = pads[i];
      if (!pad || !pad.position) {
        continue;
      }
      const dx = playerWorldPos.x - pad.position.x;
      const dy = playerWorldPos.y - pad.position.y;
      const distSq = dx * dx + dy * dy;
      if (distSq < nearestDistSq) {
        nearestDistSq = distSq;
        nearestIndex = i;
      }
    }
  }
  const debugInfo = {
    padsLen,
    firstPadId: padsLen ? pads[0]?.id ?? null : null,
    lastPadId: padsLen ? pads[padsLen - 1]?.id ?? null : null,
    padsId: pads?._id ?? null,
    nearestIndex,
    distUsed: null,
    radiusUsed: null,
    inRangeUsed: null,
    cdUsed: null,
    phaseUsed: phase,
    skipReason: null,
  };

  for (let i = 0; i < pads.length; i += 1) {
    const pad = pads[i];
    if (!pad || !pad.position || !playerWorldPos) {
      if (i === nearestIndex && !debugInfo.skipReason) {
        debugInfo.skipReason = "pad_invalid";
      }
      continue;
    }
    if (pad.cooldownTimer > 0) {
      pad.cooldownTimer = Math.max(0, pad.cooldownTimer - dt);
    }
    if (i === nearestIndex) {
      const dxUsed = playerWorldPos.x - pad.position.x;
      const dyUsed = playerWorldPos.y - pad.position.y;
      const distUsed = Math.hypot(dxUsed, dyUsed);
      debugInfo.distUsed = distUsed;
      debugInfo.radiusUsed = pad.triggerRadius;
      debugInfo.inRangeUsed = distUsed <= pad.triggerRadius;
      debugInfo.cdUsed = pad.cooldownTimer;
    }
    if (phase !== "RACING") {
      if (i === nearestIndex && !debugInfo.skipReason) {
        debugInfo.skipReason = "phase";
      }
      continue;
    }
    if (pad.cooldownTimer > 0) {
      if (i === nearestIndex && !debugInfo.skipReason) {
        debugInfo.skipReason = "cooldown";
      }
      continue;
    }
    const dx = playerWorldPos.x - pad.position.x;
    const dy = playerWorldPos.y - pad.position.y;
    const distSq = dx * dx + dy * dy;
    if (distSq <= pad.triggerRadius * pad.triggerRadius) {
      console.log("BOOST TRIGGER", i + 1, Math.sqrt(distSq).toFixed(1), pad.triggerRadius, pad.cooldownTimer, phase);
      pad.cooldownTimer = Number.isFinite(pad.cooldown) ? pad.cooldown : boostConfig?.cooldown ?? 2;
      car.boostActive = true;
      car.boostTimer = Math.max(car.boostTimer || 0, boostConfig?.duration ?? pad.duration ?? 0.95);
      car.boostDuration = Math.max(car.boostDuration || 0, boostConfig?.duration ?? pad.duration ?? 0.95);
      car.boostImpulseLast = boostConfig?.impulse ?? null;
      triggered.push({
        pad,
        index: i,
        debug: {
          dist: Math.sqrt(distSq),
          radius: pad.triggerRadius,
        },
      });
      if (i === nearestIndex) {
        debugInfo.skipReason = "triggered";
      }
      break;
    } else if (i === nearestIndex && !debugInfo.skipReason) {
      debugInfo.skipReason = "distance";
    }
  }

  pads._debug = debugInfo;
  return triggered;
}

export const BOOST_CONFIG = BOOST_PAD_CONFIG;

export function getBoostPadCount(pads) {
  return Array.isArray(pads) ? pads.length : 0;
}
