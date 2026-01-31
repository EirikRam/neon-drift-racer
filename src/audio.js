const DEFAULT_VOLUME = 0.75;
const DEBUG_AUDIO = false;

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
  let isUnlocked = false;
  let pendingTrack = null;
  let currentTrack = null;
  let crossfade = null;

  function log(...args) {
    if (DEBUG_AUDIO) {
      console.info("[audio]", ...args);
    }
  }

  function getTrack(key) {
    return key === "menu" ? menuTrack : gameplayTrack;
  }

  function getOtherKey(key) {
    return key === "menu" ? "gameplay" : "menu";
  }

  function setCurrent(key) {
    if (currentTrack === key) {
      return;
    }
    currentTrack = key;
  }

  function stopTrack(track) {
    track.pause();
    track.currentTime = 0;
    track.volume = 0;
  }

  function attemptPlay(track, key) {
    if (!track.paused) {
      isUnlocked = true;
      if (key) {
        setCurrent(key);
      }
      return Promise.resolve(true);
    }
    const attempt = track.play();
    if (attempt && typeof attempt.then === "function") {
      return attempt
        .then(() => {
          isUnlocked = true;
          if (key) {
            setCurrent(key);
          }
          return true;
        })
        .catch(() => {
          isUnlocked = false;
          if (key) {
            log(`${key} play blocked`);
          }
          return false;
        });
    }
    isUnlocked = true;
    if (key) {
      setCurrent(key);
    }
    return Promise.resolve(true);
  }

  function startImmediate(key) {
    const track = getTrack(key);
    const otherTrack = getTrack(getOtherKey(key));
    stopTrack(otherTrack);
    track.volume = DEFAULT_VOLUME;
    attemptPlay(track, key).then((played) => {
      if (played) {
        pendingTrack = null;
        if (key === "menu") {
          log("menu started");
        }
      } else {
        pendingTrack = key;
      }
    });
  }

  function startCrossfade(fromKey, toKey, duration = 0.8) {
    const fromTrack = getTrack(fromKey);
    const toTrack = getTrack(toKey);
    if (fromTrack === toTrack) {
      startImmediate(toKey);
      return;
    }
    pendingTrack = null;
    crossfade = {
      fromKey,
      toKey,
      fromTrack,
      toTrack,
      duration: Math.max(0.2, duration),
      elapsed: 0,
    };
    attemptPlay(fromTrack, fromKey);
    attemptPlay(toTrack, toKey).then((played) => {
      if (!played && crossfade && crossfade.toKey === toKey) {
        crossfade = null;
        pendingTrack = toKey;
        fromTrack.volume = DEFAULT_VOLUME;
        setCurrent(fromKey);
        return;
      }
      if (played && toKey === "menu") {
        log("menu started");
      }
    });
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
      setCurrent(crossfade.toKey);
      crossfade = null;
    }
  }

  function tryStartPending() {
    if (!pendingTrack) {
      return;
    }
    const key = pendingTrack;
    if (currentTrack === key) {
      pendingTrack = null;
      return;
    }
    startImmediate(key);
  }

  function requestMenu() {
    log("menu requested");
    if (!currentTrack) {
      pendingTrack = "menu";
      tryStartPending();
      return;
    }
    crossfadeTo("menu", 0.6);
  }

  function requestGameplay() {
    if (!currentTrack) {
      pendingTrack = "gameplay";
      tryStartPending();
      return;
    }
    crossfadeTo("gameplay", 0.9);
  }

  function crossfadeTo(targetKey, duration = 0.7) {
    if (currentTrack === targetKey) {
      return;
    }
    if (!currentTrack) {
      startImmediate(targetKey);
      return;
    }
    startCrossfade(currentTrack, targetKey, duration);
  }

  function unlockFromGesture() {
    isUnlocked = true;
    tryStartPending();
  }

  return {
    update,
    requestMenu,
    requestGameplay,
    crossfadeTo,
    unlockFromGesture,
    tryStartPending,
  };
}
