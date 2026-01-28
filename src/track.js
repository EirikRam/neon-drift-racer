import { clamp, createVec2 } from "./math.js";

const TWO_PI = Math.PI * 2;
const START_T = 0.02;
const DISTRICTS = [
  { id: "beach", name: "Beach Causeway", startT: 0.0, endT: 0.25 },
  { id: "downtown", name: "Downtown Grid", startT: 0.25, endT: 0.5 },
  { id: "neon", name: "Neon Alley", startT: 0.5, endT: 0.75 },
  { id: "harbor", name: "Harbor Run", startT: 0.75, endT: 1.0 },
];

const WORLD_SCALE = 5.0;
const SPLINE_TENSION = 0.58;
const MAX_RETRIES = 5;
let lastValidTrack = null;

const BASE_CONFIG = {
  xMin: -900,
  xMax: 900,
  startY: -320,
  laneStep: 160,
  segmentLength: 120,
  straightLong: 520,
  straightShort: 220,
  chicaneAmp: 140,
  sCurveAmp: 160,
  turnRadius: 220,
  hairpinRadius: 170,
};

function generateCenterline() {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    const config = buildRouteConfig(attempt);
    const build = buildRouteWaypoints(config);
    const scaledWaypoints = scalePoints(build.waypoints);
    const sharpened = applyCornerSharpening(scaledWaypoints, build.sharpIndices);
    const tension = hasCurvatureSpike(sharpened, 1.9)
      ? Math.min(0.7, SPLINE_TENSION + 0.08)
      : SPLINE_TENSION;
    const centerline = sampleCatmullRomLoop(sharpened, 520, tension);
    if (isRouteValid(centerline, config.minSelfSeparation)) {
      lastValidTrack = {
        centerline,
        waypoints: scaledWaypoints,
        sharpIndices: build.sharpIndices,
        retryCount: attempt,
        fallbackUsed: false,
      };
      return centerline;
    }
  }

  if (lastValidTrack) {
    lastValidTrack.fallbackUsed = true;
    return lastValidTrack.centerline;
  }

  const fallbackConfig = buildRouteConfig(0);
  const fallback = buildRouteWaypoints(fallbackConfig);
  lastValidTrack = {
    centerline: sampleCatmullRomLoop(scalePoints(fallback.waypoints), 520, SPLINE_TENSION),
    waypoints: scalePoints(fallback.waypoints),
    sharpIndices: fallback.sharpIndices,
    retryCount: MAX_RETRIES,
    fallbackUsed: true,
  };
  return lastValidTrack.centerline;
}

function sampleCatmullRomLoop(waypoints, sampleCount, tension) {
  const points = [];
  const count = waypoints.length;
  const steps = Math.max(1, Math.floor(sampleCount / count));

  for (let i = 0; i < count; i += 1) {
    const p0 = waypoints[(i - 1 + count) % count];
    const p1 = waypoints[i];
    const p2 = waypoints[(i + 1) % count];
    const p3 = waypoints[(i + 2) % count];
    for (let s = 0; s < steps; s += 1) {
      const t = s / steps;
      points.push(catmullRom(p0, p1, p2, p3, t, tension));
    }
  }

  return points;
}

function buildSegmentData(points) {
  const segmentLengths = new Array(points.length);
  const cumulativeLengths = new Array(points.length);
  let totalLength = 0;

  for (let i = 0; i < points.length; i += 1) {
    const nextIndex = (i + 1) % points.length;
    const dx = points[nextIndex].x - points[i].x;
    const dy = points[nextIndex].y - points[i].y;
    const length = Math.hypot(dx, dy);

    segmentLengths[i] = length;
    cumulativeLengths[i] = totalLength;
    totalLength += length;
  }

  return { segmentLengths, cumulativeLengths, totalLength };
}

function buildBoundaries(points, width) {
  const inner = new Array(points.length);
  const outer = new Array(points.length);

  for (let i = 0; i < points.length; i += 1) {
    const prevIndex = (i - 1 + points.length) % points.length;
    const nextIndex = (i + 1) % points.length;
    const prev = points[prevIndex];
    const next = points[nextIndex];
    const tx = next.x - prev.x;
    const ty = next.y - prev.y;
    const len = Math.hypot(tx, ty) || 1;
    const normal = { x: -ty / len, y: tx / len };
    inner[i] = createVec2(
      points[i].x - normal.x * width,
      points[i].y - normal.y * width,
    );
    outer[i] = createVec2(
      points[i].x + normal.x * width,
      points[i].y + normal.y * width,
    );
  }

  return { inner, outer };
}

class Track {
  constructor(centerline, width, districts = [], waypoints = [], sharpCorners = []) {
    this.centerline = centerline;
    this.width = width;
    this.districts = districts;
    this.waypoints = waypoints;
    this.sharpCorners = sharpCorners;
    this.startT = START_T;

    const data = buildSegmentData(centerline);
    this.segmentLengths = data.segmentLengths;
    this.cumulativeLengths = data.cumulativeLengths;
    this.totalLength = data.totalLength;

    const boundaries = buildBoundaries(centerline, width);
    this.innerBoundary = boundaries.inner;
    this.outerBoundary = boundaries.outer;
  }

  getClosestPoint(worldPos) {
    let bestDistSq = Number.POSITIVE_INFINITY;
    let bestPoint = createVec2();
    let bestIndex = 0;
    let bestT = 0;

    for (let i = 0; i < this.centerline.length; i += 1) {
      const nextIndex = (i + 1) % this.centerline.length;
      const a = this.centerline[i];
      const b = this.centerline[nextIndex];
      const abx = b.x - a.x;
      const aby = b.y - a.y;
      const apx = worldPos.x - a.x;
      const apy = worldPos.y - a.y;
      const denom = abx * abx + aby * aby || 1;
      const t = clamp((apx * abx + apy * aby) / denom, 0, 1);
      const cx = a.x + abx * t;
      const cy = a.y + aby * t;
      const dx = worldPos.x - cx;
      const dy = worldPos.y - cy;
      const distSq = dx * dx + dy * dy;

      if (distSq < bestDistSq) {
        bestDistSq = distSq;
        bestPoint = createVec2(cx, cy);
        bestIndex = i;
        bestT = t;
      }
    }

    const along =
      this.cumulativeLengths[bestIndex] +
      this.segmentLengths[bestIndex] * bestT;

    return {
      point: bestPoint,
      distance: Math.sqrt(bestDistSq),
      segmentIndex: bestIndex,
      segmentT: bestT,
      along,
    };
  }

  getDistanceToCenterline(worldPos) {
    const closest = this.getClosestPoint(worldPos);
    return closest.distance;
  }

  isOnRoad(worldPos) {
    return this.getDistanceToCenterline(worldPos) <= this.width;
  }

  getProgressAlongTrack(worldPos) {
    const closest = this.getClosestPoint(worldPos);
    return closest.along / this.totalLength;
  }

  getPointAtProgress(progress) {
    const normalized = ((progress % 1) + 1) % 1;
    const targetDistance = normalized * this.totalLength;

    let segmentIndex = 0;
    for (let i = 0; i < this.centerline.length; i += 1) {
      const start = this.cumulativeLengths[i];
      const end = start + this.segmentLengths[i];
      if (targetDistance >= start && targetDistance <= end) {
        segmentIndex = i;
        break;
      }
    }

    const nextIndex = (segmentIndex + 1) % this.centerline.length;
    const a = this.centerline[segmentIndex];
    const b = this.centerline[nextIndex];
    const segmentLength = this.segmentLengths[segmentIndex] || 1;
    const segmentStart = this.cumulativeLengths[segmentIndex];
    const t = clamp((targetDistance - segmentStart) / segmentLength, 0, 1);
    const point = createVec2(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
    const tangent = safeNormalize(b.x - a.x, b.y - a.y);
    const normal = safeNormalize(-tangent.y, tangent.x);

    return { point, tangent, normal };
  }

  getStartPose() {
    const sample = this.getPointAtProgress(this.startT);
    const heading = Math.atan2(sample.tangent.y, sample.tangent.x);
    return {
      pos: createVec2(sample.point.x, sample.point.y),
      heading,
      tangent: sample.tangent,
      normal: sample.normal,
    };
  }

  getFinishGate() {
    const sample = this.getPointAtProgress(this.startT);
    const gatePos = createVec2(sample.point.x, sample.point.y);
    const gateNormal = sample.normal;
    const gateTangent = sample.tangent;
    return {
      t: this.startT,
      gatePos,
      gateNormal,
      gateTangent,
      pos: gatePos,
      tangent: gateTangent,
      normal: gateNormal,
    };
  }

  getBoundaries() {
    return { inner: this.innerBoundary, outer: this.outerBoundary };
  }

  getDistrictAtProgress(progress) {
    const t = ((progress % 1) + 1) % 1;
    for (let i = 0; i < this.districts.length; i += 1) {
      const district = this.districts[i];
      if (t >= district.startT && t < district.endT) {
        return district;
      }
    }
    return this.districts[0] || null;
  }

  getDistrictName(progress) {
    const district = this.getDistrictAtProgress(progress);
    return district ? district.name : "Unknown";
  }
}

function safeNormalize(x, y) {
  const length = Math.hypot(x, y);
  if (!Number.isFinite(length) || length < 1e-6) {
    return { x: 1, y: 0 };
  }
  return { x: x / length, y: y / length };
}

export function createTrack() {
  const centerline = generateCenterline();
  const width = 120;
  const waypoints = lastValidTrack?.waypoints ?? [];
  const sharpCorners = lastValidTrack?.sharpIndices ?? [];
  const trackInstance = new Track(centerline, width, DISTRICTS, waypoints, sharpCorners);
  trackInstance.debugInfo = {
    retryCount: lastValidTrack?.retryCount ?? 0,
    fallbackUsed: lastValidTrack?.fallbackUsed ?? false,
  };
  return trackInstance;
}

export const track = createTrack();

export function getSkylineKeyForDistrictId(districtId) {
  switch (districtId) {
    case "beach":
      return "skyBeach";
    case "downtown":
      return "skyDowntown";
    case "neon":
      return "skyNeon";
    case "harbor":
      return "skyHarbor";
    default:
      return "skyBeach";
  }
}

function smoothstep(edge0, edge1, value) {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function catmullRom(p0, p1, p2, p3, t, tension = 0) {
  const t2 = t * t;
  const t3 = t2 * t;
  const m1x = (1 - tension) * (p2.x - p0.x) * 0.5;
  const m1y = (1 - tension) * (p2.y - p0.y) * 0.5;
  const m2x = (1 - tension) * (p3.x - p1.x) * 0.5;
  const m2y = (1 - tension) * (p3.y - p1.y) * 0.5;
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;
  return createVec2(
    h00 * p1.x + h10 * m1x + h01 * p2.x + h11 * m2x,
    h00 * p1.y + h10 * m1y + h01 * p2.y + h11 * m2y,
  );
}

function applyCornerSharpening(waypoints, sharpIndices) {
  if (!sharpIndices.length) {
    return waypoints;
  }
  const count = waypoints.length;
  const isSharp = new Set(sharpIndices);
  const result = [];
  for (let i = 0; i < count; i += 1) {
    const prev = waypoints[(i - 1 + count) % count];
    const curr = waypoints[i];
    const next = waypoints[(i + 1) % count];
    if (isSharp.has(i)) {
      result.push(lerpPoint(prev, curr, 0.85));
      result.push(curr);
      result.push(lerpPoint(curr, next, 0.15));
    } else {
      result.push(curr);
    }
  }
  return result;
}

function lerpPoint(a, b, t) {
  return createVec2(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
}

function hasCurvatureSpike(points, threshold) {
  for (let i = 0; i < points.length; i += 1) {
    const prev = points[(i - 1 + points.length) % points.length];
    const curr = points[i];
    const next = points[(i + 1) % points.length];
    const v1x = curr.x - prev.x;
    const v1y = curr.y - prev.y;
    const v2x = next.x - curr.x;
    const v2y = next.y - curr.y;
    const len1 = Math.hypot(v1x, v1y);
    const len2 = Math.hypot(v2x, v2y);
    if (len1 < 1e-3 || len2 < 1e-3) {
      continue;
    }
    const dot = (v1x * v2x + v1y * v2y) / (len1 * len2);
    const clamped = Math.min(1, Math.max(-1, dot));
    const angle = Math.acos(clamped);
    if (angle > threshold) {
      return true;
    }
  }
  return false;
}

function buildRouteConfig(attempt) {
  const scale = 1 + attempt * 0.08;
  return {
    xMin: BASE_CONFIG.xMin * scale,
    xMax: BASE_CONFIG.xMax * scale,
    startY: BASE_CONFIG.startY * scale,
    laneStep: BASE_CONFIG.laneStep * scale,
    segmentLength: BASE_CONFIG.segmentLength * scale,
    straightLong: BASE_CONFIG.straightLong * scale,
    straightShort: BASE_CONFIG.straightShort * scale,
    chicaneAmp: BASE_CONFIG.chicaneAmp * (1 - attempt * 0.08),
    sCurveAmp: BASE_CONFIG.sCurveAmp * (1 - attempt * 0.06),
    turnRadius: BASE_CONFIG.turnRadius * scale,
    hairpinRadius: BASE_CONFIG.hairpinRadius * scale,
    minSelfSeparation: 360 + attempt * 80,
  };
}

function buildRouteWaypoints(config) {
  const waypoints = [];
  const sharpIndices = [];
  let pos = createVec2(config.xMin, config.startY);
  let heading = 0;
  waypoints.push(createVec2(pos.x, pos.y));

  const laneLength = Math.abs(config.xMax - config.xMin);
  const laneDirs = [1, -1, 1, -1];
  const laneDistricts = ["beach", "downtown", "neon", "harbor"];

  for (let lane = 0; lane < laneDirs.length; lane += 1) {
    const dir = laneDirs[lane];
    const district = laneDistricts[lane];
    if (lane > 0) {
      addHairpin(config.hairpinRadius, dir > 0 ? 1 : -1, 170);
      addStraight(config.straightShort * 0.6);
    }

    if (district === "beach") {
      addStraight(config.straightLong * 0.75);
      addSCurve(config.sCurveAmp, dir > 0 ? 1 : -1);
      addStraight(config.straightShort);
      addChicane(config.chicaneAmp * 0.8, dir > 0 ? 1 : -1);
      addStraight(config.straightShort);
    } else if (district === "downtown") {
      addChicane(config.chicaneAmp, dir > 0 ? -1 : 1);
      addRightAngleBump(config.turnRadius * 0.7, dir > 0 ? 1 : -1);
      addStraight(config.straightShort * 0.8);
      addSCurve(config.sCurveAmp * 0.8, dir > 0 ? 1 : -1);
      addChicane(config.chicaneAmp * 0.9, dir > 0 ? 1 : -1);
      addHairpinPair(config.hairpinRadius * 0.85, dir > 0 ? -1 : 1);
      addStraight(config.straightShort);
    } else if (district === "neon") {
      addSCurve(config.sCurveAmp, dir > 0 ? -1 : 1);
      addSCurve(config.sCurveAmp * 0.9, dir > 0 ? 1 : -1);
      addHairpinPair(config.hairpinRadius * 0.75, dir > 0 ? 1 : -1);
      addChicane(config.chicaneAmp * 0.8, dir > 0 ? -1 : 1);
      addStraight(config.straightShort * 0.8);
    } else {
      addStraight(config.straightLong);
      addSweeper(config.turnRadius * 1.8, dir > 0 ? 1 : -1, 60);
      addStraight(config.straightShort);
      addSCurve(config.sCurveAmp * 0.7, dir > 0 ? -1 : 1);
      addChicane(config.chicaneAmp * 0.6, dir > 0 ? 1 : -1);
      addStraight(config.straightShort * 0.7);
    }

    const remaining = laneLength * 0.2;
    addStraight(remaining);
  }

  return { waypoints, sharpIndices };

  function addPoint(point) {
    waypoints.push(createVec2(point.x, point.y));
  }

  function addStraight(length) {
    const steps = Math.max(2, Math.floor(length / config.segmentLength));
    const step = length / steps;
    for (let i = 0; i < steps; i += 1) {
      pos = createVec2(
        pos.x + Math.cos(heading) * step,
        pos.y + Math.sin(heading) * step,
      );
      addPoint(pos);
    }
  }

  function addTurn(radius, direction, angleDeg) {
    const angleRad = (angleDeg * Math.PI) / 180;
    const steps = Math.max(4, Math.floor(Math.abs(angleRad) / (Math.PI / 18)));
    const step = (angleRad / steps) * direction;
    const normal = direction > 0
      ? createVec2(-Math.sin(heading), Math.cos(heading))
      : createVec2(Math.sin(heading), -Math.cos(heading));
    const center = createVec2(pos.x + normal.x * radius, pos.y + normal.y * radius);
    for (let i = 0; i < steps; i += 1) {
      pos = rotateAround(pos, center, step);
      heading += step;
      addPoint(pos);
    }
    if (Math.abs(angleDeg) >= 60) {
      sharpIndices.push(waypoints.length - 1);
    }
  }

  function addHairpin(radius, direction, angleDeg = 170) {
    addTurn(radius, direction, angleDeg);
  }

  function addHairpinPair(radius, direction) {
    addHairpin(radius, direction, 165);
    addStraight(config.straightShort * 0.4);
    addHairpin(radius, -direction, 165);
  }

  function addSCurve(amplitude, direction) {
    addTurn(amplitude * 1.4, direction, 40);
    addTurn(amplitude * 1.4, -direction, 40);
    addTurn(amplitude * 1.2, direction, 25);
  }

  function addChicane(amplitude, direction) {
    addTurn(amplitude * 1.2, direction, 25);
    addTurn(amplitude * 1.2, -direction, 50);
    addTurn(amplitude * 1.2, direction, 25);
  }

  function addRightAngleBump(radius, direction) {
    addTurn(radius, direction, 90);
    addStraight(config.straightShort * 0.4);
    addTurn(radius, -direction, 90);
  }

  function addSweeper(radius, direction, angleDeg) {
    addTurn(radius, direction, angleDeg);
  }
}

function rotateAround(point, center, angle) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  return createVec2(
    center.x + dx * cos - dy * sin,
    center.y + dx * sin + dy * cos,
  );
}

function scalePoints(points) {
  return points.map((point) => createVec2(point.x * WORLD_SCALE, point.y * WORLD_SCALE));
}

function isRouteValid(points, minSelfSeparation) {
  if (hasSegmentIntersections(points)) {
    return false;
  }
  if (!hasMinSelfSeparation(points, minSelfSeparation)) {
    return false;
  }
  return true;
}

function hasSegmentIntersections(points) {
  const count = points.length;
  for (let i = 0; i < count; i += 1) {
    const a1 = points[i];
    const a2 = points[(i + 1) % count];
    for (let j = i + 2; j < count; j += 1) {
      if (Math.abs(i - j) < 3 || (i === 0 && j === count - 1)) {
        continue;
      }
      const b1 = points[j];
      const b2 = points[(j + 1) % count];
      if (segmentsIntersect(a1, a2, b1, b2)) {
        return true;
      }
    }
  }
  return false;
}

function segmentsIntersect(a, b, c, d) {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  if (o1 === 0 && onSegment(a, c, b)) return true;
  if (o2 === 0 && onSegment(a, d, b)) return true;
  if (o3 === 0 && onSegment(c, a, d)) return true;
  if (o4 === 0 && onSegment(c, b, d)) return true;
  return o1 !== o2 && o3 !== o4;
}

function orientation(a, b, c) {
  const value = (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
  if (Math.abs(value) < 1e-6) {
    return 0;
  }
  return value > 0 ? 1 : 2;
}

function onSegment(a, b, c) {
  return (
    b.x <= Math.max(a.x, c.x) &&
    b.x >= Math.min(a.x, c.x) &&
    b.y <= Math.max(a.y, c.y) &&
    b.y >= Math.min(a.y, c.y)
  );
}

function hasMinSelfSeparation(points, minSeparation) {
  const count = points.length;
  const minSq = minSeparation * minSeparation;
  for (let i = 0; i < count; i += 1) {
    const a = points[i];
    for (let j = i + 6; j < count; j += 1) {
      const b = points[j % count];
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      if (dx * dx + dy * dy < minSq) {
        return false;
      }
    }
  }
  return true;
}

function districtWeight(t, district, blendWidth) {
  const start = district.startT;
  const end = district.endT;
  const inStart = smoothstep(start, start + blendWidth, t);
  const outEnd = smoothstep(end - blendWidth, end, t);
  return inStart * (1 - outEnd);
}
