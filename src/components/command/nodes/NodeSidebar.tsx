"use client";

/**
 * @module NodeSidebar
 * @description Profile-grouped sidebar for every node Mission
 * Control knows about: cloud-paired drones, ground stations,
 * relays, receivers, and locally-paired LAN nodes. Replaces the
 * old single-list "Paired drones" surface with a unified node
 * hub.
 *
 * Cloud and local nodes are merged via ``useFleetNodes`` and
 * grouped by ``profile`` + ``role``. Local nodes carry an
 * ``isLocal`` flag and render a small chip; clicking activates
 * the agent through the local REST direct path.
 *
 * At or above ``VIRTUALIZE_THRESHOLD`` total visible nodes the
 * list switches to ``@tanstack/react-virtual`` rendering with an
 * internal scroll container. Below the threshold the typical
 * inline render is faster than the virtualizer overhead. Mirrors
 * the same pattern in ``FleetSidebar`` for the cloud drone list.
 * @license GPL-3.0-only
 */

import { useMemo, useRef } from "react";
import { useTranslations } from "next-intl";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Cpu, Radio, Server, Trash2 } from "lucide-react";
import { useFleetNodes, type FleetNodeEntry } from "@/hooks/use-fleet-nodes";
import { usePairingStore } from "@/stores/pairing-store";
import { useAgentConnectionStore } from "@/stores/agent-connection-store";
import { useLocalNodesStore } from "@/stores/local-nodes-store";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type GroupKey = "drones" | "groundStations" | "relays" | "receivers" | "compute";

// Below this count the inline `.map()` render is faster than the
// virtualizer overhead. Above it the list becomes its own scroll
// container.
const VIRTUALIZE_THRESHOLD = 12;
// Average row heights for the initial virtualizer estimate. The
// virtualizer measures real heights after first paint via
// `measureElement`.
const HEADER_ROW_HEIGHT = 22;
const NODE_ROW_HEIGHT = 56;
const VIRTUAL_OVERSCAN = 4;

function groupFor(node: FleetNodeEntry): GroupKey {
  if (node.profile === "compute") return "compute";
  if (node.profile === "ground-station") {
    if (node.role === "relay") return "relays";
    if (node.role === "receiver") return "receivers";
    return "groundStations";
  }
  return "drones";
}

function profileIcon(p: FleetNodeEntry["profile"]) {
  if (p === "ground-station") return Radio;
  if (p === "compute") return Server;
  return Cpu;
}

const ORDERED_KEYS: readonly GroupKey[] = [
  "drones",
  "groundStations",
  "relays",
  "receivers",
  "compute",
];

interface NodeSidebarProps {
  onFocusAgent: () => void;
}

type FlatRow =
  | { kind: "header"; key: string; group: GroupKey; count: number }
  | { kind: "node"; key: string; node: FleetNodeEntry; group: GroupKey };

export function NodeSidebar({ onFocusAgent }: NodeSidebarProps) {
  const t = useTranslations("command.nodes");
  const groupLabels: Record<GroupKey, string> = {
    drones: t("drones"),
    groundStations: t("groundStations"),
    relays: t("relays"),
    receivers: t("receivers"),
    compute: t("compute"),
  };

  // Cloud-paired drones still render through FleetSidebar's full-featured
  // list above (rename inline-edit, context menu, virtualization). This
  // sidebar groups every other node by profile: ground stations, relays,
  // receivers, and compute nodes — whether cloud-paired or LAN-paired —
  // plus any local-paired drones that aren't in the Convex-backed list.
  const nodes = useFleetNodes().filter(
    (n) => n.isLocal || n.profile !== "drone",
  );
  const selectedPairedId = usePairingStore((s) => s.selectedPairedId);
  const selectPairedDrone = usePairingStore((s) => s.selectPairedDrone);
  const removeNode = useLocalNodesStore((s) => s.removeNode);
  const connect = useAgentConnectionStore((s) => s.connect);
  const disconnect = useAgentConnectionStore((s) => s.disconnect);
  const activeUrl = useAgentConnectionStore((s) => s.agentUrl);
  const agentConnectCloud = useAgentConnectionStore((s) => s.connectCloud);

  // Group + flatten into a single render list that's friendly to the
  // virtualizer. Memo on nodes so identity is stable as long as the
  // upstream selector returns the same array.
  const flatRows = useMemo<FlatRow[]>(() => {
    const groups: Record<GroupKey, FleetNodeEntry[]> = {
      drones: [],
      groundStations: [],
      relays: [],
      receivers: [],
      compute: [],
    };
    for (const n of nodes) {
      groups[groupFor(n)].push(n);
    }
    const rows: FlatRow[] = [];
    for (const key of ORDERED_KEYS) {
      const group = groups[key];
      if (group.length === 0) continue;
      rows.push({
        kind: "header",
        key: `h:${key}`,
        group: key,
        count: group.length,
      });
      for (const n of group) {
        rows.push({ kind: "node", key: `n:${n._id}`, node: n, group: key });
      }
    }
    return rows;
  }, [nodes]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const useVirtual = nodes.length >= VIRTUALIZE_THRESHOLD;

  const virtualizer = useVirtualizer({
    count: useVirtual ? flatRows.length : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) =>
      flatRows[i]?.kind === "header" ? HEADER_ROW_HEIGHT : NODE_ROW_HEIGHT,
    overscan: VIRTUAL_OVERSCAN,
  });

  if (flatRows.length === 0) return null;

  async function handleSelect(node: FleetNodeEntry) {
    selectPairedDrone(node._id);
    onFocusAgent();
    try {
      // Cleanly tear down any prior connection before switching
      // modes. connect() and connectCloud() both mutate agentUrl /
      // apiKey / cloudMode without an atomic transition, so a
      // back-to-back call can leak a half-configured state.
      disconnect();
      if (node.isLocal) {
        // Local nodes connect directly via the agent's REST URL.
        const hostname =
          useLocalNodesStore
            .getState()
            .nodes.find((n) => n.deviceId === node.deviceId)?.hostname;
        if (hostname && node.apiKey) {
          await connect(hostname, node.apiKey);
        }
      } else {
        // Cloud-paired nodes go through the cloud relay.
        agentConnectCloud(node.deviceId);
      }
    } catch (err) {
      console.error("NodeSidebar handleSelect failed:", err);
    }
  }

  function handleRemoveLocal(deviceId: string, e: React.MouseEvent) {
    e.stopPropagation();
    const node = useLocalNodesStore
      .getState()
      .nodes.find((n) => n.deviceId === deviceId);
    if (node && activeUrl === node.hostname) disconnect();
    removeNode(deviceId);
  }

  function renderHeader(row: Extract<FlatRow, { kind: "header" }>) {
    return (
      <p className="px-1 mb-1 text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
        {groupLabels[row.group]} ({row.count})
      </p>
    );
  }

  function renderNode(row: Extract<FlatRow, { kind: "node" }>) {
    const n = row.node;
    const Icon = profileIcon(n.profile);
    const selected = selectedPairedId === n._id;
    return (
      <div
        role="button"
        tabIndex={0}
        aria-pressed={selected}
        aria-label={`${n.name} ${groupLabels[row.group]}`}
        onClick={() => void handleSelect(n)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            void handleSelect(n);
          }
        }}
        className={cn(
          "group flex items-start gap-2 rounded border p-2 cursor-pointer transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary",
          selected
            ? "border-accent-primary/30 bg-accent-primary/10"
            : "border-transparent hover:bg-bg-tertiary",
        )}
      >
        <Icon
          size={14}
          className={cn(
            "mt-0.5 shrink-0",
            selected ? "text-accent-primary" : "text-text-secondary",
          )}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p
              className={cn(
                "truncate text-xs font-medium",
                selected
                  ? "text-accent-primary"
                  : "text-text-primary",
              )}
            >
              {n.name}
            </p>
            {n.isLocal && (
              <Badge variant="neutral" className="text-[9px] px-1 py-0">
                {t("local")}
              </Badge>
            )}
            {n.role && n.profile === "ground-station" && n.role !== "direct" && (
              <Badge variant="info" className="text-[9px] px-1 py-0">
                {n.role}
              </Badge>
            )}
          </div>
          {n.board && (
            <p className="truncate text-[10px] text-text-tertiary">
              {n.board}
            </p>
          )}
        </div>
        {n.isLocal && (
          <button
            onClick={(e) => handleRemoveLocal(n.deviceId, e)}
            title={t("forgetLocal")}
            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-text-tertiary hover:text-status-error"
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>
    );
  }

  if (useVirtual) {
    return (
      <div
        ref={scrollRef}
        className="mt-3 border-t border-border-default pt-3 max-h-[480px] overflow-auto"
      >
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            position: "relative",
            width: "100%",
          }}
        >
          {virtualizer.getVirtualItems().map((vi) => {
            const row = flatRows[vi.index];
            if (!row) return null;
            return (
              <div
                key={row.key}
                data-index={vi.index}
                ref={virtualizer.measureElement}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  transform: `translateY(${vi.start}px)`,
                  paddingBottom: 4,
                }}
              >
                {row.kind === "header" ? renderHeader(row) : renderNode(row)}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Below threshold: inline render keeps grouping styles + spacing
  // without paying the virtualizer cost.
  return (
    <div className="mt-3 border-t border-border-default pt-3 space-y-3">
      {ORDERED_KEYS.map((key) => {
        const groupRows = flatRows.filter(
          (r) => r.group === key && r.kind === "node",
        ) as Array<Extract<FlatRow, { kind: "node" }>>;
        if (groupRows.length === 0) return null;
        return (
          <div key={key}>
            <p className="px-1 mb-1 text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
              {groupLabels[key]} ({groupRows.length})
            </p>
            <div className="space-y-1">
              {groupRows.map((row) => (
                <div key={row.key}>{renderNode(row)}</div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
