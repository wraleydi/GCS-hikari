"use client";

/**
 * @module ComputePanelPlaceholder
 * @description Right-pane placeholder for nodes that advertise
 * profile === "compute". The full compute panel surface (Jobs,
 * Models, GPU, Datasets, Outputs, Studio, Settings) is specified at
 * product/specs/compute-agent/ and lands in a future stage. Until
 * then this panel renders a "Coming soon" notice so the operator
 * sees something coherent if a compute node is paired today.
 * @license GPL-3.0-only
 */

import { Server } from "lucide-react";
import { useTranslations } from "next-intl";

export function ComputePanelPlaceholder() {
  const t = useTranslations("command.groundStation.consolidatingNotice");
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-border-default bg-bg-secondary text-text-tertiary">
          <Server size={24} />
        </div>
        <h2 className="text-sm font-display font-semibold text-text-primary">
          {t("computeComingSoon")}
        </h2>
        <p className="mt-2 max-w-md text-xs text-text-tertiary leading-relaxed">
          {t("computeBody")}
        </p>
      </div>
    </div>
  );
}
