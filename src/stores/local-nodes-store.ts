/**
 * @module LocalNodesStore
 * @description Browser-local registry of nodes paired over the LAN
 * without going through Convex. A node here is any agent (drone,
 * ground station, future compute) that the operator paired by
 * pasting a hostname into the Add-a-Node card.
 *
 * Independent of the Convex-backed ``pairing-store`` so the GCS
 * works fully offline. Persisted to localStorage with a version /
 * migrate handler per the project convention.
 * @license GPL-3.0-only
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface LocalNode {
  /** Stable agent device id from the agent's pairing/info response. */
  deviceId: string;
  /** Human-readable name from the agent (operator can edit later). */
  name: string;
  /** Base URL (no trailing slash) the GCS uses to reach this agent. */
  hostname: string;
  /** API key returned by ``/api/pairing/claim`` for this browser. */
  apiKey: string;
  /** Wire-contract profile from ``/api/pairing/info``. */
  profile: "drone" | "ground-station" | "compute" | "lite";
  /** Ground-station role when applicable. */
  role?: "direct" | "relay" | "receiver" | null;
  /** Board name from the agent (e.g. "Raspberry Pi 4B"). */
  board?: string;
  /** Agent version string at pair time. */
  version?: string;
  /** mDNS hostname (``ados-<id>.local``) — used as the canonical reach. */
  mdnsHost?: string;
  /** When the operator paired this node (epoch ms). */
  pairedAt: number;
  /** Last time the GCS confirmed reachability (epoch ms). */
  lastSeenAt?: number;
}

interface LocalNodesState {
  nodes: LocalNode[];
  addNode: (node: LocalNode) => void;
  removeNode: (deviceId: string) => void;
  renameNode: (deviceId: string, name: string) => void;
  touchLastSeen: (deviceId: string) => void;
  clear: () => void;
}

export const useLocalNodesStore = create<LocalNodesState>()(
  persist(
    (set) => ({
      nodes: [],
      addNode: (node) =>
        set((state) => {
          const existing = state.nodes.findIndex(
            (n) => n.deviceId === node.deviceId,
          );
          if (existing >= 0) {
            const next = state.nodes.slice();
            next[existing] = { ...next[existing], ...node };
            return { nodes: next };
          }
          return { nodes: [...state.nodes, node] };
        }),
      removeNode: (deviceId) =>
        set((state) => ({
          nodes: state.nodes.filter((n) => n.deviceId !== deviceId),
        })),
      renameNode: (deviceId, name) =>
        set((state) => ({
          nodes: state.nodes.map((n) =>
            n.deviceId === deviceId ? { ...n, name } : n,
          ),
        })),
      touchLastSeen: (deviceId) =>
        set((state) => ({
          nodes: state.nodes.map((n) =>
            n.deviceId === deviceId ? { ...n, lastSeenAt: Date.now() } : n,
          ),
        })),
      clear: () => set({ nodes: [] }),
    }),
    {
      name: "altcmd:local-nodes",
      version: 1,
      migrate: (persisted, _version) => persisted as LocalNodesState,
    },
  ),
);
