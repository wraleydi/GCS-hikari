/**
 * Settings store aggregator. Combines per-domain slices into one persisted
 * Zustand store. State stays unified so the persist middleware writes a
 * single IndexedDB record per session.
 *
 * @license GPL-3.0-only
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { indexedDBStorage } from "@/lib/storage";
import { isDemoMode } from "@/lib/utils";
import { migrateSettings } from "./settings-store/migrations";
import { createDisplayActions, displayDefaults } from "./settings/display-slice";
import { createNetworkActions, networkDefaults } from "./settings/network-slice";
import { authDefaults, createAuthActions } from "./settings/auth-slice";
import { commandTabDefaults, createCommandTabActions } from "./settings/command-tab-slice";
import { createVideoActions, videoDefaults } from "./settings/video-slice";
import type { SettingsStoreState } from "./settings/types";

export type * from "./settings-store-types";
export type { SettingsStoreState } from "./settings/types";
export {
  DEFAULT_PARAM_COLUMNS,
  DEFAULT_TELEMETRY_DECK_PAGES,
  cloneDefaultTelemetryDeckPages,
} from "./settings-store/constants";
export { migrateSettings } from "./settings-store/migrations";

export const useSettingsStore = create<SettingsStoreState>()(
  persist(
    (set, get) => ({
      ...(displayDefaults as SettingsStoreState),
      ...(networkDefaults as SettingsStoreState),
      ...(authDefaults as SettingsStoreState),
      ...(commandTabDefaults as SettingsStoreState),
      ...(videoDefaults as SettingsStoreState),
      ...createDisplayActions(set, get),
      ...createNetworkActions(set, get),
      ...createAuthActions(set, get),
      ...createCommandTabActions(set, get),
      ...createVideoActions(set, get),
    }),
    {
      name: "altcmd:settings",
      storage: createJSONStorage(indexedDBStorage.storage),
      version: 33,
      migrate: migrateSettings,
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        state._hasHydrated = true;
        const envDemo = isDemoMode();
        if (state.demoMode !== envDemo) state.demoMode = envDemo;
      },
    },
  ),
);
