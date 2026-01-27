const ON_COLOR = "rgba(120, 255, 220, 0.95)";
const OFF_COLOR = "rgba(160, 170, 190, 0.85)";
const TEXT_COLOR = "rgba(235, 242, 255, 0.92)";
const HEADER_COLOR = "rgba(140, 200, 255, 0.95)";

function formatToggle(value) {
  return value ? "ON" : "OFF";
}

function toggleColor(value) {
  return value ? ON_COLOR : OFF_COLOR;
}

export function renderHUD(ctx, hudState) {
  const {
    fps,
    version,
    score,
    bestScore,
    multiplier,
    speed,
    headingDeg,
    velDeg,
    driftDeg,
    driftActive,
    particleCount,
    trailRate,
    roadStatus,
    showPropDebug,
    showCollisions,
    propCount,
    propDistrictCounts,
    cameraX,
    cameraY,
    showTrackDebug,
    districtName,
    trackDebugInfo,
    asphaltInfo,
    skylineInfo,
    boostActive,
    boostTimer,
    boostDuration,
    trafficCount,
    nearMissCount,
    showNearMissDebug,
    knockedCount,
  } = hudState;

  ctx.save();
  ctx.fillStyle = TEXT_COLOR;
  ctx.font = "14px 'Segoe UI', system-ui, sans-serif";
  ctx.textBaseline = "top";
  ctx.fillText(`Score: ${Math.floor(score)}`, 16, 12);
  ctx.fillText(`Best: ${Math.floor(bestScore)}`, 16, 30);
  ctx.fillText(`Multiplier: x${multiplier.toFixed(2)}`, 16, 48);
  ctx.fillText(`FPS: ${fps.toFixed(0)}`, 16, 68);
  ctx.fillText(`Neon Drift Runner ${version}`, 16, 86);
  ctx.fillText(`Speed: ${speed.toFixed(1)} u/s`, 16, 106);
  ctx.fillText(`Heading: ${headingDeg.toFixed(1)}°`, 16, 124);
  ctx.fillText(`Vel Dir: ${velDeg.toFixed(1)}°`, 16, 142);
  ctx.fillText(`Drift: ${driftDeg.toFixed(1)}°`, 16, 160);
  ctx.fillText(`Drift Active: ${driftActive}`, 16, 178);
  ctx.fillText(`Particles: ${particleCount}`, 16, 196);
  ctx.fillText(`Trail Rate: ${trailRate.toFixed(1)} / s`, 16, 214);
  ctx.fillText(`Road: ${roadStatus}`, 16, 232);
  ctx.fillText(`Collisions: ${showCollisions ? "ON" : "OFF"}`, 16, 250);

  const boostY = 270;
  const boostWidth = 160;
  const boostHeight = 10;
  const propDebugExtra = showPropDebug && propDistrictCounts ? 18 : 0;
  const asphaltExtra = showTrackDebug && asphaltInfo ? 18 : 0;
  const boostRatio =
    boostActive && boostDuration > 0 ? boostTimer / boostDuration : 0;
  ctx.fillStyle = "rgba(90, 110, 140, 0.5)";
  ctx.fillRect(16, boostY, boostWidth, boostHeight);
  if (boostRatio > 0) {
    ctx.fillStyle = "rgba(120, 255, 220, 0.9)";
    ctx.fillRect(16, boostY, boostWidth * boostRatio, boostHeight);
  }
  if (boostActive) {
    ctx.fillStyle = "rgba(120, 255, 220, 0.95)";
    ctx.fillText("BOOST", 16, boostY + 14);
  }
  if (showPropDebug) {
    ctx.fillText(`Props: ${propCount}`, 16, boostY + 34);
    if (propDistrictCounts) {
      ctx.fillText(
        `Beach:${propDistrictCounts.beach} Downtown:${propDistrictCounts.downtown} Neon:${propDistrictCounts.neon} Harbor:${propDistrictCounts.harbor}`,
        16,
        boostY + 52,
      );
    }
  }
  if (showNearMissDebug) {
    ctx.fillText(
      `Traffic: ${trafficCount}  Near Misses: ${nearMissCount}  Knocked: ${knockedCount}`,
      16,
      showPropDebug ? boostY + 52 + propDebugExtra : boostY + 34,
    );
  }
  ctx.fillText(
    `Camera: ${cameraX.toFixed(1)}, ${cameraY.toFixed(1)}`,
    16,
    showNearMissDebug
      ? boostY + (showPropDebug ? 70 + propDebugExtra : 52)
      : showPropDebug
        ? boostY + 52 + propDebugExtra
        : boostY + 34,
  );
  if (showTrackDebug && districtName) {
    ctx.fillText(
      `District: ${districtName}`,
      16,
      showNearMissDebug
        ? boostY + (showPropDebug ? 88 + propDebugExtra : 70)
        : showPropDebug
          ? boostY + 70 + propDebugExtra
          : boostY + 52,
    );
  }
  if (showTrackDebug && trackDebugInfo) {
    ctx.fillText(
      `Track: retries ${trackDebugInfo.retryCount}  fallback ${trackDebugInfo.fallbackUsed ? "YES" : "NO"}`,
      16,
      showNearMissDebug
        ? boostY + (showPropDebug ? 106 + propDebugExtra : 88)
        : showPropDebug
          ? boostY + 88 + propDebugExtra
          : boostY + 70,
    );
  }
  if (showTrackDebug && asphaltInfo) {
    ctx.fillText(
      `asphaltPattern: ${asphaltInfo.ok ? "OK" : "MISSING"}  scale ${asphaltInfo.scale.toFixed(2)}`,
      16,
      showNearMissDebug
        ? boostY + (showPropDebug ? 124 + propDebugExtra : 106)
        : showPropDebug
          ? boostY + 106 + propDebugExtra
          : boostY + 88,
    );
  }
  if (showTrackDebug && skylineInfo?.currentKey) {
    const nextLabel = skylineInfo.nextKey ? ` -> ${skylineInfo.nextKey}` : "";
    const fadeLabel = skylineInfo.nextKey
      ? ` (${skylineInfo.fadeAlpha.toFixed(2)})`
      : "";
    ctx.fillText(
      `Skyline: ${skylineInfo.currentKey}${nextLabel}${fadeLabel}`,
      16,
      showNearMissDebug
        ? boostY + (showPropDebug ? 124 + propDebugExtra + asphaltExtra : 106 + asphaltExtra)
        : showPropDebug
          ? boostY + 106 + propDebugExtra + asphaltExtra
          : boostY + 88 + asphaltExtra,
    );
    if (skylineInfo.farKey) {
      ctx.fillText(
        `Far: ${skylineInfo.farKey}  Parallax: ${skylineInfo.farParallax.toFixed(2)} / ${skylineInfo.nearParallax.toFixed(2)}`,
        16,
        showNearMissDebug
          ? boostY + (showPropDebug ? 142 + propDebugExtra + asphaltExtra : 124 + asphaltExtra)
          : showPropDebug
            ? boostY + 124 + propDebugExtra + asphaltExtra
            : boostY + 106 + asphaltExtra,
      );
    }
  }
  ctx.restore();
}

export function renderHelpOverlay(ctx, uiState) {
  if (!uiState.showHelp) {
    return;
  }

  const lines = [
    "=== CONTROLS ===",
    "Drive:",
    "  W / A / S / D – Throttle / Steer",
    "  Arrow Keys – Throttle / Steer",
    "  Space – Handbrake",
    "",
    "Visual Toggles:",
    `  H – Skyline        [${formatToggle(uiState.showSkyline)}]`,
    `  N – Neon Props     [${formatToggle(uiState.showNeonProps)}]`,
    `  L – Lane Markings  [${formatToggle(uiState.showLaneMarkings)}]`,
    `  P – Particles      [${formatToggle(uiState.showParticles)}]`,
    `  G – Glow Pass      [${formatToggle(uiState.showGlow)}]`,
    `  M – Motion Blur    [${formatToggle(uiState.showMotionBlur)}]`,
    "",
    "Debug:",
    `  T – Track Debug    [${formatToggle(uiState.showTrackDebug)}]`,
    `  K – Prop Debug     [${formatToggle(uiState.showPropDebug)}]`,
    `  J – Collisions     [${formatToggle(uiState.showCollisions)}]`,
    `  Y – Traffic        [${formatToggle(uiState.showTraffic)}]`,
    `  U – Near Miss HUD  [${formatToggle(uiState.showNearMissDebug)}]`,
    `  I – Bully Collide  [${formatToggle(uiState.showBully)}]`,
  ];

  const padding = 16;
  const lineHeight = 18;
  const width = 360;
  const height = padding * 2 + lineHeight * lines.length;

  ctx.save();
  ctx.fillStyle = "rgba(6, 8, 18, 0.78)";
  ctx.strokeStyle = "rgba(120, 140, 180, 0.35)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  const x = 16;
  const y = 16;
  const radius = 10;
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.font = "13px 'Segoe UI', system-ui, sans-serif";
  ctx.textBaseline = "top";
  let cursorY = y + padding;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.startsWith("===")) {
      ctx.fillStyle = HEADER_COLOR;
      ctx.font = "bold 13px 'Segoe UI', system-ui, sans-serif";
    } else if (line.endsWith("]")) {
      const state = line.includes("[ON]");
      ctx.fillStyle = state ? ON_COLOR : OFF_COLOR;
      ctx.font = "13px 'Segoe UI', system-ui, sans-serif";
    } else if (line.endsWith(":")) {
      ctx.fillStyle = HEADER_COLOR;
      ctx.font = "bold 12.5px 'Segoe UI', system-ui, sans-serif";
    } else {
      ctx.fillStyle = TEXT_COLOR;
      ctx.font = "13px 'Segoe UI', system-ui, sans-serif";
    }

    ctx.fillText(line, x + padding, cursorY);
    cursorY += lineHeight;
  }

  ctx.restore();
}
