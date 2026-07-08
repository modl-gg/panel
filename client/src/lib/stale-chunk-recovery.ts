const RELOAD_GUARD_KEY = "modl:stale-chunk-reloaded";
const GUARD_RESET_DELAY_MS = 5000;

function hasReloaded(): boolean {
  try {
    return sessionStorage.getItem(RELOAD_GUARD_KEY) !== null;
  } catch {
    return true;
  }
}

function markReloaded(): void {
  try {
    sessionStorage.setItem(RELOAD_GUARD_KEY, "1");
  } catch {
    return;
  }
}

function clearReloadGuard(): void {
  try {
    sessionStorage.removeItem(RELOAD_GUARD_KEY);
  } catch {
    return;
  }
}

export function registerStaleChunkRecovery(): void {
  window.addEventListener("vite:preloadError", (event) => {
    if (hasReloaded()) {
      return;
    }
    event.preventDefault();
    markReloaded();
    window.location.reload();
  });

  window.addEventListener("load", () => {
    window.setTimeout(clearReloadGuard, GUARD_RESET_DELAY_MS);
  });
}
