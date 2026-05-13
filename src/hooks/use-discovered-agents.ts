/**
 * @module useDiscoveredAgents
 * @description Polls the Tauri Rust backend for ADOS agents on the
 * local LAN via mDNS and populates ``pairing-store.discoveredAgents``.
 * No-op outside the Tauri wrapper (browser GCS doesn't have mDNS in
 * the sandbox; that's the entire reason the Tauri build exists).
 *
 * Wire contract: the Rust side returns a list of agents whose TXT
 * records came from ``_ados._tcp.local.``. We filter out agents that
 * report ``paired === true`` since they're already owned and the
 * AddNodeCard doesn't have a useful action for them yet.
 * @license GPL-3.0-only
 */

import { useEffect, useRef } from "react";
import { isTauri } from "@/lib/detect-tauri";
import {
  usePairingStore,
  type DiscoveredAgent,
} from "@/stores/pairing-store";

interface TauriDiscoveredAgent {
  device_id: string;
  name: string;
  board: string;
  version: string;
  pairing_code: string;
  mdns_host: string;
  local_ip: string | null;
  profile: string | null;
  role: string | null;
  paired: boolean;
}

const POLL_INTERVAL_MS = 5000;

function adapt(t: TauriDiscoveredAgent): DiscoveredAgent {
  return {
    deviceId: t.device_id,
    name: t.name || "ADOS Agent",
    board: t.board || "unknown",
    version: t.version || "",
    pairingCode: t.pairing_code || "",
    mdnsHost: t.mdns_host,
    localIp: t.local_ip ?? undefined,
  };
}

export function useDiscoveredAgents(): void {
  const setDiscoveredAgents = usePairingStore(
    (s) => s.setDiscoveredAgents,
  );
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    if (!isTauri()) {
      return () => {
        mountedRef.current = false;
      };
    }

    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const poll = async () => {
      if (cancelled || !mountedRef.current) return;
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const out = (await invoke("discover_ados_agents")) as
          | TauriDiscoveredAgent[]
          | undefined;
        if (cancelled || !mountedRef.current) return;
        const agents = (out ?? [])
          .filter((a) => !a.paired)
          .filter((a) => a.device_id.length > 0)
          .map(adapt);
        setDiscoveredAgents(agents);
      } catch (err) {
        if (cancelled || !mountedRef.current) return;
        console.warn("useDiscoveredAgents: invoke failed", err);
        setDiscoveredAgents([]);
      }
    };

    void poll();
    timer = setInterval(() => void poll(), POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      mountedRef.current = false;
      if (timer) clearInterval(timer);
    };
  }, [setDiscoveredAgents]);
}
