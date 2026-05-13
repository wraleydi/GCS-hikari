"use client";

/**
 * @module LocalNodesSection
 * @description Inline section in the Command-tab fleet sidebar that
 * lists nodes paired locally over LAN (no Convex). Cloud-paired
 * drones still render in the main list above; this is the
 * complement until the unified NodeSidebar lands.
 *
 * Each row activates the agent connection directly (no cloud relay).
 * @license GPL-3.0-only
 */

import { Cpu, Radio, Server, Trash2 } from "lucide-react";
import {
  useLocalNodesStore,
  type LocalNode,
} from "@/stores/local-nodes-store";
import { useAgentConnectionStore } from "@/stores/agent-connection-store";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

function profileLabel(p: LocalNode["profile"], role?: string | null) {
  if (p === "ground-station") return `GS${role && role !== "direct" ? ` / ${role}` : ""}`;
  if (p === "compute") return "CMP";
  if (p === "lite") return "Lite";
  return "Drone";
}

function profileIcon(p: LocalNode["profile"]) {
  if (p === "ground-station") return Radio;
  if (p === "compute") return Server;
  return Cpu;
}

interface LocalNodesSectionProps {
  onSelect?: (node: LocalNode) => void;
}

export function LocalNodesSection({ onSelect }: LocalNodesSectionProps) {
  const nodes = useLocalNodesStore((s) => s.nodes);
  const removeNode = useLocalNodesStore((s) => s.removeNode);
  const activeUrl = useAgentConnectionStore((s) => s.agentUrl);
  const connect = useAgentConnectionStore((s) => s.connect);
  const disconnect = useAgentConnectionStore((s) => s.disconnect);

  if (nodes.length === 0) return null;

  async function handleSelect(n: LocalNode) {
    onSelect?.(n);
    await connect(n.hostname, n.apiKey);
  }

  function handleRemove(deviceId: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (activeUrl) disconnect();
    removeNode(deviceId);
  }

  return (
    <div className="mt-3 border-t border-border-default pt-3">
      <p className="px-1 mb-2 text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
        Local nodes
      </p>
      <div className="space-y-1">
        {nodes.map((n) => {
          const Icon = profileIcon(n.profile);
          const isActive = activeUrl === n.hostname;
          return (
            <div
              key={n.deviceId}
              role="button"
              tabIndex={0}
              onClick={() => void handleSelect(n)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") void handleSelect(n);
              }}
              className={cn(
                "group flex items-start gap-2 rounded border p-2 cursor-pointer transition-colors",
                isActive
                  ? "border-accent-primary/30 bg-accent-primary/10"
                  : "border-transparent hover:bg-bg-tertiary",
              )}
            >
              <Icon size={14} className="mt-0.5 shrink-0 text-text-secondary" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p
                    className={cn(
                      "truncate text-xs font-medium",
                      isActive ? "text-accent-primary" : "text-text-primary",
                    )}
                  >
                    {n.name}
                  </p>
                  <Badge variant="neutral" className="text-[9px] px-1 py-0">
                    {profileLabel(n.profile, n.role)}
                  </Badge>
                </div>
                <p className="truncate text-[10px] text-text-tertiary">
                  {n.hostname.replace(/^https?:\/\//, "")}
                </p>
              </div>
              <button
                onClick={(e) => handleRemove(n.deviceId, e)}
                title="Forget local node"
                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-text-tertiary hover:text-status-error"
              >
                <Trash2 size={12} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
