"use client";

/**
 * @module HardwareRadioPage
 * @description Hardware sub-view for the WFB-ng radio link. Polls the
 * agent's ground-station status endpoint and the WFB config endpoint at
 * 2 Hz while the tab is visible. Renders the topology badge, live link
 * stats, and the TX power slider.
 * @license GPL-3.0-only
 */

import { useTranslations } from "next-intl";
import { PageIntro } from "@/components/hardware/PageIntro";
import { HintChip } from "@/components/hardware/HintChip";
import { RadioPanel } from "@/components/hardware/RadioPanel";
import { VideoLinkPanel } from "@/components/hardware/VideoLinkPanel";

export default function HardwareRadioPage() {
  const t = useTranslations("hardware.radio");
  return (
    <div className="flex flex-col gap-3">
      <PageIntro
        title={t("title")}
        description={t("description")}
        trailing={<HintChip>{t("topology.label")}</HintChip>}
      />
      <RadioPanel />
      <VideoLinkPanel />
    </div>
  );
}
