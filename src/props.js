import { createVec2 } from "./math.js";

const PROP_CATALOG = {
  neonDistrict: {
    imageKey: "neonDistrict",
    baseScale: 0.39,
    minScaleMultiplier: 0.9,
    maxScaleMultiplier: 1.05,
    emissiveStrength: 0.55,
    sizeClass: "large",
    districts: ["downtown", "harbor"],
  },
  viceCity: {
    imageKey: "viceCity",
    baseScale: 0.37,
    minScaleMultiplier: 0.9,
    maxScaleMultiplier: 1.05,
    emissiveStrength: 0.5,
    sizeClass: "medium",
    districts: ["downtown", "neon"],
  },
  artDecoHotel: {
    imageKey: "artDecoHotel",
    baseScale: 0.34,
    minScaleMultiplier: 0.9,
    maxScaleMultiplier: 1.05,
    emissiveStrength: 0.48,
    sizeClass: "medium",
    districts: ["downtown"],
  },
  open24h: {
    imageKey: "open24h",
    baseScale: 0.31,
    minScaleMultiplier: 0.9,
    maxScaleMultiplier: 1.05,
    emissiveStrength: 0.45,
    sizeClass: "small",
    districts: ["beach", "harbor"],
  },
  abstractArrows: {
    imageKey: "abstractArrows",
    baseScale: 0.33,
    minScaleMultiplier: 0.9,
    maxScaleMultiplier: 1.08,
    emissiveStrength: 0.5,
    sizeClass: "small",
    districts: ["neon", "harbor"],
  },
  palmTree: {
    imageKey: "palmTree",
    baseScale: 0.28,
    minScaleMultiplier: 0.9,
    maxScaleMultiplier: 1.05,
    emissiveStrength: 0.42,
    sizeClass: "small",
    districts: ["beach"],
  },
  flamingo: {
    imageKey: "flamingo",
    baseScale: 0.28,
    minScaleMultiplier: 0.9,
    maxScaleMultiplier: 1.05,
    emissiveStrength: 0.42,
    sizeClass: "small",
    districts: ["beach"],
  },
  neonSkull: {
    imageKey: "neonSkull",
    baseScale: 0.3,
    minScaleMultiplier: 0.9,
    maxScaleMultiplier: 1.05,
    emissiveStrength: 0.45,
    sizeClass: "small",
    districts: ["neon"],
  },
};

const PROP_KEYS = Object.keys(PROP_CATALOG);
const SAFE_MARGIN = 160;
const INNER_BAND_REJECT = 90;
const MAX_PROPS_TOTAL = 34;
const MIN_SEPARATION = 320;
const CLUSTER_SEPARATION = 220;
const GRID_CELL = 320;
const LARGE_MIN_SEPARATION = 380;
const OUTER_JITTER = 40;
const ROADSIDE_STEP = 8;
const CLUSTER_MAX_TOTAL = 10;
const CLUSTER_SIZE_MIN = 2;
const CLUSTER_SIZE_MAX = 4;

const DISTRICT_BUDGETS = {
  beach: 8,
  downtown: 9,
  neon: 9,
  harbor: 6,
};

const DISTRICT_WEIGHTS = {
  beach: {
    palmTree: 1.2,
    flamingo: 1.1,
    open24h: 0.9,
  },
  downtown: {
    artDecoHotel: 1.2,
    neonDistrict: 1.1,
    viceCity: 0.7,
  },
  neon: {
    neonSkull: 1.1,
    abstractArrows: 1.0,
    viceCity: 0.8,
  },
  harbor: {
    neonDistrict: 0.6,
    abstractArrows: 0.6,
    open24h: 0.4,
  },
};

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

function pickWeightedPropKey(rng, candidates, weights) {
  let total = 0;
  for (let i = 0; i < candidates.length; i += 1) {
    const key = candidates[i];
    total += weights[key] ?? 1;
  }
  if (total <= 0) {
    return pickPropKey(rng, candidates);
  }
  let roll = rng() * total;
  for (let i = 0; i < candidates.length; i += 1) {
    const key = candidates[i];
    roll -= weights[key] ?? 1;
    if (roll <= 0) {
      return key;
    }
  }
  return candidates[candidates.length - 1];
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

function buildProp(catalogKey, position, rng, districtId) {
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
    districtId,
  };
}

export function generateProps(track, seed = 1337) {
  const rng = mulberry32(seed);
  const props = [];
  const points = track.centerline;
  const hash = makeSpatialHash(GRID_CELL);
  const centroid = getTrackCentroid(points);
  const districtCounts = {
    beach: 0,
    downtown: 0,
    neon: 0,
    harbor: 0,
  };

  let clusteredCount = 0;
  const clusterDistricts = ["downtown", "neon"];
  for (let c = 0; c < clusterDistricts.length; c += 1) {
    const districtId = clusterDistricts[c];
    const district = track.districts.find((entry) => entry.id === districtId);
    if (!district) {
      continue;
    }

    const clusterAttempts = 2 + Math.floor(rng() * 2);
    for (let attempt = 0; attempt < clusterAttempts; attempt += 1) {
      if (
        props.length >= MAX_PROPS_TOTAL ||
        clusteredCount >= CLUSTER_MAX_TOTAL ||
        districtCounts[districtId] >= DISTRICT_BUDGETS[districtId]
      ) {
        break;
      }

      const t =
        district.startT +
        (district.endT - district.startT) * rng();
      const sample = track.getPointAtProgress(t);
      const outwardProbe = createVec2(
        sample.point.x + sample.normal.x * 20,
        sample.point.y + sample.normal.y * 20,
      );
      const inwardProbe = createVec2(
        sample.point.x - sample.normal.x * 20,
        sample.point.y - sample.normal.y * 20,
      );
      const outwardDist =
        (outwardProbe.x - centroid.x) ** 2 +
        (outwardProbe.y - centroid.y) ** 2;
      const inwardDist =
        (inwardProbe.x - centroid.x) ** 2 +
        (inwardProbe.y - centroid.y) ** 2;
      const outwardNormal =
        outwardDist > inwardDist
          ? sample.normal
          : { x: -sample.normal.x, y: -sample.normal.y };
      const baseOffset = track.width + SAFE_MARGIN + 140 + rng() * 80;
      const center = createVec2(
        sample.point.x + outwardNormal.x * baseOffset,
        sample.point.y + outwardNormal.y * baseOffset,
      );
      if (!isOutsideRoad(track, center, SAFE_MARGIN + 140, INNER_BAND_REJECT)) {
        continue;
      }

      const clusterSize =
        CLUSTER_SIZE_MIN + Math.floor(rng() * (CLUSTER_SIZE_MAX - CLUSTER_SIZE_MIN + 1));
      for (let i = 0; i < clusterSize; i += 1) {
        if (
          props.length >= MAX_PROPS_TOTAL ||
          clusteredCount >= CLUSTER_MAX_TOTAL ||
          districtCounts[districtId] >= DISTRICT_BUDGETS[districtId]
        ) {
          break;
        }

        const angle = rng() * Math.PI * 2;
        const radius = 140 + rng() * 90;
        const position = createVec2(
          center.x + Math.cos(angle) * radius,
          center.y + Math.sin(angle) * radius,
        );
        if (!isOutsideRoad(track, position, SAFE_MARGIN + 120, INNER_BAND_REJECT)) {
          continue;
        }

        const candidates = PROP_KEYS.filter((key) =>
          PROP_CATALOG[key].districts?.includes(districtId),
        );
        if (!candidates.length) {
          continue;
        }
        const weights = DISTRICT_WEIGHTS[districtId] || {};
        const key = pickWeightedPropKey(rng, candidates, weights);
        const prop = buildProp(key, position, rng, districtId);
        if (!canPlaceProp(prop, hash, CLUSTER_SEPARATION, LARGE_MIN_SEPARATION)) {
          continue;
        }

        props.push(prop);
        hash.add(prop);
        clusteredCount += 1;
        districtCounts[districtId] += 1;
      }
    }
  }

  const sampleCount = Math.min(points.length * 2, 900);
  for (let i = 0; i < sampleCount; i += ROADSIDE_STEP) {
    if (props.length >= MAX_PROPS_TOTAL) {
      break;
    }

    if (rng() < 0.5) {
      continue;
    }

    const t = (i / sampleCount + rng() * 0.02) % 1;
    const district = track.getDistrictAtProgress(t);
    const districtId = district?.id;
    if (!districtId || districtCounts[districtId] >= DISTRICT_BUDGETS[districtId]) {
      continue;
    }

    const sample = track.getPointAtProgress(t);
    const tangent = sample.tangent;
    const outwardProbe = createVec2(
      sample.point.x + sample.normal.x * 20,
      sample.point.y + sample.normal.y * 20,
    );
    const inwardProbe = createVec2(
      sample.point.x - sample.normal.x * 20,
      sample.point.y - sample.normal.y * 20,
    );

    const outwardDist =
      (outwardProbe.x - centroid.x) ** 2 +
      (outwardProbe.y - centroid.y) ** 2;
    const inwardDist =
      (inwardProbe.x - centroid.x) ** 2 +
      (inwardProbe.y - centroid.y) ** 2;
    const outwardNormal =
      outwardDist > inwardDist
        ? sample.normal
        : { x: -sample.normal.x, y: -sample.normal.y };

    const offset = track.width + SAFE_MARGIN + rng() * 120;
    const position = createVec2(
      sample.point.x + outwardNormal.x * offset + tangent.x * (rng() - 0.5) * OUTER_JITTER,
      sample.point.y + outwardNormal.y * offset + tangent.y * (rng() - 0.5) * OUTER_JITTER,
    );

    if (!isOutsideRoad(track, position, SAFE_MARGIN, INNER_BAND_REJECT)) {
      continue;
    }

    const candidates = PROP_KEYS.filter((key) =>
      PROP_CATALOG[key].districts?.includes(districtId),
    );
    if (!candidates.length) {
      continue;
    }
    const weights = DISTRICT_WEIGHTS[districtId] || {};
    const key = pickWeightedPropKey(rng, candidates, weights);
    const prop = buildProp(key, position, rng, districtId);
    if (!canPlaceProp(prop, hash, MIN_SEPARATION, LARGE_MIN_SEPARATION)) {
      continue;
    }

    props.push(prop);
    hash.add(prop);
    districtCounts[districtId] += 1;
  }

  return props;
}
