/**
 * @module useFleetNodes
 * @description Merges Convex-backed paired drones (cloud) with
 * browser-local paired nodes (LAN-only) into a single sidebar list.
 * Local nodes shadow cloud entries with the same deviceId so a
 * re-pair via local doesn't double-render. The current sidebar
 * shape is PairedDrone; local nodes are adapted to fit.
 * @license GPL-3.0-only
 */

import { useMemo } from "react";
import { useLocalNodesStore, type LocalNode } from "@/stores/local-nodes-store";
import {
  usePairingStore,
  type PairedDrone,
} from "@/stores/pairing-store";

export interface FleetNodeEntry extends PairedDrone {
  /** Wire-contract profile of this node. */
  profile: "drone" | "ground-station" | "compute" | "lite";
  /** Ground-station role when applicable. */
  role?: "direct" | "relay" | "receiver" | null;
  /** True when this entry is browser-local (LAN-paired). False when
   * it was paired via Convex / cloud relay. */
  isLocal: boolean;
}

function adaptLocal(n: LocalNode): FleetNodeEntry {
  return {
    _id: `local:${n.deviceId}`,
    userId: "local",
    deviceId: n.deviceId,
    name: n.name,
    apiKey: n.apiKey,
    agentVersion: n.version,
    board: n.board,
    mdnsHost: n.mdnsHost,
    lastIp: undefined,
    lastSeen: n.lastSeenAt,
    fcConnected: undefined,
    pairedAt: n.pairedAt,
    profile: n.profile,
    role: n.role,
    isLocal: true,
  };
}

function adaptCloud(d: PairedDrone): FleetNodeEntry {
  return {
    ...d,
    // Convex pushStatus syncs profile + role onto cmd_drones from
    // the agent's heartbeat (additive schema). Older rows that
    // predate the field default to drone.
    profile: d.profile ?? "drone",
    role: d.role,
    isLocal: false,
  };
}

export function useFleetNodes(): FleetNodeEntry[] {
  const cloudPaired = usePairingStore((s) => s.pairedDrones);
  const localNodes = useLocalNodesStore((s) => s.nodes);

  return useMemo(() => {
    const localById = new Map(localNodes.map((n) => [n.deviceId, n]));
    const cloudAdapted = cloudPaired
      .filter((d) => !localById.has(d.deviceId))
      .map(adaptCloud);
    const localAdapted = localNodes.map(adaptLocal);
    return [...cloudAdapted, ...localAdapted].sort(
      (a, b) => a.pairedAt - b.pairedAt,
    );
  }, [cloudPaired, localNodes]);
}
