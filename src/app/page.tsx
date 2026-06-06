"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useDroneManager } from "@/stores/drone-manager";
import { useFleetStore } from "@/stores/fleet-store";
import { useUiStore } from "@/stores/ui-store";
import { DroneListPanel } from "@/components/dashboard/DroneListPanel";
import { DashboardOverview } from "@/components/dashboard/DashboardOverview";
import { DroneDetailPanel } from "@/components/dashboard/DroneDetailPanel";
import { DroneLogsPanel } from "@/components/drone-detail/DroneLogsPanel";
import { EmptyFleetState } from "@/components/dashboard/EmptyFleetState";
import { CloudDroneBridge } from "@/components/dashboard/CloudDroneBridge";

export default function DashboardPage() {
  const t = useTranslations("dashboard");
  const selectedDroneId = useDroneManager((s) => s.selectedDroneId);
  const selectDrone = useDroneManager((s) => s.selectDrone);
  const drones = useFleetStore((s) => s.drones);
  const immersiveMode = useUiStore((s) => s.immersiveMode);
  const exitImmersiveMode = useUiStore((s) => s.exitImmersiveMode);
  const [panelCollapsed, setPanelCollapsed] = useState(selectedDroneId !== null);
  const [logsCollapsed, setLogsCollapsed] = useState(false);
  const [prevSelectedDroneId, setPrevSelectedDroneId] = useState(selectedDroneId);

  if (selectedDroneId !== prevSelectedDroneId) {
    setPrevSelectedDroneId(selectedDroneId);
    setPanelCollapsed(selectedDroneId !== null);
  }

  // Exit immersive mode if drone is deselected
  useEffect(() => {
    if (immersiveMode && selectedDroneId === null) {
      exitImmersiveMode();
    }
  }, [selectedDroneId, immersiveMode, exitImmersiveMode]);

  if (drones.length === 0) {
    return (
      <>
        <CloudDroneBridge />
        <EmptyFleetState />
      </>
    );
  }

  return (
    <div className="flex-1 flex h-full overflow-hidden p-2 gap-2 bg-bg-primary">
      <CloudDroneBridge />
      {!immersiveMode && (
        <div className="flex shrink-0 rounded-panel border border-border-default bg-bg-secondary overflow-hidden">
          <DroneListPanel collapsed={panelCollapsed} onToggleCollapse={() => setPanelCollapsed((p) => !p)} />
        </div>
      )}
      {selectedDroneId ? (
        <div className="flex-1 flex gap-2 overflow-hidden">
          <div className="flex-1 flex rounded-panel border border-border-default bg-bg-secondary overflow-hidden">
            <DroneDetailPanel droneId={selectedDroneId} onClose={() => selectDrone(null)} />
          </div>
          {!immersiveMode && logsCollapsed && (
            <div className="w-10 shrink-0 flex flex-col h-full border-l border-border-default bg-bg-secondary">
              <button
                onClick={() => setLogsCollapsed(false)}
                className="flex flex-col items-center gap-1 px-1 py-2 border-b border-border-default hover:bg-bg-tertiary transition-colors cursor-pointer group"
                title={t("expandLogs")}
              >
                <span className="text-[9px] font-semibold uppercase tracking-wider text-text-tertiary group-hover:text-text-secondary transition-colors">
                  {t("logs")}
                </span>
                <ChevronLeft size={12} className="text-text-tertiary group-hover:text-text-secondary" />
              </button>
            </div>
          )}
          {!immersiveMode && (
            <div className={`w-[384px] shrink-0 flex flex-col h-full border-l border-border-default bg-bg-secondary ${logsCollapsed ? "hidden" : ""}`}>
              <div className="flex items-center gap-2 px-3 py-2 border-b border-border-default flex-shrink-0">
                <button
                  onClick={() => setLogsCollapsed(true)}
                  className="p-1 text-text-tertiary hover:text-text-primary transition-colors"
                  title={t("collapseLogs")}
                >
                  <ChevronRight size={14} />
                </button>
                <span className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
                  {t("flightLogs")}
                </span>
              </div>
              <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                <DroneLogsPanel droneId={selectedDroneId} />
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 rounded-panel border border-border-default bg-bg-secondary overflow-hidden">
          <DashboardOverview />
        </div>
      )}
    </div>
  );
}
