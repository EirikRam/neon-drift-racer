export function createVec2(x = 0, y = 0) {
  return { x, y };
}

export function addVec2(a, b) {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function subVec2(a, b) {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function scaleVec2(v, scalar) {
  return { x: v.x * scalar, y: v.y * scalar };
}

export function lenVec2(v) {
  return Math.hypot(v.x, v.y);
}

export function normVec2(v) {
  const length = lenVec2(v);
  if (length === 0) {
    return { x: 0, y: 0 };
  }
  return { x: v.x / length, y: v.y / length };
}

export function rotateVec2(v, radians) {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return { x: v.x * cos - v.y * sin, y: v.x * sin + v.y * cos };
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}
