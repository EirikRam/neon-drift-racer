import { clamp, createVec2 } from "./math.js";

const TWO_PI = Math.PI * 2;
const DISTRICTS = [
  { id: "beach", name: "Beach Causeway", startT: 0.0, endT: 0.25 },
  { id: "downtown", name: "Downtown Grid", startT: 0.25, endT: 0.5 },
  { id: "neon", name: "Neon Alley", startT: 0.5, endT: 0.75 },
  { id: "harbor", name: "Harbor Run", startT: 0.75, endT: 1.0 },
];

function generateCenterline() {
  const points = [];
  const pointCount = 420;
  const radiusX = 980;
  const radiusY = 640;
  const blendWidth = 0.06;

  for (let i = 0; i < pointCount; i += 1) {
    const t = i / pointCount;
    const angle = t * TWO_PI;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    const baseX = cos * radiusX;
    const baseY = sin * radiusY;
    const normal = { x: cos, y: sin };
    const tangent = { x: -sin, y: cos };

    const beach = districtWeight(t, DISTRICTS[0], blendWidth);
    const downtown = districtWeight(t, DISTRICTS[1], blendWidth);
    const neon = districtWeight(t, DISTRICTS[2], blendWidth);
    const harbor = districtWeight(t, DISTRICTS[3], blendWidth);

    const beachOffset = {
      n:
        Math.sin(t * TWO_PI * 1.2) * 40 +
        Math.sin(t * TWO_PI * 0.5 + 0.8) * 28,
      t: Math.sin(t * TWO_PI * 0.7 + 0.3) * 16,
    };
    const downtownOffset = {
      n:
        Math.sin(t * TWO_PI * 2.4 + 0.4) * 22 +
        Math.sin(t * TWO_PI * 6.2 + 1.1) * 14,
      t: Math.sin(t * TWO_PI * 1.8 + 0.9) * 14,
    };
    const neonOffset = {
      n:
        Math.sin(t * TWO_PI * 7.6 + 0.2) * 16 +
        Math.sin(t * TWO_PI * 11.1 + 1.4) * 10,
      t: Math.sin(t * TWO_PI * 5.8 + 0.7) * 10,
    };
    const harborStraight =
      smoothstep(0.78, 0.84, t) * (1 - smoothstep(0.9, 0.96, t));
    const harborOffset = {
      n:
        (Math.sin(t * TWO_PI * 1.1 + 0.6) * 26 +
          Math.sin(t * TWO_PI * 2.2 + 1.3) * 16) *
        (1 - harborStraight * 0.5),
      t: Math.sin(t * TWO_PI * 0.5 + 2.1) * 32,
    };

    const offsetN =
      beachOffset.n * beach +
      downtownOffset.n * downtown +
      neonOffset.n * neon +
      harborOffset.n * harbor;
    const offsetT =
      beachOffset.t * beach +
      downtownOffset.t * downtown +
      neonOffset.t * neon +
      harborOffset.t * harbor;

    points.push(
      createVec2(
        baseX + normal.x * offsetN + tangent.x * offsetT,
        baseY + normal.y * offsetN + tangent.y * offsetT,
      ),
    );
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
  constructor(centerline, width, districts = []) {
    this.centerline = centerline;
    this.width = width;
    this.districts = districts;

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
  return new Track(centerline, width, DISTRICTS);
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

function districtWeight(t, district, blendWidth) {
  const start = district.startT;
  const end = district.endT;
  const inStart = smoothstep(start, start + blendWidth, t);
  const outEnd = smoothstep(end - blendWidth, end, t);
  return inStart * (1 - outEnd);
}
