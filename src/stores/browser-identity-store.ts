/**
 * @module BrowserIdentityStore
 * @description Per-browser stable UUID used as the local pair's
 * ``user_id`` when claiming an agent over LAN. The agent's
 * ``/api/pairing/claim`` accepts any string; we use a browser-local
 * UUID so the same browser keeps a consistent owner identity across
 * paired nodes without ever round-tripping through a cloud account.
 *
 * Persisted to localStorage. Generated once on first read.
 * @license GPL-3.0-only
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface BrowserIdentityState {
  browserId: string;
  ensureBrowserId: () => string;
}

function generateBrowserId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `browser_${crypto.randomUUID()}`;
  }
  // Fallback for older browsers — collision-resistant enough for a
  // local pair identity, never used for auth.
  const rand = () => Math.random().toString(36).slice(2, 10);
  return `browser_${rand()}${rand()}${Date.now().toString(36)}`;
}

export const useBrowserIdentityStore = create<BrowserIdentityState>()(
  persist(
    (set, get) => ({
      browserId: "",
      ensureBrowserId: () => {
        let id = get().browserId;
        if (!id) {
          id = generateBrowserId();
          set({ browserId: id });
        }
        return id;
      },
    }),
    {
      name: "altcmd:browser-identity",
      version: 1,
      migrate: (persisted, _version) => persisted as BrowserIdentityState,
    },
  ),
);

/** Read or generate the browser-local UUID synchronously. */
export function getBrowserId(): string {
  return useBrowserIdentityStore.getState().ensureBrowserId();
}
