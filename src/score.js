const STORAGE_KEY = "ndr_best_score";

export const SCORE = {
  driftFactor: 0.045,
  minSpeed: 80,
  maxMultiplier: 4,
  multiplierGain: 0.35,
  multiplierDecay: 0.6,
  comboGrace: 0.8,
  offRoadResetTime: 1.2,
  impactResetThreshold: 0.25,
  boostBonus: 1.15,
};

export function createScoreState() {
  return {
    score: 0,
    multiplier: 1,
    comboTimer: 0,
    bestScore: loadBestScore(),
    runScore: 0,
    driftPointsThisTick: 0,
    offRoadTimer: 0,
  };
}

export function resetRun(state) {
  state.score = 0;
  state.multiplier = 1;
  state.comboTimer = 0;
  state.runScore = 0;
  state.driftPointsThisTick = 0;
  state.offRoadTimer = 0;
}

export function updateScore(state, car, track, dt, boostActive, impactStrength) {
  state.driftPointsThisTick = 0;

  const onRoad = track.isOnRoad(car.position);
  if (!onRoad) {
    state.offRoadTimer += dt;
  } else {
    state.offRoadTimer = 0;
  }

  const drifting = car.driftActive && car.speed > SCORE.minSpeed && onRoad;
  if (drifting) {
    const base =
      Math.abs(car.driftAngle) * car.speed * SCORE.driftFactor * dt;
    const bonus = boostActive ? SCORE.boostBonus : 1;
    const earned = base * bonus;
    state.driftPointsThisTick = earned;
    state.score += earned * state.multiplier;
    state.runScore = state.score;
    state.comboTimer = SCORE.comboGrace;
    state.multiplier = Math.min(
      SCORE.maxMultiplier,
      state.multiplier + SCORE.multiplierGain * dt,
    );
  } else {
    state.comboTimer = Math.max(0, state.comboTimer - dt);
    if (state.comboTimer === 0) {
      state.multiplier = Math.max(
        1,
        state.multiplier - SCORE.multiplierDecay * dt,
      );
    }
  }

  if (state.offRoadTimer > SCORE.offRoadResetTime) {
    state.multiplier = 1;
    state.comboTimer = 0;
    state.offRoadTimer = 0;
  }

  if (impactStrength && impactStrength >= SCORE.impactResetThreshold) {
    state.multiplier = 1;
    state.comboTimer = 0;
  }

  if (state.score > state.bestScore) {
    state.bestScore = state.score;
    saveBestScore(state.bestScore);
  }
}

function loadBestScore() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? Number(stored) || 0 : 0;
  } catch {
    return 0;
  }
}

function saveBestScore(score) {
  try {
    localStorage.setItem(STORAGE_KEY, score.toFixed(0));
  } catch {
    // Ignore storage failures.
  }
}
