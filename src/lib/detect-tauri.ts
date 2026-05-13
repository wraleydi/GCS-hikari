/**
 * @module detectTauri
 * @description Runtime check for the Tauri 2 desktop wrapper.
 * Mirrors the ``isElectron()`` helper in ``src/lib/utils.ts``.
 *
 * Tauri 2 injects ``window.__TAURI_INTERNALS__`` (and ``__TAURI__`` on
 * older builds). Either presence is treated as "we're running inside
 * the Tauri wrapper". The check is safe in SSR (returns false because
 * ``window`` is undefined).
 * @license GPL-3.0-only
 */

export function isTauri(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as {
    __TAURI_INTERNALS__?: unknown;
    __TAURI__?: unknown;
  };
  return Boolean(w.__TAURI_INTERNALS__ || w.__TAURI__);
}
