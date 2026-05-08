/**
 * @module InferCapabilities
 * @description Infers agent capabilities (NPU, cameras) from existing agent data
 * when the capabilities API is not available (agent < v0.3.20).
 * Uses board SoC name to look up NPU specs and peripherals list for cameras.
 * @license GPL-3.0-only
 */

import type { AgentStatus, PeripheralInfo } from "@/lib/agent/types";
import type {
  AgentCapabilities,
  AttachedDisplay,
  CameraCapability,
  ComputeCapability,
  LcdGesture,
  VideoLocalTap,
} from "./feature-types";

/**
 * Top-level heartbeat fields the cloud bridge passes through when
 * inferring capabilities. These are flat keys on the cloud row, not
 * nested under a peripheral, so they refresh every heartbeat without
 * waiting for a peripheral re-enumeration. All keys optional —
 * legacy agents that predate any one of them simply omit the field
 * and the inferred capability stays undefined.
 */
export interface InferHeartbeatExtras {
  lcdActivePage?: string | null;
  lcdTouchCalibrated?: boolean | null;
  lcdRotation?: number | null;
  lcdSnapshotUrl?: string | null;
  lcdLastTouchAt?: number | null;
  lcdLastGesture?: string | null;
  videoLocalDecoderActive?: boolean | null;
  videoLocalDecoderType?: string | null;
  videoLocalDecoderFps?: number | null;
  videoRecording?: boolean | null;
  uiTheme?: string | null;
}

const KNOWN_GESTURES: ReadonlySet<LcdGesture> = new Set([
  "tap",
  "long_press",
  "swipe",
  "drag",
]);

/** Known NPU specs by SoC name. */
const NPU_BY_SOC: Record<string, { tops: number; runtime: "rknn" | "tensorrt" }> = {
  // Rockchip RK3588 family (6 TOPS RKNN)
  RK3588: { tops: 6.0, runtime: "rknn" },
  RK3588S: { tops: 6.0, runtime: "rknn" },
  RK3588S2: { tops: 6.0, runtime: "rknn" },
  RK3582: { tops: 6.0, runtime: "rknn" },
  // Rockchip RK3576 (6 TOPS RKNN)
  RK3576: { tops: 6.0, runtime: "rknn" },
  // Rockchip mid-range
  RK3566: { tops: 0.8, runtime: "rknn" },
  RK3568: { tops: 0.8, runtime: "rknn" },
  // Rockchip vision SoCs
  RV1126: { tops: 2.0, runtime: "rknn" },
  RV1126B: { tops: 2.0, runtime: "rknn" },
  RV1109: { tops: 2.0, runtime: "rknn" },
  RV1106: { tops: 0.5, runtime: "rknn" },
  RV1106G3: { tops: 1.0, runtime: "rknn" },
  RV1103: { tops: 0.5, runtime: "rknn" },
  // Broadcom Pi-class boards (no NPU)
  BCM2710A1: { tops: 0, runtime: "rknn" }, // Pi Zero 2 W
  BCM2711: { tops: 0, runtime: "rknn" },   // Pi 4B / CM4
  BCM2712: { tops: 0, runtime: "rknn" },   // Pi 5
  // NVIDIA Jetson
  "Jetson Orin Nano": { tops: 40.0, runtime: "tensorrt" },
  "Jetson Orin NX": { tops: 100.0, runtime: "tensorrt" },
};

/**
 * Infer capabilities from existing agent status + peripherals.
 * Used as a fallback when the agent doesn't have the /api/capabilities endpoint.
 *
 * The optional `heartbeatExtras` argument carries top-level fields
 * the cloud relay forwards on every heartbeat (LCD live state,
 * local video tap, recording flag, UI theme). Inference reads them
 * defensively: each field is independent and any one being absent
 * leaves the matching capability undefined.
 */
export function inferCapabilities(
  status: AgentStatus | null,
  peripherals: PeripheralInfo[],
  heartbeatExtras?: InferHeartbeatExtras,
): AgentCapabilities | null {
  if (!status) return null;

  const board = status.board;
  if (!board) return null;

  // Infer NPU from SoC
  const soc = board.soc ?? "";
  const npuInfo = NPU_BY_SOC[soc] ?? null;

  const compute: ComputeCapability = {
    npu_available: npuInfo !== null,
    npu_runtime: npuInfo?.runtime ?? null,
    npu_tops: npuInfo?.tops ?? 0,
    npu_utilization_pct: 0,
    gpu_available: false,
  };

  // Infer cameras from peripherals
  const cameras: CameraCapability[] = peripherals
    .filter((p) => p.category === "camera")
    .map((p) => ({
      name: p.name,
      type: "usb" as const,
      device: p.address,
      resolution: p.last_reading?.match(/\d+x\d+/)?.[0] ?? "unknown",
      streaming: p.status === "ok",
    }));

  // Infer attached display (SPI LCD) from peripherals. The agent
  // pushes one peripheral with category="display" per /etc/ados/display.conf
  // entry; phase-1 only ships SPI LCDs but the type field stays open
  // so a future HDMI / DPI panel reuses the same surface.
  // Live-state fields (touchCalibrated, activePage, lastTouchAt,
  // lastGesture, snapshotUrl) come from the heartbeat top-level keys
  // so they refresh every tick. Rotation can come from either source;
  // the heartbeat wins because it's authoritative for the current
  // running state (peripheral.extra.rotation reflects only what
  // /etc/ados/display.conf had at boot).
  const extras = heartbeatExtras ?? {};
  const heartbeatGestureRaw =
    typeof extras.lcdLastGesture === "string"
      ? extras.lcdLastGesture
      : undefined;
  const lastGesture: LcdGesture | undefined =
    heartbeatGestureRaw && KNOWN_GESTURES.has(heartbeatGestureRaw as LcdGesture)
      ? (heartbeatGestureRaw as LcdGesture)
      : undefined;

  const displayPeripheral = peripherals.find((p) => p.category === "display");
  const display: AttachedDisplay | undefined = displayPeripheral
    ? {
        type: (displayPeripheral.type as AttachedDisplay["type"]) ?? "spi-lcd",
        controller:
          (displayPeripheral.extra?.controller as string | undefined) ?? undefined,
        hasTouch:
          (displayPeripheral.extra?.has_touch as boolean | undefined) ?? false,
        resolution:
          (displayPeripheral.extra?.resolution as string | undefined) ?? undefined,
        rotation:
          typeof extras.lcdRotation === "number"
            ? extras.lcdRotation
            : (displayPeripheral.extra?.rotation as number | undefined) ?? undefined,
        touchCalibrated:
          typeof extras.lcdTouchCalibrated === "boolean"
            ? extras.lcdTouchCalibrated
            : undefined,
        activePage:
          typeof extras.lcdActivePage === "string"
            ? extras.lcdActivePage
            : undefined,
        lastTouchAt:
          typeof extras.lcdLastTouchAt === "number"
            ? extras.lcdLastTouchAt
            : undefined,
        lastGesture,
        snapshotUrl:
          typeof extras.lcdSnapshotUrl === "string"
            ? extras.lcdSnapshotUrl
            : undefined,
      }
    : undefined;

  // Local video tap snapshot. The agent toggles `active` independent
  // of the decoder type and fps fields, so we surface the block as a
  // whole whenever any of the three keys is present (including
  // `active=false` so the GCS can render "tap paused" instead of
  // disappearing the card).
  const hasVideoLocalTap =
    typeof extras.videoLocalDecoderActive === "boolean" ||
    typeof extras.videoLocalDecoderType === "string" ||
    typeof extras.videoLocalDecoderFps === "number";
  const videoLocalTap: VideoLocalTap | undefined = hasVideoLocalTap
    ? {
        active:
          typeof extras.videoLocalDecoderActive === "boolean"
            ? extras.videoLocalDecoderActive
            : undefined,
        decoderType:
          typeof extras.videoLocalDecoderType === "string"
            ? extras.videoLocalDecoderType
            : undefined,
        fps:
          typeof extras.videoLocalDecoderFps === "number"
            ? extras.videoLocalDecoderFps
            : undefined,
      }
    : undefined;

  const videoRecording =
    typeof extras.videoRecording === "boolean" ? extras.videoRecording : undefined;

  const uiTheme: "dark" | "light" | undefined =
    extras.uiTheme === "dark" || extras.uiTheme === "light"
      ? extras.uiTheme
      : undefined;

  return {
    tier: board.tier,
    cameras,
    compute,
    vision: {
      engine_state: "off",
      active_behavior: null,
      behavior_state: null,
      fps: 0,
      inference_ms: 0,
      model_loaded: null,
      track_count: 0,
      target_locked: false,
      target_confidence: 0,
      obstacle_mode: "off",
      nearest_obstacle_m: null,
      threat_level: "green",
    },
    models: {
      installed: [],
      cache_used_mb: 0,
      cache_max_mb: 500,
      registry_url: "",
    },
    features: {
      enabled: [],
      active: null,
    },
    display,
    videoLocalTap,
    videoRecording,
    uiTheme,
  };
}
