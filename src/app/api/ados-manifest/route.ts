/**
 * Server-side proxy for the ADOS Agent firmware manifest.
 *
 * Fetches the manifest published as a GitHub Release asset on the public
 * altnautica/ADOSDroneAgent repo. Falls back to an embedded baseline so the
 * Flash Tool stays usable when no release is reachable. 1-hour in-memory
 * cache, with a `?bust=true` query param to force a fresh upstream fetch.
 *
 * The response always carries a `source` field so the GCS can render an
 * "offline catalog" indicator when the embedded fallback is being served.
 *
 * @license GPL-3.0-only
 */

import { NextResponse, type NextRequest } from "next/server";

import {
  fetchWithTimeout,
  readArrayBufferWithLimit,
} from "@/lib/net/fetch-with-timeout";
import type {
  AdosAgentInstall,
  AdosAgentManifestData,
  AdosAgentBoard,
} from "@/lib/protocol/firmware/ados-agent-manifest";

const DEFAULT_MANIFEST_URL =
  "https://github.com/altnautica/ADOSDroneAgent/releases/latest/download/ados-agent-manifest.json";
const CACHE_TTL = 60 * 60 * 1000;
const MAX_BYTES = 1 * 1024 * 1024;

interface CachedData {
  timestamp: number;
  data: AdosAgentManifestData;
  source: "github" | "fallback";
}

let cache: CachedData | null = null;

export async function GET(request: NextRequest) {
  const bust = request.nextUrl.searchParams.get("bust") === "true";

  if (!bust && cache && Date.now() - cache.timestamp < CACHE_TTL) {
    return NextResponse.json({ ...cache.data, source: cache.source });
  }

  const manifestUrl = process.env.ADOS_MANIFEST_URL || DEFAULT_MANIFEST_URL;

  try {
    const res = await fetchWithTimeout(manifestUrl, {
      headers: { Accept: "application/json" },
      redirect: "follow",
    });

    if (!res.ok) {
      // 404 is expected before the first release ships. Serve embedded.
      return NextResponse.json(serveEmbedded());
    }

    const buffer = await readArrayBufferWithLimit(res, MAX_BYTES);
    const text = new TextDecoder("utf-8").decode(buffer);

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return NextResponse.json(serveEmbedded());
    }

    const validation = validateManifest(parsed);
    if (!validation.ok) {
      // Upstream returned malformed JSON; refuse it and serve the embedded
      // baseline so the Flash Tool still has a usable catalog.
      return NextResponse.json(serveEmbedded());
    }

    cache = {
      timestamp: Date.now(),
      data: validation.data,
      source: "github",
    };
    return NextResponse.json({ ...validation.data, source: "github" });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return NextResponse.json(serveEmbedded());
    }
    return NextResponse.json(serveEmbedded());
  }
}

// ── Validation ────────────────────────────────────────────────
//
// Tighter than the prior 3-field check. Walks every board + install entry
// and rejects malformed data with a specific message. Keeps the proxy free
// of any new dependency (no zod) so the bundle size stays put.

interface ValidationResult {
  ok: boolean;
  data: AdosAgentManifestData;
  error?: string;
}

const SHA256_HEX = /^[0-9a-f]{64}$/i;
const ARCHES = new Set(["armv7-musl", "aarch64-musl", "aarch64-glibc"]);
const STACKS = new Set(["ados-drone-agent", "ados-ground-agent"]);

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validateInstall(
  install: unknown,
  context: string,
): { ok: boolean; error?: string; install?: AdosAgentInstall } {
  if (!isObject(install)) {
    return { ok: false, error: `${context}: install entry is not an object` };
  }
  const method = install.method;
  if (method === "curl") {
    const command = install.command;
    if (typeof command !== "string" || command.trim().length === 0) {
      return {
        ok: false,
        error: `${context}: curl install missing non-empty command`,
      };
    }
    return { ok: true, install: install as unknown as AdosAgentInstall };
  }
  if (method === "web-flash") {
    const imageUrl = install.imageUrl;
    const sha256 = install.sha256;
    const sig = install.minisignSignature;
    const size = install.imageSizeBytes;
    if (typeof imageUrl !== "string") {
      return { ok: false, error: `${context}: web-flash imageUrl missing` };
    }
    if (typeof sha256 !== "string") {
      return { ok: false, error: `${context}: web-flash sha256 missing` };
    }
    // Empty strings are allowed only when the manifest publishes a board
    // entry before any image artifact has been built; in that case all
    // four fields are blanked together. Reject mixed states.
    const allBlank =
      imageUrl === "" && sha256 === "" && sig === "" && size === 0;
    if (!allBlank) {
      if (sha256.length > 0 && !SHA256_HEX.test(sha256)) {
        return {
          ok: false,
          error: `${context}: web-flash sha256 not 64 hex chars`,
        };
      }
      if (typeof size !== "number" || size <= 0) {
        return {
          ok: false,
          error: `${context}: web-flash imageSizeBytes must be > 0`,
        };
      }
      if (imageUrl.length === 0) {
        return {
          ok: false,
          error: `${context}: web-flash imageUrl cannot be empty when sha256 is set`,
        };
      }
    }
    if (typeof sig !== "string") {
      return {
        ok: false,
        error: `${context}: web-flash minisignSignature must be a string`,
      };
    }
    // Optional loader-blob fields. When present they must be self-consistent.
    if ("loaderBlobUrl" in install || "loaderBlobSha256" in install) {
      const blobUrl = install.loaderBlobUrl;
      const blobSha = install.loaderBlobSha256;
      if (typeof blobUrl !== "string" || blobUrl.length === 0) {
        return {
          ok: false,
          error: `${context}: loaderBlobUrl must be non-empty when present`,
        };
      }
      if (
        typeof blobSha !== "string" ||
        (blobSha.length > 0 && !SHA256_HEX.test(blobSha))
      ) {
        return {
          ok: false,
          error: `${context}: loaderBlobSha256 must be 64 hex chars`,
        };
      }
    }
    return { ok: true, install: install as unknown as AdosAgentInstall };
  }
  return {
    ok: false,
    error: `${context}: unknown install method "${String(method)}"`,
  };
}

function validateBoard(
  board: unknown,
  index: number,
): { ok: boolean; error?: string; board?: AdosAgentBoard } {
  if (!isObject(board)) {
    return { ok: false, error: `boards[${index}] is not an object` };
  }
  const id = board.id;
  if (typeof id !== "string" || id.length === 0) {
    return { ok: false, error: `boards[${index}].id missing` };
  }
  if (typeof board.label !== "string" || board.label.length === 0) {
    return { ok: false, error: `boards[${index}].label missing` };
  }
  if (typeof board.soc !== "string" || board.soc.length === 0) {
    return { ok: false, error: `boards[${index}].soc missing` };
  }
  if (typeof board.arch !== "string" || !ARCHES.has(board.arch)) {
    return {
      ok: false,
      error: `boards[${index}].arch invalid (${String(board.arch)})`,
    };
  }
  if (!Array.isArray(board.stacks) || board.stacks.length === 0) {
    return { ok: false, error: `boards[${index}].stacks empty or missing` };
  }
  for (const stack of board.stacks) {
    if (typeof stack !== "string" || !STACKS.has(stack)) {
      return {
        ok: false,
        error: `boards[${index}].stacks contains unknown "${String(stack)}"`,
      };
    }
  }
  if (!isObject(board.installs)) {
    return {
      ok: false,
      error: `boards[${index}].installs is not an object`,
    };
  }
  for (const [stack, install] of Object.entries(board.installs)) {
    if (!STACKS.has(stack)) {
      return {
        ok: false,
        error: `boards[${index}].installs has unknown stack "${stack}"`,
      };
    }
    const installResult = validateInstall(
      install,
      `boards[${index}].installs.${stack}`,
    );
    if (!installResult.ok) {
      return { ok: false, error: installResult.error };
    }
  }
  return { ok: true, board: board as unknown as AdosAgentBoard };
}

function validateManifest(data: unknown): ValidationResult {
  if (!isObject(data)) {
    return {
      ok: false,
      data: EMBEDDED_FALLBACK,
      error: "manifest is not an object",
    };
  }
  if (typeof data.schemaVersion !== "number") {
    return {
      ok: false,
      data: EMBEDDED_FALLBACK,
      error: "schemaVersion missing",
    };
  }
  if (typeof data.agentVersion !== "string") {
    return {
      ok: false,
      data: EMBEDDED_FALLBACK,
      error: "agentVersion missing",
    };
  }
  if (typeof data.generatedAt !== "string") {
    return {
      ok: false,
      data: EMBEDDED_FALLBACK,
      error: "generatedAt missing",
    };
  }
  if (!Array.isArray(data.boards)) {
    return {
      ok: false,
      data: EMBEDDED_FALLBACK,
      error: "boards must be an array",
    };
  }
  for (let i = 0; i < data.boards.length; i++) {
    const result = validateBoard(data.boards[i], i);
    if (!result.ok) {
      return { ok: false, data: EMBEDDED_FALLBACK, error: result.error };
    }
  }
  return { ok: true, data: data as unknown as AdosAgentManifestData };
}

function serveEmbedded(): AdosAgentManifestData & { source: "fallback" } {
  if (cache && cache.source === "fallback" && Date.now() - cache.timestamp < CACHE_TTL) {
    return { ...cache.data, source: "fallback" };
  }
  cache = {
    timestamp: Date.now(),
    data: EMBEDDED_FALLBACK,
    source: "fallback",
  };
  return { ...EMBEDDED_FALLBACK, source: "fallback" };
}

// ── Embedded fallback ────────────────────────────────────────
//
// Used when no GitHub release manifest is reachable. Curl one-liners point
// at the canonical install scripts uploaded to the latest GitHub Release
// (releases/latest/download/...) so install bodies match what was tested
// at release time, not whatever happens to be on main when the operator
// runs the command. Keep the board ids in sync with the agent's emitter
// (scripts/emit_ados_agent_manifest.py). A vitest parity test fails the
// build if the fallback declares a board the upstream catalog doesn't.

const LITE_INSTALL_CMD =
  "curl -sSL https://github.com/altnautica/ADOSDroneAgent/releases/latest/download/install-lite.sh | sudo bash";
const FULL_INSTALL_CMD =
  "curl -sSL https://github.com/altnautica/ADOSDroneAgent/releases/latest/download/install.sh | sudo bash";
const FULL_INSTALL_GROUND_CMD =
  "curl -sSL https://github.com/altnautica/ADOSDroneAgent/releases/latest/download/install.sh | sudo bash -s -- --profile ground-station";

export const EMBEDDED_FALLBACK: AdosAgentManifestData = {
  schemaVersion: 1,
  agentVersion: "lite-v0.1.3",
  generatedAt: "2026-05-06T00:00:00Z",
  boards: [
    {
      id: "luckfox-pico-zero",
      label: "Luckfox Pico Zero",
      soc: "RV1106G3",
      arch: "armv7-musl",
      stacks: ["ados-drone-agent"],
      description: "256 MB DDR3L, 8 GB eMMC, onboard Wi-Fi 6.",
      bootrom: { vendorId: 0x2207, productId: 0x110c },
      installs: {
        "ados-drone-agent": {
          method: "web-flash",
          imageUrl: "",
          sha256: "",
          minisignSignature: "",
          imageSizeBytes: 0,
          notes: [
            "Hold the BOOT button while plugging USB-C into your computer to enter bootrom mode.",
            "Image flash erases the eMMC. Back up any user data first.",
          ],
        },
      },
    },
    {
      id: "pi-zero-2w",
      label: "Raspberry Pi Zero 2 W",
      soc: "BCM2710A1",
      arch: "aarch64-glibc",
      stacks: ["ados-drone-agent"],
      description: "512 MB LPDDR2, microSD boot, mainline Wi-Fi.",
      installs: {
        "ados-drone-agent": {
          method: "curl",
          command: LITE_INSTALL_CMD,
          notes: [
            "Run on a Pi already booted into Raspberry Pi OS Lite.",
            "Connect to your Wi-Fi network before running the command.",
          ],
        },
      },
    },
    {
      id: "rpi4b",
      label: "Raspberry Pi 4B",
      soc: "BCM2711",
      arch: "aarch64-glibc",
      stacks: ["ados-drone-agent", "ados-ground-agent"],
      description: "1-8 GB RAM, microSD boot.",
      installs: {
        "ados-drone-agent": {
          method: "curl",
          command: FULL_INSTALL_CMD,
          notes: ["Run on a Pi already booted into Raspberry Pi OS."],
        },
        "ados-ground-agent": {
          method: "curl",
          command: FULL_INSTALL_GROUND_CMD,
          notes: [
            "Run on a Pi already booted into Raspberry Pi OS.",
            "Plug in your RTL8812EU adapter, OLED display, and buttons before running the installer if you want them auto-detected.",
          ],
        },
      },
    },
    {
      id: "rk3566",
      label: "Radxa CM3 (RK3566)",
      soc: "RK3566",
      arch: "aarch64-glibc",
      stacks: ["ados-drone-agent", "ados-ground-agent"],
      description: "2-8 GB RAM, eMMC + microSD options.",
      installs: {
        "ados-drone-agent": {
          method: "curl",
          command: FULL_INSTALL_CMD,
          notes: ["Run on a CM3 booted into Radxa OS."],
        },
        "ados-ground-agent": {
          method: "curl",
          command: FULL_INSTALL_GROUND_CMD,
          notes: ["Run on a CM3 booted into Radxa OS."],
        },
      },
    },
    {
      id: "rk3588s2",
      label: "Radxa CM4 (RK3588S2)",
      soc: "RK3588S2",
      arch: "aarch64-glibc",
      stacks: ["ados-drone-agent", "ados-ground-agent"],
      description: "4-32 GB RAM, eMMC + microSD options.",
      installs: {
        "ados-drone-agent": {
          method: "curl",
          command: FULL_INSTALL_CMD,
          notes: ["Run on a CM4 booted into Radxa OS."],
        },
        "ados-ground-agent": {
          method: "curl",
          command: FULL_INSTALL_GROUND_CMD,
          notes: ["Run on a CM4 booted into Radxa OS."],
        },
      },
    },
    {
      id: "rock-5c-lite",
      label: "Radxa Rock 5C Lite",
      soc: "RK3582",
      arch: "aarch64-glibc",
      stacks: ["ados-drone-agent", "ados-ground-agent"],
      description: "8-16 GB RAM, NPU + VPU intact for vision workloads.",
      installs: {
        "ados-drone-agent": {
          method: "curl",
          command: FULL_INSTALL_CMD,
          notes: ["Run on a Rock 5C Lite booted into Radxa OS."],
        },
        "ados-ground-agent": {
          method: "curl",
          command: FULL_INSTALL_GROUND_CMD,
          notes: ["Run on a Rock 5C Lite booted into Radxa OS."],
        },
      },
    },
    {
      id: "cubie-a7z",
      label: "Radxa Cubie A7Z",
      soc: "Allwinner A733",
      arch: "aarch64-glibc",
      stacks: ["ados-drone-agent", "ados-ground-agent"],
      description: "Pi-Zero-sized Cortex-A55 SBC, 1 GB RAM.",
      installs: {
        "ados-drone-agent": {
          method: "curl",
          command: FULL_INSTALL_CMD,
          notes: [
            "Run on a Cubie A7Z booted into the BSP image.",
            "Mainline A733 support is incomplete; stick with the BSP kernel.",
          ],
        },
        "ados-ground-agent": {
          method: "curl",
          command: FULL_INSTALL_GROUND_CMD,
          notes: [
            "Run on a Cubie A7Z booted into the BSP image.",
            "Plug in your RTL8812EU adapter, OLED display, and buttons before running so they auto-detect.",
          ],
        },
      },
    },
  ],
};

// Test-only hook: lets the parity test inspect cache state without
// triggering real fetches. Not part of the production API surface.
export function __resetCacheForTests(): void {
  cache = null;
}
