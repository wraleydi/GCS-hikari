"use client";

/**
 * @module LocalDisplayCard
 * @description Renders the SPI LCD attached to the ground-station
 * companion board (e.g. Waveshare 3.5" RPi LCD on Cubie A7Z or Rock 5C).
 * Hidden when no display is bound on the agent side.
 * @license GPL-3.0-only
 */

import { useTranslations } from "next-intl";
import { Monitor } from "lucide-react";
import { useAgentCapabilitiesStore } from "@/stores/agent-capabilities-store";

export function LocalDisplayCard() {
  const display = useAgentCapabilitiesStore((s) => s.display);
  const loaded = useAgentCapabilitiesStore((s) => s.loaded);
  const t = useTranslations("hardware.localDisplay");

  // Wait for at least one capability payload before rendering. Avoids
  // a flash of empty-state during the initial WS handshake.
  if (!loaded) return null;

  // No display attached on the agent side: render nothing. The
  // Physical UI page already shows OLED / Buttons / HDMI status; an
  // empty placeholder for SPI LCD adds noise.
  if (!display || display.type === "none") {
    return null;
  }

  const typeLabel =
    display.type === "spi-lcd"
      ? t("spiLcd")
      : display.type === "hdmi"
      ? t("hdmi")
      : display.type;

  return (
    <section className="mb-4 rounded border border-border-default bg-bg-secondary">
      <header className="flex items-center justify-between border-b border-border-default px-4 py-3">
        <div className="flex items-center gap-2">
          <Monitor size={16} className="text-accent-primary" />
          <h2 className="text-sm font-display font-semibold text-text-primary">
            {t("title")}
          </h2>
        </div>
        <span
          className={
            display.hasTouch
              ? "rounded bg-status-success/15 px-2 py-0.5 text-[11px] font-medium text-status-success"
              : "rounded bg-text-tertiary/15 px-2 py-0.5 text-[11px] font-medium text-text-secondary"
          }
        >
          {display.hasTouch ? t("touchEnabled") : t("touchDisabled")}
        </span>
      </header>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 px-4 py-3 text-xs text-text-secondary sm:grid-cols-4">
        <div>
          <dt className="text-[10px] uppercase tracking-wide text-text-tertiary">
            {t("typeLabel")}
          </dt>
          <dd className="mt-0.5 text-text-primary">{typeLabel}</dd>
        </div>
        {display.controller ? (
          <div>
            <dt className="text-[10px] uppercase tracking-wide text-text-tertiary">
              {t("controller")}
            </dt>
            <dd className="mt-0.5 text-text-primary">{display.controller}</dd>
          </div>
        ) : null}
        {display.resolution ? (
          <div>
            <dt className="text-[10px] uppercase tracking-wide text-text-tertiary">
              {t("resolution")}
            </dt>
            <dd className="mt-0.5 text-text-primary">{display.resolution}</dd>
          </div>
        ) : null}
        {display.rotation !== undefined ? (
          <div>
            <dt className="text-[10px] uppercase tracking-wide text-text-tertiary">
              {t("rotation")}
            </dt>
            <dd className="mt-0.5 text-text-primary">
              {display.rotation}&deg;
            </dd>
          </div>
        ) : null}
      </dl>
    </section>
  );
}
