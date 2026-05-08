// WFB-ng radio config plus distributed receive (relay and receiver) status.

import type { WfbConfig } from "@/stores/ground-station-store";
import type {
  AutoPairToggleResponse,
  LocalBindSession,
  PairResult,
  PairStatusResponse,
  SetTxPowerResult,
  UnpairResult,
  WfbReceiverCombined,
  WfbReceiverRelay,
  WfbRelayStatus,
} from "./types";
import { gsRequest, type RequestContext } from "./request";

export function getWfb(ctx: RequestContext): Promise<WfbConfig> {
  return gsRequest<WfbConfig>(ctx, "/api/v1/ground-station/wfb");
}

export function setWfb(ctx: RequestContext, partial: Partial<WfbConfig>): Promise<WfbConfig> {
  return gsRequest<WfbConfig>(ctx, "/api/v1/ground-station/wfb", {
    method: "PUT",
    body: JSON.stringify(partial),
  });
}

/** Set the requested TX power in dBm. The agent clamps to the active
 *  driver's maximum and returns the effective value alongside the cap. */
export function setTxPower(
  ctx: RequestContext,
  dbm: number,
): Promise<SetTxPowerResult> {
  return gsRequest<SetTxPowerResult>(ctx, "/api/wfb/tx-power", {
    method: "PUT",
    body: JSON.stringify({ tx_power_dbm: dbm }),
  });
}

export function pairDrone(
  ctx: RequestContext,
  pairKey: string,
  droneId?: string,
): Promise<PairResult> {
  const body: Record<string, string> = { pair_key: pairKey };
  if (droneId) body.drone_device_id = droneId;
  return gsRequest<PairResult>(ctx, "/api/v1/ground-station/wfb/pair", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function unpairDrone(ctx: RequestContext): Promise<UnpairResult> {
  return gsRequest<UnpairResult>(ctx, "/api/v1/ground-station/wfb/pair", {
    method: "DELETE",
  });
}

/** Relay-side WFB fragment counters plus receiver reachability. */
export function getWfbRelayStatus(ctx: RequestContext): Promise<WfbRelayStatus> {
  return gsRequest<WfbRelayStatus>(ctx, "/api/v1/ground-station/wfb/relay/status");
}

/** Per-relay fragment counters on the receiver. */
export function getWfbReceiverRelays(
  ctx: RequestContext,
): Promise<{ relays: WfbReceiverRelay[] }> {
  return gsRequest(ctx, "/api/v1/ground-station/wfb/receiver/relays");
}

/** Combined FEC output stats on the receiver. */
export function getWfbReceiverCombined(ctx: RequestContext): Promise<WfbReceiverCombined> {
  return gsRequest<WfbReceiverCombined>(ctx, "/api/v1/ground-station/wfb/receiver/combined");
}

// ─── v0.16 pair surface ─────────────────────────────────────────
// All four routes are role-agnostic: the agent infers `drone` vs `gs`
// from its own profile and runs the matching half of the bind
// protocol. Direct REST against the agent's own listener (LAN, USB
// tether, or Cloudflare tunnel) — no Convex hop needed.

/** Open a local-radio bind window. Synchronous: the agent runs the
 *  upstream wfb-ng protocol to completion and returns the terminal
 *  session shape (paired / failed / aborted). 60-second hard cap.
 *  HTTP 409 if a session is already in flight. */
export function openLocalBind(
  ctx: RequestContext,
  options: { role?: "drone" | "gs"; peer_device_id?: string } = {},
): Promise<LocalBindSession> {
  return gsRequest<LocalBindSession>(ctx, "/api/wfb/pair/local-bind", {
    method: "POST",
    body: JSON.stringify(options),
  });
}

/** Snapshot of the most recent bind session, or `{}` if none has run. */
export function getLocalBindStatus(
  ctx: RequestContext,
): Promise<LocalBindSession | Record<string, never>> {
  return gsRequest(ctx, "/api/wfb/pair/local-bind");
}

/** Pair-state snapshot: paired flag, peer device-id, fingerprint, role,
 *  auto-pair flag. Polled by the GCS card to drive the status pill. */
export function getPairStatus(
  ctx: RequestContext,
): Promise<PairStatusResponse> {
  return gsRequest<PairStatusResponse>(ctx, "/api/wfb/pair");
}

/** Wipe both key files, clear pair state, restart the wfb service.
 *  Leaves auto_pair_enabled = false; re-arming is explicit. */
export function unpairRadio(
  ctx: RequestContext,
): Promise<{ paired: false; role: "drone" | "gs" }> {
  return gsRequest(ctx, "/api/wfb/pair/unpair", {
    method: "POST",
  });
}

/** Toggle auto-pair on first boot. Re-arming is rejected (with a flag,
 *  not a 4xx) when already paired; operators must `unpairRadio` first. */
export function setAutoPair(
  ctx: RequestContext,
  enabled: boolean,
): Promise<AutoPairToggleResponse> {
  return gsRequest<AutoPairToggleResponse>(ctx, "/api/wfb/pair/auto-pair", {
    method: "PUT",
    body: JSON.stringify({ enabled }),
  });
}
