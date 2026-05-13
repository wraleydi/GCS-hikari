"use client";

/**
 * @module GroundStationDetailPanel
 * @description Command-tab right pane for any ground-station node.
 * Mirrors DroneDetailPanel's tab pattern. Tab visibility is driven
 * by the node's current role (direct / relay / receiver) so the
 * operator only sees tabs that make sense for the running profile.
 * @license GPL-3.0-only
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Radio } from "lucide-react";
import { useAgentCapabilitiesStore } from "@/stores/agent-capabilities-store";
import { isDemoMode } from "@/lib/utils";
import { OverviewTab } from "./OverviewTab";
import { RadioTab } from "./RadioTab";
import { NetworkTab } from "./NetworkTab";
import { DisplayTab } from "./DisplayTab";
import { PhysicalUiTab } from "./PhysicalUiTab";
import { PeripheralsTab } from "./PeripheralsTab";
import { MeshTab } from "./MeshTab";
import { DistributedRxTab } from "./DistributedRxTab";

const ALL_TAB_IDS = [
  "overview",
  "radio",
  "network",
  "display",
  "physicalUi",
  "peripherals",
  "mesh",
  "distributedRx",
] as const;

type TabId = (typeof ALL_TAB_IDS)[number];

function visibleTabsForRole(role: string | null | undefined): TabId[] {
  // Direct: solo node, no mesh / distributed RX surfaces.
  // Relay: forward to receivers, keeps Radio.
  // Receiver: combines from relays, doesn't TX, hide Radio.
  // Unknown/missing role: treat as direct (safer minimum than relay).
  if (role === "receiver") {
    return ["overview", "mesh", "distributedRx", "network", "display", "physicalUi", "peripherals"];
  }
  if (role === "relay") {
    return ["overview", "radio", "network", "mesh", "distributedRx", "display", "physicalUi", "peripherals"];
  }
  return ["overview", "radio", "network", "display", "physicalUi", "peripherals"];
}

export function GroundStationDetailPanel() {
  const t = useTranslations("command.groundStation.tabs");
  const tDemo = useTranslations("command.groundStation.demoMode");
  const role = useAgentCapabilitiesStore((s) => s.role);
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  // Ground-station controls call into the agent's REST surface for
  // every tab. Demo mode has no real agent, so all 8 tabs would
  // silently fail. Surface a single guard at the panel level so
  // operators understand why the surface is inert in demo.
  if (isDemoMode()) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-border-default bg-bg-secondary text-text-tertiary">
            <Radio size={24} />
          </div>
          <h2 className="text-sm font-display font-semibold text-text-primary">
            {tDemo("title")}
          </h2>
          <p className="mt-2 max-w-md text-xs text-text-tertiary leading-relaxed">
            {tDemo("body")}
          </p>
        </div>
      </div>
    );
  }

  // Compute the visible tab set once per render so the nav strip and
  // the body always agree even on rapid role flips.
  const visibleIds = visibleTabsForRole(role);
  const tabs = visibleIds.map((id) => ({ id, label: t(id) }));

  // If the role changes such that the current tab is no longer
  // available, fall back to overview at render time. Computing
  // this here (not in an effect) avoids a setState cascade.
  const visibleTab: TabId = visibleIds.includes(activeTab)
    ? activeTab
    : "overview";

  // WAI-ARIA roving-tabindex + arrow-key navigation. The active tab
  // is the only one in the tab order; Left/Right/Home/End move focus
  // AND activate the new tab. Operators using Tab from the sidebar
  // land on the active tab, then use arrow keys inside the tablist.
  function handleTabKey(e: React.KeyboardEvent<HTMLButtonElement>) {
    const idx = visibleIds.indexOf(visibleTab);
    let nextIdx = idx;
    if (e.key === "ArrowRight") {
      nextIdx = (idx + 1) % visibleIds.length;
    } else if (e.key === "ArrowLeft") {
      nextIdx = (idx - 1 + visibleIds.length) % visibleIds.length;
    } else if (e.key === "Home") {
      nextIdx = 0;
    } else if (e.key === "End") {
      nextIdx = visibleIds.length - 1;
    } else {
      return;
    }
    e.preventDefault();
    const nextId = visibleIds[nextIdx];
    setActiveTab(nextId);
    // Move focus to the newly active tab on the next paint so the
    // operator sees the focus ring follow the selection.
    requestAnimationFrame(() => {
      document.getElementById(`gs-tab-${nextId}`)?.focus();
    });
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Tab nav */}
      <div
        role="tablist"
        aria-label="Ground station detail"
        className="flex items-center gap-0 border-b border-border-default bg-bg-secondary px-3 overflow-x-auto"
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            id={`gs-tab-${tab.id}`}
            role="tab"
            aria-selected={visibleTab === tab.id}
            aria-controls={`gs-tabpanel-${tab.id}`}
            tabIndex={visibleTab === tab.id ? 0 : -1}
            onClick={() => setActiveTab(tab.id)}
            onKeyDown={handleTabKey}
            className={
              visibleTab === tab.id
                ? "px-3 py-2.5 text-xs font-medium text-accent-primary border-b-2 border-accent-primary -mb-px whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
                : "px-3 py-2.5 text-xs font-medium text-text-secondary hover:text-text-primary border-b-2 border-transparent whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
            }
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab body */}
      <div
        id={`gs-tabpanel-${visibleTab}`}
        role="tabpanel"
        aria-labelledby={`gs-tab-${visibleTab}`}
        className="flex-1 min-h-0 overflow-auto"
      >
        {visibleTab === "overview" && <OverviewTab />}
        {visibleTab === "radio" && <RadioTab />}
        {visibleTab === "network" && <NetworkTab />}
        {visibleTab === "display" && <DisplayTab />}
        {visibleTab === "physicalUi" && <PhysicalUiTab />}
        {visibleTab === "peripherals" && <PeripheralsTab />}
        {visibleTab === "mesh" && <MeshTab />}
        {visibleTab === "distributedRx" && <DistributedRxTab />}
      </div>
    </div>
  );
}
