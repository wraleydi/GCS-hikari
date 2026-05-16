"use client";

/**
 * @module RoleBadge
 * @description Top-bar pill showing the ground-station role and mesh id.
 * Always visible when the agent profile is `ground_station`; hidden when
 * the profile is `drone`, `auto`, or `unconfigured`. Tooltip on hover
 * surfaces mesh_id and peer count when the node is on a mesh.
 * @license GPL-3.0-only
 */

import { useTranslations } from "next-intl";
import { useGroundStationStore } from "@/stores/ground-station-store";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const ROLE_COLORS: Record<string, string> = {
  direct: "bg-white/5 text-text-tertiary border-white/10 shadow-[0_0_10px_rgba(255,255,255,0.02)]",
  relay: "bg-accent-primary/10 text-accent-primary border-accent-primary/20 shadow-[0_0_15px_rgba(58,130,255,0.1)]",
  receiver: "bg-status-success/10 text-status-success border-status-success/20 shadow-[0_0_15px_rgba(34,197,94,0.1)]",
  unset: "bg-status-warning/10 text-status-warning border-status-warning/20 shadow-[0_0_15px_rgba(245,158,11,0.1)]",
};

export function RoleBadge() {
  const t = useTranslations("hardware.role");
  const profile = useGroundStationStore((s) => s.status.profile);
  const roleInfo = useGroundStationStore((s) => s.role.info);
  const meshHealth = useGroundStationStore((s) => s.mesh.health);

  if (profile !== "ground_station") return null;

  const role = roleInfo?.current ?? "unset";
  const meshId = meshHealth?.mesh_id ?? roleInfo?.configured ?? null;
  const peerCount = meshHealth?.peer_count ?? 0;

  const tooltipParts: string[] = [t(role)];
  if (role === "relay" || role === "receiver") {
    if (meshId) tooltipParts.push(`mesh: ${meshId}`);
    tooltipParts.push(`peers: ${peerCount}`);
  }

  return (
    <Tooltip content={tooltipParts.join(" · ")} position="bottom">
      <span
        role="status"
        aria-live="polite"
        className={cn(
          "flex items-center gap-1.5 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider transition-all border rounded-full",
          ROLE_COLORS[role] ?? ROLE_COLORS.unset,
        )}
      >
        {t(role)}
      </span>
    </Tooltip>
  );
}
