"use client";

/**
 * @module RadioPanel
 * @description Hardware sub-view body for the WFB-ng radio link.
 * Shows topology badge, optional brownout warning, live link metrics
 * (RSSI, bitrate, channel, bandwidth, FEC), the TX power slider, and
 * a stub Bench Test Mode toggle. Pulls live link health from the
 * agent's ground-station status endpoint at 2 Hz, supplements with the
 * paired drone's heartbeat radio block from Convex when available.
 * @license GPL-3.0-only
 */

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Radio as RadioIcon, AlertTriangle } from "lucide-react";
import { useGroundStationStore } from "@/stores/ground-station-store";
import { useAgentConnectionStore } from "@/stores/agent-connection-store";
import { groundStationApiFromAgent } from "@/lib/api/ground-station-api";
import { TxPowerSlider } from "@/components/hardware/TxPowerSlider";
import { Button } from "@/components/ui/button";
import { useConvexSkipQuery } from "@/hooks/use-convex-skip-query";
import { cmdDroneStatusApi } from "@/lib/community-api-drones";
import type {
  RadioLinkState,
  RadioState,
  RadioTopology,
  SetTxPowerResult,
} from "@/lib/api/ground-station/types";

const POLL_INTERVAL_MS = 500;
const EMPTY = "…";

// Threshold: RSSI green when at or above this many dBm.
const RSSI_GREEN_DBM = -55;
// Threshold: RSSI yellow at or above this. Below this is red.
const RSSI_YELLOW_DBM = -75;

// Brownout warning fires when host-VBUS topology is paired with TX
// power above the soft floor. The agent caps the slider at 15 dBm in
// this topology; the warning is informational.
const BROWNOUT_TX_FLOOR_DBM = 12;

// Default safe-floor cap when the agent has not reported a per-driver
// maximum yet. The slider exposes this much head-room conservatively;
// agents that advertise a higher cap unlock more.
const DEFAULT_TX_MAX_DBM = 15;

function rssiClass(dbm: number | null): string {
  if (dbm == null) return "text-text-tertiary";
  if (dbm >= RSSI_GREEN_DBM) return "text-status-success";
  if (dbm >= RSSI_YELLOW_DBM) return "text-status-warning";
  return "text-status-error";
}

function topologyClass(topology: RadioTopology): string {
  if (topology === "external_5v") return "border-status-success/40 text-status-success";
  if (topology === "powered_hub") return "border-accent-primary/40 text-accent-primary";
  return "border-border-default text-text-secondary";
}

interface CloudStatusRadio {
  status?: {
    radio?: RadioState;
    deviceId?: string;
    mdnsHost?: string;
    name?: string;
  } | null;
  drone?: {
    deviceId?: string;
    name?: string;
    mdnsHost?: string;
  };
}

function pickRadioFromCloud(rows: unknown): {
  radio: RadioState | null;
  hostname: string | null;
} {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { radio: null, hostname: null };
  }
  // Prefer the most recently updated row that carries a radio block.
  let bestRadio: RadioState | null = null;
  let bestHost: string | null = null;
  let bestUpdatedAt = -Infinity;
  for (const row of rows as CloudStatusRadio[]) {
    const radio = row.status?.radio;
    if (!radio) continue;
    const updatedAt =
      ((row.status as Record<string, unknown> | null | undefined)?.[
        "updatedAt"
      ] as number | undefined) ?? 0;
    if (updatedAt > bestUpdatedAt) {
      bestUpdatedAt = updatedAt;
      bestRadio = radio;
      bestHost = row.drone?.mdnsHost ?? row.drone?.name ?? row.drone?.deviceId ?? null;
    }
  }
  return { radio: bestRadio, hostname: bestHost };
}

function linkStateLabel(t: ReturnType<typeof useTranslations>, state: RadioLinkState): string {
  const map: Record<RadioLinkState, string> = {
    absent: "linkState.absent",
    disconnected: "linkState.disconnected",
    connecting: "linkState.connecting",
    connected: "linkState.connected",
    degraded: "linkState.degraded",
  };
  return t(map[state]);
}

function topologyLabel(
  t: ReturnType<typeof useTranslations>,
  topology: RadioTopology,
): string {
  if (topology === "host_vbus") return t("topology.hostVbus");
  if (topology === "powered_hub") return t("topology.poweredHub");
  return t("topology.external5v");
}

export function RadioPanel() {
  const t = useTranslations("hardware.radio");

  const agentUrl = useAgentConnectionStore((s) => s.agentUrl);
  const apiKey = useAgentConnectionStore((s) => s.apiKey);
  const hasAgent = Boolean(agentUrl);

  const linkHealth = useGroundStationStore((s) => s.linkHealth);
  const loadStatus = useGroundStationStore((s) => s.loadStatus);

  const [wfbTxPowerDbm, setWfbTxPowerDbm] = useState<number | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);
  const [benchMode, setBenchMode] = useState(false);

  const cloudStatuses = useConvexSkipQuery(cmdDroneStatusApi.listMyCloudStatuses, {
    enabled: hasAgent,
  });
  const { radio: cloudRadio, hostname } = useMemo(
    () => pickRadioFromCloud(cloudStatuses),
    [cloudStatuses],
  );

  // Effective values: prefer the cloud `radio` block (authoritative
  // air-side snapshot), fall back to local link_health and the WFB
  // config endpoint.
  const linkState: RadioLinkState = cloudRadio?.state
    ? (cloudRadio.state as RadioLinkState)
    : linkHealth.rssi_dbm != null
      ? "connected"
      : "disconnected";
  const topology: RadioTopology = cloudRadio?.topology
    ? (cloudRadio.topology as RadioTopology)
    : "host_vbus";
  const rssiDbm = cloudRadio?.rssiDbm ?? linkHealth.rssi_dbm;
  const bitrateKbps = cloudRadio?.bitrateKbps;
  const bitrateMbps =
    bitrateKbps != null
      ? bitrateKbps / 1000
      : linkHealth.bitrate_mbps;
  const channel = cloudRadio?.channel ?? linkHealth.channel;
  const freqMhz = cloudRadio?.freqMhz ?? null;
  const bandwidthMhz = cloudRadio?.bandwidthMhz ?? null;
  const fecRecovered = cloudRadio?.fecRecovered ?? linkHealth.fec_rec;
  const fecLost = cloudRadio?.fecLost ?? linkHealth.fec_lost;
  const driver = cloudRadio?.driver ?? null;
  const iface = cloudRadio?.iface ?? null;
  const txPowerDbm = cloudRadio?.txPowerDbm ?? wfbTxPowerDbm;
  const txPowerMaxDbm = cloudRadio?.txPowerMaxDbm ?? DEFAULT_TX_MAX_DBM;

  // Brownout: VBUS topology + above 12 dBm. Agent firmware caps the
  // slider in hardware; this is just an informational pill.
  const showBrownoutWarning =
    topology === "host_vbus" &&
    txPowerDbm != null &&
    txPowerDbm > BROWNOUT_TX_FLOOR_DBM;

  useEffect(() => {
    const api = groundStationApiFromAgent(agentUrl, apiKey);
    if (!api) return;
    let cancelled = false;
    const poll = async () => {
      if (cancelled || (typeof document !== "undefined" && document.hidden)) return;
      try {
        const status = await api.getStatus();
        if (cancelled) return;
        loadStatus(
          {
            paired_drone: status.paired_drone ?? null,
            profile: status.profile ?? "unconfigured",
            uplink_active: status.uplink_active ?? null,
          },
          status.link_health,
        );
        try {
          const wfb = await api.getWfb();
          if (cancelled) return;
          setWfbTxPowerDbm(
            typeof wfb.tx_power_dbm === "number" ? wfb.tx_power_dbm : null,
          );
        } catch {
          // WFB endpoint missing on this agent profile is fine.
        }
        setPollError(null);
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : "poll failed";
        setPollError(msg);
      }
    };
    void poll();
    const timer = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [agentUrl, apiKey, loadStatus]);

  if (!hasAgent) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-border-default bg-bg-secondary text-text-tertiary">
          <RadioIcon size={24} />
        </div>
        <h2 className="text-sm font-display font-semibold text-text-primary">
          {t("notSupported")}
        </h2>
      </div>
    );
  }

  const onApply = async (dbm: number): Promise<SetTxPowerResult> => {
    const api = groundStationApiFromAgent(agentUrl, apiKey);
    if (!api) {
      throw new Error("agent not connected");
    }
    return api.setTxPower(dbm);
  };

  const initialSliderValue = txPowerDbm ?? 5;
  const safeMax = Math.max(1, txPowerMaxDbm);

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded border border-border-default bg-bg-secondary p-5">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded border px-2.5 py-1 text-xs ${topologyClass(topology)}`}
          >
            <RadioIcon size={12} />
            {topologyLabel(t, topology)}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded border border-border-default bg-bg-tertiary px-2.5 py-1 text-xs text-text-secondary">
            {linkStateLabel(t, linkState)}
          </span>
          {showBrownoutWarning ? (
            <span className="inline-flex items-center gap-1.5 rounded border border-status-warning/40 bg-status-warning/10 px-2.5 py-1 text-xs text-status-warning">
              <AlertTriangle size={12} />
              {t("brownoutWarning")}
            </span>
          ) : null}
        </div>

        {pollError ? (
          <div className="mb-3 rounded border border-status-error/40 bg-status-error/10 px-3 py-2 text-xs text-status-error">
            {pollError}
          </div>
        ) : null}

        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          <StatRow
            label={t("rssi")}
            value={rssiDbm == null ? EMPTY : `${rssiDbm.toFixed(0)} dBm`}
            valueClass={rssiClass(rssiDbm)}
          />
          <StatRow
            label={t("bitrate")}
            value={
              bitrateMbps == null
                ? EMPTY
                : `${bitrateMbps.toFixed(1)} Mbps`
            }
          />
          <StatRow
            label={t("channel")}
            value={
              channel == null
                ? EMPTY
                : freqMhz == null
                  ? `CH ${channel}`
                  : `CH ${channel} (${freqMhz.toFixed(0)} MHz)`
            }
          />
          <StatRow
            label={t("bandwidth")}
            value={bandwidthMhz == null ? EMPTY : `${bandwidthMhz} MHz`}
          />
          <StatRow label={t("fecRecovered")} value={String(fecRecovered)} />
          <StatRow label={t("fecLost")} value={String(fecLost)} />
          {driver ? <StatRow label={t("driver")} value={driver} /> : null}
          {iface ? <StatRow label={t("iface")} value={iface} /> : null}
        </dl>
      </section>

      <section className="rounded border border-border-default bg-bg-secondary p-5">
        <h3 className="mb-1 text-sm font-semibold text-text-primary">
          {t("txPower")}
        </h3>
        <p className="mb-4 text-xs text-text-tertiary">
          {t("txPowerHardCap", { max: safeMax })}
        </p>
        <TxPowerSlider
          currentDbm={txPowerDbm}
          maxDbm={safeMax}
          initialValue={initialSliderValue}
          confirmHostname={hostname}
          onApply={onApply}
        />
      </section>

      <section className="rounded border border-border-default bg-bg-secondary p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h3 className="text-sm font-semibold text-text-primary">
              {t("benchTestMode")}
            </h3>
            <p className="text-xs text-text-tertiary">
              {t("airSide")} / {t("groundSide")}
            </p>
          </div>
          <Button
            variant={benchMode ? "primary" : "secondary"}
            size="sm"
            onClick={() => setBenchMode((v) => !v)}
            disabled
          >
            {t("benchTestMode")}
          </Button>
        </div>
      </section>
    </div>
  );
}

function StatRow({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-baseline justify-between border-b border-border-default py-1.5">
      <dt className="text-xs uppercase tracking-wide text-text-secondary">
        {label}
      </dt>
      <dd className={`font-mono text-sm ${valueClass ?? "text-text-primary"}`}>
        {value}
      </dd>
    </div>
  );
}
