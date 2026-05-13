"use client";

/**
 * @module HardwarePage
 * @description Hardware-tab landing page. Ground-station controls
 * (network, radio, display, peripherals, physical UI, distributed
 * RX, mesh) consolidated into the Command tab in Stage 3. This
 * page now renders a redirect notice so operator muscle memory
 * still lands on something useful. ``/hardware/controllers``
 * survives as the browser-Gamepad surface.
 * @license GPL-3.0-only
 */

import Link from "next/link";
import { ArrowRight, Gamepad2, Radio } from "lucide-react";
import { useTranslations } from "next-intl";

export default function HardwarePage() {
  const t = useTranslations("command.groundStation.consolidatingNotice");
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-accent-primary/30 bg-accent-primary/10 text-accent-primary">
        <Radio size={24} />
      </div>
      <h2 className="text-base font-display font-semibold text-text-primary">
        {t("title")}
      </h2>
      <p className="mt-2 max-w-md text-xs text-text-tertiary leading-relaxed">
        {t("body")}
      </p>
      <Link
        href="/command"
        className="mt-6 inline-flex items-center gap-2 px-4 py-2 text-xs font-medium bg-accent-primary text-white rounded hover:bg-accent-primary/90 transition-colors"
      >
        Open Command tab
        <ArrowRight size={14} />
      </Link>
      <Link
        href="/hardware/controllers"
        className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-text-secondary hover:text-text-primary transition-colors"
      >
        <Gamepad2 size={14} />
        Open Controllers (browser gamepad)
      </Link>
    </div>
  );
}
