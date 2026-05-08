"use client";

/**
 * @module RosFoxglovePanel
 * @description Embedded Foxglove Studio panel via iframe.
 * Connects to the drone's foxglove_bridge WebSocket on port 8766.
 * @license GPL-3.0-only
 */

import { useState, useMemo } from "react";
import { AlertTriangle, Maximize2, Minimize2, RefreshCw, Wifi, WifiOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRosStore } from "@/stores/ros-store";
import { useAgentCapabilitiesStore } from "@/stores/agent-capabilities-store";

interface RosFoxglovePanelProps {
  /** Compact mode for embedding in Overview. */
  compact?: boolean;
}

export function RosFoxglovePanel({ compact = false }: RosFoxglovePanelProps) {
  const foxgloveUrl = useRosStore((s) => s.foxgloveUrl);
  const rosState = useRosStore((s) => s.rosState);
  const bindFailed = useAgentCapabilitiesStore((s) => s.foxgloveBindFailed);
  const t = useTranslations("ros");
  const [fullscreen, setFullscreen] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);

  // Construct Foxglove Studio URL with the drone's bridge endpoint
  const studioUrl = useMemo(() => {
    if (!foxgloveUrl) return null;
    // Foxglove Studio web app with data source parameter
    return `https://app.foxglove.dev/?ds=foxglove-websocket&ds.url=${encodeURIComponent(foxgloveUrl)}`;
  }, [foxgloveUrl]);

  // Bind-failure short-circuits the iframe: when foxglove_bridge couldn't
  // claim its WebSocket port the iframe will just spin, so surface the
  // error directly.
  if (bindFailed) {
    return (
      <div
        role="alert"
        className={`bg-status-error/10 rounded-lg border border-status-error/30 flex items-center justify-center ${compact ? "h-32" : "h-64"}`}
      >
        <div className="text-center px-4">
          <AlertTriangle className="w-5 h-5 text-status-error mx-auto mb-1" />
          <p className="text-xs text-status-error font-medium">
            {t("foxgloveBindFailed")}
          </p>
        </div>
      </div>
    );
  }

  if (rosState !== "running" || !studioUrl) {
    return (
      <div className={`bg-surface-secondary rounded-lg border border-border-primary flex items-center justify-center ${compact ? "h-32" : "h-64"}`}>
        <div className="text-center">
          <WifiOff className="w-5 h-5 text-text-tertiary mx-auto mb-1" />
          <p className="text-xs text-text-secondary">
            {rosState !== "running" ? "ROS not running" : "Foxglove URL not available"}
          </p>
        </div>
      </div>
    );
  }

  const panelContent = (
    <div className={`relative bg-surface-secondary rounded-lg border border-border-primary overflow-hidden ${
      fullscreen ? "fixed inset-4 z-50" : compact ? "h-48" : "h-96"
    }`}>
      {/* Toolbar */}
      <div className="absolute top-0 right-0 z-10 flex items-center gap-1 p-1.5 bg-surface-primary/80 rounded-bl-lg">
        <div className="flex items-center gap-1 px-2 py-0.5 rounded text-xs">
          <Wifi className="w-3 h-3 text-status-success" />
          <span className="text-text-secondary">Connected</span>
        </div>
        <button
          onClick={() => setIframeKey((k) => k + 1)}
          className="p-1 rounded hover:bg-surface-tertiary transition-colors text-text-secondary"
          title="Reload"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => setFullscreen((f) => !f)}
          className="p-1 rounded hover:bg-surface-tertiary transition-colors text-text-secondary"
          title={fullscreen ? "Exit fullscreen" : "Fullscreen"}
        >
          {fullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Foxglove iframe */}
      <iframe
        key={iframeKey}
        src={studioUrl}
        className="w-full h-full border-0"
        allow="fullscreen"
        title="Foxglove Studio"
      />
    </div>
  );

  return (
    <>
      {panelContent}
      {/* Fullscreen backdrop */}
      {fullscreen && (
        <div
          className="fixed inset-0 bg-black/60 z-40"
          onClick={() => setFullscreen(false)}
        />
      )}
    </>
  );
}
