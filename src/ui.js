const ON_COLOR = "rgba(190, 255, 235, 0.98)";
const OFF_COLOR = "rgba(210, 220, 235, 0.9)";
const TEXT_COLOR = "rgba(255, 255, 255, 0.98)";
const HEADER_COLOR = "rgba(200, 235, 255, 0.98)";

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
    boostStatus,
    boostSpriteLoaded,
    boostPadCount,
    padsDrawnThisFrame,
    lastBoostPadIndex,
    lastBoostTimeAgo,
    boostTimerRemaining,
    lastBoostImpulse,
    lastBoostSpeedDelta,
    racePhase,
    boostUpdateCalls,
    boostUpdateThisFrame,
    boostDebug,
    lastBoostTriggerTime,
    lastBoostTriggerIndex,
    lastBoostTriggerAttempt,
    compactDebugPanel,
    manualBoostCount,
    boostAppliedThisFrame,
    finishDebug,
    finishCrossCount,
    lapsTotal,
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
    trafficStats,
    raceArmed,
    raceFinished,
    lapProgress,
    startT,
    progressT,
    lastProgress,
    predictedProgressT,
    chosenProgressT,
    rawProgressDelta,
    clampedProgressDelta,
    plausibleProgressDelta,
    branchSnapPrevented,
    lapProgressUnwrapped,
    gateD,
    gateCrossed,
    phase,
    runTimerSeconds,
    screenWidth,
    checkpointIndex,
    checkpointCount,
    lastSplitDelta,
    prevLapProgress,
    nextCheckpointThreshold,
    progressWindowSegments,
  } = hudState;

  const boostY = 400;
  const boostWidth = 160;
  const boostHeight = 10;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  const boostRatio =
    boostActive && boostDuration > 0 ? boostTimer / boostDuration : 0;
  ctx.fillStyle = TEXT_COLOR;
  ctx.font = "14px 'Segoe UI', system-ui, sans-serif";
  ctx.textBaseline = "top";
  ctx.shadowColor = "rgba(0, 0, 0, 0.45)";
  ctx.shadowBlur = 4;
  const lineHeight = 18;
  const mainLines = [
    `Score: ${Math.floor(score)}`,
    `Best: ${Math.floor(bestScore)}`,
    `Multiplier: x${multiplier.toFixed(2)}`,
    `FPS: ${fps.toFixed(0)}`,
    `Speed: ${speed.toFixed(1)} u/s`,
    `Boost: ${boostStatus}`,
    `Run: ${raceFinished ? "FINISHED" : phase}`,
    lapsTotal
      ? `Lap: ${Math.min(finishCrossCount + 1, lapsTotal)}/${lapsTotal}`
      : `Lap: ${(lapProgress * 100).toFixed(0)}%`,
    `Pads: ${boostPadCount}  Drawn: ${padsDrawnThisFrame}`,
  ];
  drawPanel(ctx, 14, 14, mainLines, {
    lineHeight,
    maxWidth: screenWidth * 0.45,
    bgAlpha: 0.45,
  });

  if (showTrackDebug) {
    const debugLines = [];
    if (compactDebugPanel) {
      const distLabel = Number.isFinite(boostDebug?.distUsed)
        ? boostDebug.distUsed.toFixed(0)
        : "n/a";
      const radiusLabel = Number.isFinite(boostDebug?.radiusUsed)
        ? boostDebug.radiusUsed.toFixed(0)
        : "n/a";
      const cdLabel = Number.isFinite(boostDebug?.cdUsed)
        ? boostDebug.cdUsed.toFixed(2)
        : "n/a";
      const skipLabel = boostDebug?.skipReason || "n/a";
      debugLines.push("DEBUG: ON (F3 expand)");
      debugLines.push(`Phase:${racePhase}  Pad:${boostDebug?.nearestIndex + 1 || "n/a"}`);
      debugLines.push(`NearestPad dist:${distLabel} r:${radiusLabel} cd:${cdLabel}`);
      debugLines.push(`BoostActive:${boostActive} Timer:${boostTimer.toFixed(2)} Skip:${skipLabel}`);
    } else {
      const spriteLabel = boostSpriteLoaded ? "YES" : "NO";
      const boostIndexLabel =
        lastBoostPadIndex === null || lastBoostPadIndex === undefined
          ? "n/a"
          : String(lastBoostPadIndex + 1);
      const boostAgoLabel =
        Number.isFinite(lastBoostTimeAgo) ? `${lastBoostTimeAgo.toFixed(2)}s` : "n/a";
      const boostTimerLabel =
        Number.isFinite(boostTimerRemaining) ? `${boostTimerRemaining.toFixed(2)}s` : "n/a";
      const impulseLabel =
        Number.isFinite(lastBoostImpulse) ? lastBoostImpulse.toFixed(0) : "n/a";
      debugLines.push(`Pad Sprite: ${spriteLabel}`);
      debugLines.push(
        `Boost idx: ${boostIndexLabel}  ago: ${boostAgoLabel}  timer: ${boostTimerLabel}  imp: ${impulseLabel}`,
      );
      const boostUpdateLabel = boostUpdateThisFrame ? "YES" : "NO";
      debugLines.push(
        `Phase: ${racePhase}  BoostUpdate: ${boostUpdateLabel} calls: ${boostUpdateCalls}`,
      );
      if (boostDebug) {
        const distLabel = Number.isFinite(boostDebug.distUsed)
          ? boostDebug.distUsed.toFixed(0)
          : "n/a";
        const radiusLabel = Number.isFinite(boostDebug.radiusUsed)
          ? boostDebug.radiusUsed.toFixed(0)
          : "n/a";
        const cdLabel = Number.isFinite(boostDebug.cdUsed)
          ? boostDebug.cdUsed.toFixed(2)
          : "n/a";
        const inLabel = boostDebug.inRangeUsed ? "Y" : "N";
        debugLines.push(
          `TriggerCheck idx:${boostDebug.nearestIndex + 1} dist:${distLabel} r:${radiusLabel} in:${inLabel} cd:${cdLabel} phase:${boostDebug.phaseUsed}`,
        );
        debugLines.push(
          `BoostSkipReason: ${boostDebug.skipReason || "n/a"}  pads:${boostDebug.padsLen} id:${boostDebug.padsId}`,
        );
      }
      if (lastBoostTriggerAttempt) {
        const attemptAgo = (performance.now() - lastBoostTriggerAttempt.time) / 1000;
        debugLines.push(
          `Attempt pad ${lastBoostTriggerAttempt.index + 1} dist:${Number.isFinite(lastBoostTriggerAttempt.dist) ? lastBoostTriggerAttempt.dist.toFixed(1) : "n/a"} ago:${attemptAgo.toFixed(2)}s`,
        );
      }
      debugLines.push(
        `BoostActive: ${boostActive}  Timer: ${boostTimer.toFixed(2)}  Speed: ${speed.toFixed(0)}`,
      );
      if (showNearMissDebug && trafficStats) {
        debugLines.push(
          `Traffic: ${trafficStats.activeCount}  NearMiss: ${nearMissCount}  Knocked: ${knockedCount}`,
        );
      }
      if (trackDebugInfo) {
        debugLines.push(
          `Track: retries ${trackDebugInfo.retryCount}  fallback ${trackDebugInfo.fallbackUsed ? "YES" : "NO"}`,
        );
      }
      debugLines.push(`ManualBoostCount: ${manualBoostCount}`);
      debugLines.push(
        `BoostState active:${boostActive} timer:${boostTimer.toFixed(2)} applied:${boostAppliedThisFrame ? "Y" : "N"}`,
      );
      if (finishDebug) {
        const finishAllowed = finishDebug.allowed ? "Y" : "N";
        const crossedLabel = finishDebug.crossed ? "Y" : "N";
        const tLabel = Number.isFinite(finishDebug.t) ? finishDebug.t.toFixed(3) : "n/a";
        const uLabel = Number.isFinite(finishDebug.unwrapped)
          ? finishDebug.unwrapped.toFixed(3)
          : "n/a";
        const dLabel = Number.isFinite(finishDebug.gateD) ? finishDebug.gateD.toFixed(2) : "n/a";
        const prevLabel = Number.isFinite(finishDebug.prevGateD)
          ? finishDebug.prevGateD.toFixed(2)
          : "n/a";
        const cdLabel = Number.isFinite(finishDebug.cooldown)
          ? finishDebug.cooldown.toFixed(2)
          : "n/a";
        const fwdLabel = Number.isFinite(finishDebug.forward)
          ? finishDebug.forward.toFixed(1)
          : "n/a";
        debugLines.push(
          `FinishEval: YES d:${dLabel} prev:${prevLabel} crossed:${crossedLabel} cd:${cdLabel} fwd:${fwdLabel} lapCross:${finishDebug.finishCrossCount}`,
        );
      }
    }
    drawPanel(ctx, screenWidth - 14, 14, debugLines, {
      lineHeight,
      maxWidth: screenWidth * 0.45,
      bgAlpha: 0.6,
      alignRight: true,
    });
  }

  if (phase === "RACING" && runTimerSeconds !== null) {
    ctx.save();
    ctx.font = "22px 'Segoe UI', system-ui, sans-serif";
    ctx.fillStyle = "rgba(240, 250, 255, 0.95)";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(formatTime(runTimerSeconds), screenWidth / 2, 10);
    ctx.restore();
  }
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
  ctx.restore();
  return;
}

export function drawCenterOverlay(ctx, overlayState) {
  const { text, screenWidth, screenHeight, style } = overlayState;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const centerX = screenWidth / 2;
  const centerY = screenHeight / 2;
  const bandHeight = Math.max(90, screenHeight * 0.12);
  ctx.fillStyle = "rgba(6, 8, 16, 0.55)";
  ctx.fillRect(0, centerY - bandHeight / 2, screenWidth, bandHeight);
  const fontSize =
    style === "countdown"
      ? Math.min(140, screenWidth * 0.18)
      : Math.min(110, screenWidth * 0.14);
  ctx.font = `700 ${fontSize}px 'Segoe UI', system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = Math.max(6, fontSize * 0.08);
  ctx.strokeStyle = "rgba(0, 0, 0, 0.75)";
  ctx.fillStyle =
    style === "checkpoint"
      ? "rgba(120, 255, 220, 0.98)"
      : style === "boost"
        ? "rgba(140, 220, 255, 0.98)"
      : "rgba(255, 240, 220, 0.98)";
  ctx.shadowColor = "rgba(0, 0, 0, 0.6)";
  ctx.shadowBlur = 18;
  ctx.strokeText(text, centerX, centerY);
  ctx.fillText(text, centerX, centerY);
  ctx.restore();
}

export function drawFinishPanel(ctx, stats) {
  if (!stats.showPanel) {
    return;
  }
  const {
    screenWidth,
    screenHeight,
    elapsed,
    score,
    bestScore,
    bestTime,
    newBestScore,
    newBestTime,
    splitTimes,
    bestSplitIndex,
  } = stats;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const panelWidth = Math.min(520, screenWidth * 0.7);
  const splitLines = splitTimes?.length || 0;
  const panelHeight = 220 + splitLines * 22;
  const x = (screenWidth - panelWidth) / 2;
  const y = screenHeight * 0.56;
  ctx.fillStyle = "rgba(6, 8, 18, 0.82)";
  ctx.strokeStyle = "rgba(120, 140, 180, 0.5)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.rect(x, y, panelWidth, panelHeight);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "rgba(240, 250, 255, 0.95)";
  ctx.font = "20px 'Segoe UI', system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  const padding = 20;
  const line = 28;
  ctx.fillText(`Time: ${formatTime(elapsed)}`, x + padding, y + padding);
  ctx.fillText(`Score: ${Math.floor(score)}`, x + padding, y + padding + line);
  ctx.fillText(
    `Best Time: ${bestTime === null ? "--:--.--" : formatTime(bestTime)}`,
    x + padding,
    y + padding + line * 2,
  );
  ctx.fillText(
    `Best Score: ${Math.floor(bestScore)}`,
    x + padding,
    y + padding + line * 3,
  );
  const hasNewBest = newBestTime || newBestScore;
  if (hasNewBest) {
    ctx.fillStyle = "rgba(120, 255, 220, 0.95)";
    ctx.font = "bold 18px 'Segoe UI', system-ui, sans-serif";
    ctx.fillText("NEW BEST!", x + padding, y + padding + line * 4);
  }
  if (splitLines) {
    ctx.font = "16px 'Segoe UI', system-ui, sans-serif";
    const splitBaseY = y + padding + line * (hasNewBest ? 5 : 4);
    for (let i = 0; i < splitLines; i += 1) {
      const prev = i === 0 ? 0 : splitTimes[i - 1];
      const delta = splitTimes[i] - prev;
      ctx.fillStyle = i === bestSplitIndex
        ? "rgba(120, 255, 220, 0.95)"
        : "rgba(220, 230, 245, 0.95)";
      ctx.fillText(
        `CP ${i + 1}: ${formatSplit(delta)}`,
        x + padding,
        splitBaseY + i * 20,
      );
    }
  }
  ctx.fillStyle = "rgba(210, 220, 240, 0.9)";
  ctx.font = "16px 'Segoe UI', system-ui, sans-serif";
  ctx.fillText("Press R to Restart", x + padding, y + panelHeight - 40);
  ctx.restore();
}

function formatTime(seconds) {
  const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const minutes = Math.floor(safe / 60);
  const secs = safe - minutes * 60;
  const whole = Math.floor(secs);
  const frac = Math.floor((secs - whole) * 100);
  const minLabel = String(minutes).padStart(2, "0");
  const secLabel = String(whole).padStart(2, "0");
  const fracLabel = String(frac).padStart(2, "0");
  return `${minLabel}:${secLabel}.${fracLabel}`;
}

function formatSplit(seconds) {
  const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  return `+${safe.toFixed(2)}s`;
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

export function renderNotifications(ctx, notifications, screenWidth) {
  if (!notifications || !notifications.length) {
    return;
  }
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  const centerX = screenWidth / 2;
  let y = 60;
  for (const note of notifications) {
    const text = note.text || "";
    const width = Math.min(420, ctx.measureText(text).width + 40);
    const height = 36;
    ctx.fillStyle = "rgba(6, 8, 18, 0.55)";
    ctx.fillRect(centerX - width / 2, y - height / 2, width, height);
    ctx.fillStyle =
      note.type === "checkpoint"
        ? "rgba(120, 255, 220, 0.98)"
        : note.type === "boost"
          ? "rgba(140, 220, 255, 0.98)"
          : "rgba(255, 240, 220, 0.98)";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "700 20px 'Segoe UI', system-ui, sans-serif";
    ctx.fillText(text, centerX, y);
    y += height + 8;
  }
  ctx.restore();
}

function wrapLines(ctx, text, maxWidth) {
  if (!text) {
    return [""];
  }
  const words = String(text).split(" ");
  const lines = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width <= maxWidth || !line) {
      line = test;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) {
    lines.push(line);
  }
  return lines;
}

function drawPanel(ctx, x, y, lines, opts) {
  const {
    lineHeight = 18,
    paddingX = 8,
    paddingY = 6,
    maxWidth = 360,
    bgAlpha = 0.55,
    alignRight = false,
  } = opts || {};
  const wrapped = [];
  for (const line of lines) {
    wrapped.push(...wrapLines(ctx, line, maxWidth - paddingX * 2));
  }
  const maxLineWidth = wrapped.reduce(
    (max, line) => Math.max(max, ctx.measureText(line).width),
    0,
  );
  const panelWidth = Math.min(maxWidth, Math.max(120, maxLineWidth + paddingX * 2));
  const panelHeight = wrapped.length * lineHeight + paddingY * 2;
  const panelX = alignRight ? x - panelWidth : x;
  const panelY = y;
  ctx.save();
  ctx.fillStyle = `rgba(6, 8, 18, ${bgAlpha})`;
  ctx.fillRect(panelX, panelY, panelWidth, panelHeight);
  ctx.fillStyle = TEXT_COLOR;
  let cursorY = panelY + paddingY;
  for (const line of wrapped) {
    ctx.fillText(line, panelX + paddingX, cursorY);
    cursorY += lineHeight;
  }
  ctx.restore();
  return { x: panelX, y: panelY, width: panelWidth, height: panelHeight };
}
