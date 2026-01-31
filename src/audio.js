const DEFAULT_VOLUME = 0.75;

function createTrack(src) {
  const audio = new Audio(src);
  audio.loop = true;
  audio.preload = "auto";
  audio.volume = 0;
  return audio;
}

export function createAudioManager() {
  const menuTrack = createTrack("assets/music/midnight_turbo_run.wav");
  const gameplayTrack = createTrack("assets/music/midnight_apex_run.wav");
  let activeKey = null;
  let crossfade = null;

  function safePlay(track) {
    if (!track.paused) {
      return;
    }
    const attempt = track.play();
    if (attempt && typeof attempt.catch === "function") {
      attempt.catch(() => {
        // Autoplay restrictions can block until user input.
      });
    }
  }

  function setActive(key) {
    if (activeKey === key) {
      return;
    }
    activeKey = key;
  }

  function startCrossfade(fromKey, toKey, duration = 0.8) {
    const fromTrack = fromKey === "menu" ? menuTrack : gameplayTrack;
    const toTrack = toKey === "menu" ? menuTrack : gameplayTrack;
    if (fromTrack === toTrack) {
      setActive(toKey);
      fromTrack.volume = DEFAULT_VOLUME;
      safePlay(fromTrack);
      return;
    }
    crossfade = {
      fromKey,
      toKey,
      fromTrack,
      toTrack,
      duration: Math.max(0.2, duration),
      elapsed: 0,
    };
    safePlay(fromTrack);
    safePlay(toTrack);
  }

  function update(dt) {
    if (!crossfade) {
      return;
    }
    crossfade.elapsed += dt;
    const t = Math.min(1, crossfade.elapsed / crossfade.duration);
    crossfade.fromTrack.volume = DEFAULT_VOLUME * (1 - t);
    crossfade.toTrack.volume = DEFAULT_VOLUME * t;
    if (t >= 1) {
      crossfade.fromTrack.pause();
      crossfade.fromTrack.currentTime = 0;
      crossfade.fromTrack.volume = 0;
      crossfade.toTrack.volume = DEFAULT_VOLUME;
      setActive(crossfade.toKey);
      crossfade = null;
    }
  }

  function playMenu() {
    if (!activeKey) {
      gameplayTrack.pause();
      gameplayTrack.volume = 0;
      menuTrack.volume = DEFAULT_VOLUME;
      safePlay(menuTrack);
      setActive("menu");
      return;
    }
    startCrossfade(activeKey, "menu", 0.6);
  }

  function playGameplay() {
    if (!activeKey) {
      menuTrack.pause();
      menuTrack.volume = 0;
      gameplayTrack.volume = DEFAULT_VOLUME;
      safePlay(gameplayTrack);
      setActive("gameplay");
      return;
    }
    startCrossfade(activeKey, "gameplay", 0.9);
  }

  return {
    update,
    playMenu,
    playGameplay,
    startCrossfade,
  };
}
