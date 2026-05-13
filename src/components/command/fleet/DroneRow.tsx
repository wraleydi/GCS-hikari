"use client";

/**
 * @module fleet/DroneRow
 * @description Per-drone row used by FleetSidebar. Provides expanded and
 * collapsed visual variants. The expanded variant supports inline rename,
 * a hover menu button, and right-click context menu.
 * @license GPL-3.0-only
 */

import { RefObject } from "react";
import { Cpu, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PairedDrone } from "@/stores/pairing-store";
import { SigningStatusBadge } from "../SigningStatusBadge";
import { dotClass, droneLiveness, tierLabel } from "./types";

interface DroneRowCollapsedProps {
  drone: PairedDrone;
  selected: boolean;
  onClick: (drone: PairedDrone) => void;
}

export function DroneRowCollapsed({
  drone,
  selected,
  onClick,
}: DroneRowCollapsedProps) {
  return (
    <button
      onClick={() => onClick(drone)}
      className={cn(
        "w-8 h-8 rounded flex items-center justify-center relative transition-colors",
        selected
          ? "bg-accent-primary/15 text-accent-primary"
          : "hover:bg-bg-tertiary text-text-tertiary"
      )}
      title={drone.name}
    >
      <Cpu size={14} />
      <span
        className={cn(
          "absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full",
          dotClass(droneLiveness(drone))
        )}
      />
    </button>
  );
}

interface DroneRowExpandedProps {
  drone: PairedDrone;
  selected: boolean;
  renaming: boolean;
  renameValue: string;
  renameInputRef: RefObject<HTMLInputElement | null>;
  onClick: (drone: PairedDrone) => void;
  onContextMenu: (
    droneId: string,
    coords: { x: number; y: number }
  ) => void;
  onRenameChange: (value: string) => void;
  onRenameSubmit: (droneId: string) => void;
  onRenameCancel: () => void;
}

export function DroneRowExpanded({
  drone,
  selected,
  renaming,
  renameValue,
  renameInputRef,
  onClick,
  onContextMenu,
  onRenameChange,
  onRenameSubmit,
  onRenameCancel,
}: DroneRowExpandedProps) {
  return (
    <div
      onClick={() => onClick(drone)}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu(drone._id, { x: e.clientX, y: e.clientY });
      }}
      className={cn(
        "flex items-center gap-2 p-2 rounded cursor-pointer transition-colors group",
        selected
          ? "bg-accent-primary/10 border border-accent-primary/30"
          : "hover:bg-bg-tertiary border border-transparent"
      )}
    >
      <div className="relative shrink-0">
        <Cpu size={16} className="text-text-secondary" />
        <span
          className={cn(
            "absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full border border-bg-secondary",
            dotClass(droneLiveness(drone))
          )}
        />
      </div>

      <div className="flex-1 min-w-0">
        {renaming ? (
          <input
            ref={renameInputRef}
            value={renameValue}
            onChange={(e) => onRenameChange(e.target.value)}
            onBlur={() => onRenameSubmit(drone._id)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onRenameSubmit(drone._id);
              if (e.key === "Escape") onRenameCancel();
            }}
            className="w-full text-xs bg-bg-primary border border-accent-primary rounded px-1 py-0.5 text-text-primary outline-none"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <>
            <p className="text-xs font-medium text-text-primary truncate">
              {drone.name}
            </p>
            <div className="flex items-center gap-1.5 mt-0.5">
              {drone.board && (
                <span className="text-[10px] text-text-tertiary truncate">
                  {drone.board}
                </span>
              )}
              {drone.tier != null && (
                <span className="text-[9px] px-1 py-px bg-accent-primary/10 text-accent-primary rounded font-medium">
                  {tierLabel(drone.tier)}
                </span>
              )}
              {drone.profile === "ground-station" && (
                <span
                  className="text-[9px] px-1 py-px bg-accent-primary/10 text-accent-primary rounded font-medium"
                  title={
                    drone.role
                      ? `Ground station — ${drone.role}`
                      : "Ground station"
                  }
                >
                  GS{drone.role && drone.role !== "direct" ? ` / ${drone.role}` : ""}
                </span>
              )}
              {drone.profile === "compute" && (
                <span
                  className="text-[9px] px-1 py-px bg-accent-primary/10 text-accent-primary rounded font-medium"
                  title="Compute node"
                >
                  CMP
                </span>
              )}
              <SigningStatusBadge droneId={drone._id} compact />
            </div>
          </>
        )}
      </div>

      <button
        onClick={(e) => {
          e.stopPropagation();
          const rect = (e.target as HTMLElement).getBoundingClientRect();
          onContextMenu(drone._id, { x: rect.right, y: rect.bottom });
        }}
        className="p-0.5 text-text-tertiary opacity-0 group-hover:opacity-100 hover:text-text-primary transition-all"
      >
        <MoreHorizontal size={14} />
      </button>
    </div>
  );
}
