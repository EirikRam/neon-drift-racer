const SUPPORTED_KEYS = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "ArrowUp",
  "ArrowLeft",
  "ArrowDown",
  "ArrowRight",
  "Space",
  "Shift",
  "KeyR",
  "KeyC",
  "KeyP",
  "KeyG",
  "KeyM",
  "KeyT",
  "KeyH",
  "KeyN",
  "KeyL",
  "KeyK",
  "Slash",
  "F1",
]);

const down = new Set();
const pressed = new Set();
const released = new Set();

function normalizeKey(code) {
  if (code === "ShiftLeft" || code === "ShiftRight") {
    return "Shift";
  }

  if (SUPPORTED_KEYS.has(code)) {
    return code;
  }

  return null;
}

function handleKeyDown(event) {
  const key = normalizeKey(event.code);
  if (!key) {
    return;
  }

  if (!down.has(key)) {
    pressed.add(key);
  }

  down.add(key);
}

function handleKeyUp(event) {
  const key = normalizeKey(event.code);
  if (!key) {
    return;
  }

  if (down.has(key)) {
    released.add(key);
  }

  down.delete(key);
}

function handleBlur() {
  down.clear();
  pressed.clear();
  released.clear();
}

window.addEventListener("keydown", handleKeyDown);
window.addEventListener("keyup", handleKeyUp);
window.addEventListener("blur", handleBlur);

export function isDown(key) {
  const normalized = normalizeKey(key) ?? key;
  return down.has(normalized);
}

export function wasPressed(key) {
  const normalized = normalizeKey(key) ?? key;
  return pressed.has(normalized);
}

export function wasReleased(key) {
  const normalized = normalizeKey(key) ?? key;
  return released.has(normalized);
}

export function endFrame() {
  pressed.clear();
  released.clear();
}
