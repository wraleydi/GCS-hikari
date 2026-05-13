"use client";

/**
 * @module HardwareLayout
 * @description Slim layout for the Hardware tab. The full
 * ground-station sub-nav was retired in Stage 5 once those
 * surfaces consolidated into the Command tab. This shell now
 * just centres a content column for the residual Hardware
 * routes: the consolidation notice at ``/hardware`` and the
 * browser-gamepad surface at ``/hardware/controllers``.
 * @license GPL-3.0-only
 */

export default function HardwareLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 overflow-hidden bg-bg-primary">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl px-6 py-6">{children}</div>
      </div>
    </div>
  );
}
