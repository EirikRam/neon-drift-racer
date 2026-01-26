import { clamp, createVec2 } from "./math.js";

const TWO_PI = Math.PI * 2;

function generateCenterline() {
  const points = [];
  const pointCount = 96;
  const radiusX = 520;
  const radiusY = 320;

  for (let i = 0; i < pointCount; i += 1) {
    const t = i / pointCount;
    const angle = t * TWO_PI;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    const baseX = cos * radiusX;
    const baseY = sin * radiusY;

    const wobble =
      Math.sin(angle * 3) * 32 +
      Math.sin(angle * 5 + 1.2) * 18 +
      Math.sin(angle * 9 - 0.4) * 10;

    points.push(createVec2(baseX + cos * wobble, baseY + sin * wobble));
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
  constructor(centerline, width) {
    this.centerline = centerline;
    this.width = width;

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
  return new Track(centerline, width);
}

export const track = createTrack();
