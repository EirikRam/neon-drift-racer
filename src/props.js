import { createVec2 } from "./math.js";

const PROP_CATALOG = {
  neonDistrict: {
    imageKey: "neonDistrict",
    baseScale: 0.46,
    minScaleMultiplier: 0.9,
    maxScaleMultiplier: 1.05,
    emissiveStrength: 0.55,
    sizeClass: "large",
  },
  viceCity: {
    imageKey: "viceCity",
    baseScale: 0.44,
    minScaleMultiplier: 0.9,
    maxScaleMultiplier: 1.05,
    emissiveStrength: 0.5,
    sizeClass: "medium",
  },
  artDecoHotel: {
    imageKey: "artDecoHotel",
    baseScale: 0.4,
    minScaleMultiplier: 0.9,
    maxScaleMultiplier: 1.05,
    emissiveStrength: 0.48,
    sizeClass: "medium",
  },
  open24h: {
    imageKey: "open24h",
    baseScale: 0.36,
    minScaleMultiplier: 0.9,
    maxScaleMultiplier: 1.05,
    emissiveStrength: 0.45,
    sizeClass: "small",
  },
  abstractArrows: {
    imageKey: "abstractArrows",
    baseScale: 0.38,
    minScaleMultiplier: 0.9,
    maxScaleMultiplier: 1.08,
    emissiveStrength: 0.5,
    sizeClass: "small",
  },
  palmTree: {
    imageKey: "palmTree",
    baseScale: 0.32,
    minScaleMultiplier: 0.9,
    maxScaleMultiplier: 1.05,
    emissiveStrength: 0.42,
    sizeClass: "small",
  },
  flamingo: {
    imageKey: "flamingo",
    baseScale: 0.32,
    minScaleMultiplier: 0.9,
    maxScaleMultiplier: 1.05,
    emissiveStrength: 0.42,
    sizeClass: "small",
  },
  neonSkull: {
    imageKey: "neonSkull",
    baseScale: 0.34,
    minScaleMultiplier: 0.9,
    maxScaleMultiplier: 1.05,
    emissiveStrength: 0.45,
    sizeClass: "small",
  },
};

const PROP_KEYS = Object.keys(PROP_CATALOG);
const SAFE_MARGIN = 160;
const INNER_BAND_REJECT = 90;
const MAX_PROPS_TOTAL = 30;
const MAX_ROADSIDE = 14;
const MAX_CLUSTERED = 16;
const MIN_SEPARATION = 320;
const GRID_CELL = 320;
const LARGE_MIN_SEPARATION = 380;
const OUTER_JITTER = 40;
const ROADSIDE_STEP = 10;

function mulberry32(seed) {
  return function random() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickPropKey(rng, candidates = PROP_KEYS) {
  return candidates[Math.floor(rng() * candidates.length)];
}

function getTrackNormal(points, index) {
  const prevIndex = (index - 1 + points.length) % points.length;
  const nextIndex = (index + 1) % points.length;
  const prev = points[prevIndex];
  const next = points[nextIndex];
  const tx = next.x - prev.x;
  const ty = next.y - prev.y;
  const len = Math.hypot(tx, ty) || 1;
  return { x: -ty / len, y: tx / len };
}

function getTrackTangent(points, index) {
  const prevIndex = (index - 1 + points.length) % points.length;
  const nextIndex = (index + 1) % points.length;
  const prev = points[prevIndex];
  const next = points[nextIndex];
  const tx = next.x - prev.x;
  const ty = next.y - prev.y;
  const len = Math.hypot(tx, ty) || 1;
  return { x: tx / len, y: ty / len };
}

function getTrackCentroid(points) {
  let sumX = 0;
  let sumY = 0;
  for (let i = 0; i < points.length; i += 1) {
    sumX += points[i].x;
    sumY += points[i].y;
  }
  const count = points.length || 1;
  return createVec2(sumX / count, sumY / count);
}

function isOutsideRoad(track, position, margin, innerBandReject) {
  const dist = track.getDistanceToCenterline(position);
  if (dist < track.width + margin) {
    return false;
  }
  return Math.abs(dist - (track.width + margin)) >= innerBandReject;
}

function makeSpatialHash(cellSize) {
  const grid = new Map();

  function cellKey(x, y) {
    return `${x},${y}`;
  }

  function getCell(position) {
    return {
      x: Math.floor(position.x / cellSize),
      y: Math.floor(position.y / cellSize),
    };
  }

  return {
    add(prop) {
      const cell = getCell(prop.position);
      const key = cellKey(cell.x, cell.y);
      if (!grid.has(key)) {
        grid.set(key, []);
      }
      grid.get(key).push(prop);
    },
    query(position) {
      const cell = getCell(position);
      const results = [];
      for (let dx = -1; dx <= 1; dx += 1) {
        for (let dy = -1; dy <= 1; dy += 1) {
          const key = cellKey(cell.x + dx, cell.y + dy);
          const bucket = grid.get(key);
          if (bucket) {
            results.push(...bucket);
          }
        }
      }
      return results;
    },
  };
}

function canPlaceProp(prop, hash, minSeparation, largeSeparation) {
  const neighbors = hash.query(prop.position);
  for (let i = 0; i < neighbors.length; i += 1) {
    const other = neighbors[i];
    const dx = other.position.x - prop.position.x;
    const dy = other.position.y - prop.position.y;
    const distSq = dx * dx + dy * dy;
    const target =
      prop.sizeClass === "large" || other.sizeClass === "large"
        ? largeSeparation
        : minSeparation;
    if (distSq < target * target) {
      return false;
    }
  }
  return true;
}

function buildProp(catalogKey, position, rng) {
  const entry = PROP_CATALOG[catalogKey];
  const scaleMultiplier = entry.minScaleMultiplier +
    rng() * (entry.maxScaleMultiplier - entry.minScaleMultiplier);
  return {
    imageKey: entry.imageKey,
    position,
    scale: entry.baseScale * scaleMultiplier,
    rotation: (rng() - 0.5) * 0.06,
    emissiveStrength: entry.emissiveStrength,
    flickerSeed: rng() * 1000,
    sizeClass: entry.sizeClass,
  };
}

export function generateProps(track, seed = 1337) {
  const rng = mulberry32(seed);
  const props = [];
  const points = track.centerline;
  const hash = makeSpatialHash(GRID_CELL);
  const centroid = getTrackCentroid(points);

  let roadsideCount = 0;
  for (let i = 0; i < points.length; i += ROADSIDE_STEP) {
    if (roadsideCount >= MAX_ROADSIDE || props.length >= MAX_PROPS_TOTAL) {
      break;
    }

    if (rng() < 0.5) {
      continue;
    }

    const normal = getTrackNormal(points, i);
    const tangent = getTrackTangent(points, i);
    const outwardProbe = createVec2(
      points[i].x + normal.x * 20,
      points[i].y + normal.y * 20,
    );
    const inwardProbe = createVec2(
      points[i].x - normal.x * 20,
      points[i].y - normal.y * 20,
    );

    const outwardDist =
      (outwardProbe.x - centroid.x) ** 2 +
      (outwardProbe.y - centroid.y) ** 2;
    const inwardDist =
      (inwardProbe.x - centroid.x) ** 2 +
      (inwardProbe.y - centroid.y) ** 2;
    const outwardNormal = outwardDist > inwardDist ? normal : { x: -normal.x, y: -normal.y };

    const offset = track.width + SAFE_MARGIN + rng() * 120;
    const base = points[i];
    const position = createVec2(
      base.x + outwardNormal.x * offset + tangent.x * (rng() - 0.5) * OUTER_JITTER,
      base.y + outwardNormal.y * offset + tangent.y * (rng() - 0.5) * OUTER_JITTER,
    );

    if (!isOutsideRoad(track, position, SAFE_MARGIN, INNER_BAND_REJECT)) {
      continue;
    }

    const key = pickPropKey(rng, [
      "neonDistrict",
      "viceCity",
      "artDecoHotel",
      "open24h",
      "abstractArrows",
    ]);
    const prop = buildProp(key, position, rng);
    if (!canPlaceProp(prop, hash, MIN_SEPARATION, LARGE_MIN_SEPARATION)) {
      continue;
    }

    props.push(prop);
    hash.add(prop);
    roadsideCount += 1;
  }

  const clusterThemes = [
    ["artDecoHotel", "open24h", "abstractArrows"],
    ["neonSkull", "abstractArrows"],
    ["viceCity", "palmTree", "flamingo"],
  ];

  const clusterCount = 3 + Math.floor(rng() * 2);
  let clusteredCount = 0;
  for (let c = 0; c < clusterCount; c += 1) {
    if (props.length >= MAX_PROPS_TOTAL || clusteredCount >= MAX_CLUSTERED) {
      break;
    }

    let center = null;
    for (let attempts = 0; attempts < 24; attempts += 1) {
      const angle = rng() * Math.PI * 2;
      const radius = 900 + rng() * 500;
      const candidate = createVec2(
        centroid.x + Math.cos(angle) * radius,
        centroid.y + Math.sin(angle) * radius,
      );
      if (isOutsideRoad(track, candidate, SAFE_MARGIN + 140, INNER_BAND_REJECT)) {
        center = candidate;
        break;
      }
    }

    if (!center) {
      continue;
    }

    const theme = clusterThemes[c % clusterThemes.length];
    const count = 3 + Math.floor(rng() * 4);
    for (let i = 0; i < count; i += 1) {
      if (props.length >= MAX_PROPS_TOTAL || clusteredCount >= MAX_CLUSTERED) {
        break;
      }

      const angle = rng() * Math.PI * 2;
      const radius = 220 + rng() * 220;
      const position = createVec2(
        center.x + Math.cos(angle) * radius,
        center.y + Math.sin(angle) * radius,
      );

      if (!isOutsideRoad(track, position, SAFE_MARGIN + 120, INNER_BAND_REJECT)) {
        continue;
      }

      const prop = buildProp(pickPropKey(rng, theme), position, rng);
      if (!canPlaceProp(prop, hash, MIN_SEPARATION, LARGE_MIN_SEPARATION)) {
        continue;
      }

      props.push(prop);
      hash.add(prop);
      clusteredCount += 1;
    }
  }

  return props;
}
