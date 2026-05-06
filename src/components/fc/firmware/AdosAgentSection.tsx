"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  HardDrive, RefreshCw, Copy, Check, Terminal, Usb, Info, Zap, X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import type {
  AdosAgentBoard,
  AdosAgentStack,
  AdosAgentWebFlashInstall,
} from "@/lib/protocol/firmware/ados-agent-manifest";
import type { FlashProgress } from "@/lib/protocol/firmware/types";
import {
  RockchipBootromFlasher,
  ROCKCHIP_USB_VID,
} from "@/lib/protocol/firmware/rockchip-bootrom";
import { verifyLiteAgentImageSignature } from "@/lib/protocol/firmware/minisign-public-key";
import { usbDeviceManager, type UsbDeviceInfo } from "@/lib/usb-device-manager";
import { FirmwareFlashProgress } from "./FirmwareFlashProgress";

interface Props {
  stack: AdosAgentStack;
  boards: AdosAgentBoard[];
  loading: boolean;
  error: string;
  agentVersion: string;
  selectedBoardId: string;
  setSelectedBoardId: (id: string) => void;
  onRetry: () => void;
  /**
   * Pre-flight checklist signal from the parent panel. Optional so
   * existing call sites (and tests) that rendered the section without
   * a checklist gate keep compiling; the live Flash Tool always passes
   * the real value.
   */
  allChecked?: boolean;
  /** WebUSB availability gate (already computed in parent). */
  usbSupported?: boolean;
  /**
   * Manifest origin marker. "github" means the upstream catalog
   * resolved cleanly; "fallback" means the proxy served the embedded
   * baseline. Drives the offline-catalog pill near the picker.
   */
  manifestSource?: string;
}

export function AdosAgentSection({
  stack, boards, loading, error, agentVersion,
  selectedBoardId, setSelectedBoardId, onRetry,
  allChecked = false, usbSupported = false,
  manifestSource,
}: Props) {
  const t = useTranslations("flashTool.ados");
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  // Rockchip bootrom devices currently visible to the browser. Updated
  // on mount via getKnownDevices() and live via hot-plug listeners.
  const [rockchipDevices, setRockchipDevices] = useState<UsbDeviceInfo[]>([]);

  // Flash lifecycle state. Local to this section so the FC flash flow
  // (FlashManager + ParsedFirmware) stays untouched.
  const [progress, setProgress] = useState<FlashProgress | null>(null);
  const [isFlashing, setIsFlashing] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  // Confirmation gate. Clicking the Flash button surfaces a Cancel /
  // Confirm pill and (when more than one Rockchip device is visible) a
  // device picker. Confirm runs the existing flash flow; Cancel reverts
  // to the idle state without touching USB.
  const [confirming, setConfirming] = useState(false);
  const [confirmDeviceLabel, setConfirmDeviceLabel] = useState<string>("");

  const flasherRef = useRef<RockchipBootromFlasher | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const eligibleBoards = useMemo(
    () => boards.filter((b) => b.stacks.includes(stack)),
    [boards, stack],
  );

  const selectedBoard = useMemo(
    () => eligibleBoards.find((b) => b.id === selectedBoardId) ?? null,
    [eligibleBoards, selectedBoardId],
  );

  const install = selectedBoard?.installs[stack] ?? null;
  const webFlashInstall =
    install && install.method === "web-flash"
      ? (install as AdosAgentWebFlashInstall)
      : null;

  // Reset the copy-feedback state when the board changes so the green
  // copy-confirmation pip from a prior board doesn't bleed onto a new command.
  useEffect(() => {
    setCopied(false);
  }, [selectedBoardId, stack]);

  // Subscribe to USB hot-plug for Rockchip devices. Mirrors the DFU
  // hook in useFirmwareState but scoped to the Rockchip vendor id. The
  // global manager is initialised by the parent FC flow on mount, so
  // we just attach connect/disconnect handlers here and filter for
  // Rockchip devices on each event.
  useEffect(() => {
    if (!usbSupported) return;
    let cancelled = false;
    usbDeviceManager.init();
    RockchipBootromFlasher.getKnownDevices()
      .then((devs) => {
        if (!cancelled) setRockchipDevices(devs);
      })
      .catch(() => {});
    const unsubConnect = usbDeviceManager.onConnect((info) => {
      if (info.isRockchip) {
        setRockchipDevices((prev) => [
          ...prev.filter((d) => d.label !== info.label),
          info,
        ]);
      }
    });
    const unsubDisconnect = usbDeviceManager.onDisconnect((info) => {
      if (info.isRockchip) {
        setRockchipDevices((prev) => prev.filter((d) => d.label !== info.label));
      }
    });
    return () => {
      cancelled = true;
      unsubConnect();
      unsubDisconnect();
    };
  }, [usbSupported]);

  // Tear down any in-flight flash when the section unmounts (e.g. user
  // switches stacks mid-flash).
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      flasherRef.current?.dispose().catch(() => {});
    };
  }, []);

  // Drop the confirmation pill if the operator yanks USB or the device
  // list otherwise empties out — there's nothing left to flash to.
  useEffect(() => {
    if (confirming && rockchipDevices.length === 0) {
      setConfirming(false);
      setConfirmDeviceLabel("");
    }
  }, [confirming, rockchipDevices]);

  // Warn the user before they navigate away (or close the tab) while a
  // flash is in flight. Aborting an eMMC write mid-stream leaves the
  // board with a half-written boot partition; the next power-on will
  // hit u-boot in maskrom recovery rather than booting cleanly.
  useEffect(() => {
    if (!isFlashing) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Some browsers honor returnValue, others ignore it but still
      // surface the prompt as long as preventDefault fired.
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isFlashing]);

  const stackLabel = stack === "ados-drone-agent" ? t("stack.drone") : t("stack.ground");

  const copyCommand = useCallback(async (cmd: string) => {
    try {
      await navigator.clipboard.writeText(cmd);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard write can fail in non-secure contexts. The textarea
      // below stays selectable as a manual fallback.
    }
  }, []);

  const handleScanForBoard = useCallback(async () => {
    try {
      const device = await RockchipBootromFlasher.requestDevice();
      const info = usbDeviceManager.buildDeviceInfo(device);
      setRockchipDevices((prev) => [
        ...prev.filter((d) => d.label !== info.label),
        info,
      ]);
      setStatusMessage(t("status.boardDetected", { label: info.label }));
    } catch (err) {
      if (err instanceof DOMException && err.name === "NotFoundError") {
        setStatusMessage(t("error.noBoardSelected"));
      } else {
        const msg = err instanceof Error ? err.message : t("error.unknown");
        if (!msg.includes("cancelled") && !msg.includes("aborted")) {
          setStatusMessage(t("status.detectionFailed", { message: msg }));
        }
      }
    }
  }, [t]);

  const handleAbort = useCallback(() => {
    abortRef.current?.abort();
    flasherRef.current?.abort();
  }, []);

  // Step 1 of the flash flow: surface the confirmation pill. The actual
  // USB work happens in runFlash, which only runs after explicit user
  // confirm. This guards against accidental clicks (a misdirected click
  // would otherwise erase the eMMC of whichever Rockchip board happens
  // to be plugged in).
  const handleFlash = useCallback(() => {
    if (!webFlashInstall || !webFlashInstall.imageUrl) {
      toast(t("toast.noImageUrl"), "error");
      return;
    }
    if (rockchipDevices.length === 0) {
      toast(t("toast.connectBoardFirst"), "warning");
      return;
    }
    // Default-select the first visible device. The confirmation pill
    // exposes a picker when more than one device is visible, so the
    // operator can swap before confirming.
    setConfirmDeviceLabel(rockchipDevices[0].label);
    setConfirming(true);
  }, [webFlashInstall, rockchipDevices, toast, t]);

  const handleCancelConfirm = useCallback(() => {
    setConfirming(false);
    setConfirmDeviceLabel("");
  }, []);

  // Step 2 of the flash flow: actual download → verify → claim → write.
  // Runs only after the operator clicks Confirm (or implicitly when the
  // pill has nothing to disambiguate).
  const runFlash = useCallback(async () => {
    if (!webFlashInstall || !webFlashInstall.imageUrl) {
      toast(t("toast.noImageUrl"), "error");
      return;
    }
    if (rockchipDevices.length === 0) {
      toast(t("toast.connectBoardFirst"), "warning");
      return;
    }

    // Resolve the chosen device up front so a hot-unplug between the
    // pill and the click can't pivot us onto the wrong board.
    const chosen =
      rockchipDevices.find((d) => d.label === confirmDeviceLabel) ??
      rockchipDevices[0];

    setConfirming(false);
    setIsFlashing(true);
    setStatusMessage("");
    setProgress({ phase: "idle", percent: 0, message: t("status.preparing") });

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      // 1. Download the image with progress.
      setProgress({
        phase: "bootloader_init",
        percent: 0,
        message: t("status.downloading"),
      });
      const res = await fetch(webFlashInstall.imageUrl, {
        signal: abort.signal,
      });
      if (!res.ok) {
        throw new Error(t("error.imageDownloadFailed", { status: res.status }));
      }
      const total =
        webFlashInstall.imageSizeBytes > 0
          ? webFlashInstall.imageSizeBytes
          : Number(res.headers.get("Content-Length") ?? "0");
      const reader = res.body?.getReader();
      if (!reader) throw new Error(t("error.noReadableBody"));
      const chunks: Uint8Array[] = [];
      let received = 0;
      // Stream the download so the progress bar stays useful for a
      // 50 MB image on a slow link.
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.byteLength;
        if (total > 0) {
          const pct = Math.min(4, Math.floor((received / total) * 5));
          setProgress({
            phase: "bootloader_init",
            percent: pct,
            message: t("status.downloadingProgress", {
              received: (received / (1024 * 1024)).toFixed(1),
              total: (total / (1024 * 1024)).toFixed(1),
            }),
            bytesWritten: received,
            bytesTotal: total,
          });
        }
      }
      const compressed = concatBytes(chunks);

      // 2. SHA-256 verification before we touch the device.
      setProgress({
        phase: "verifying",
        percent: 4,
        message: t("status.verifyingChecksum"),
      });
      if (webFlashInstall.sha256) {
        const actual = await sha256Hex(compressed);
        if (actual.toLowerCase() !== webFlashInstall.sha256.toLowerCase()) {
          throw new Error(
            t("error.checksumMismatch", {
              expected: webFlashInstall.sha256,
              actual,
            }),
          );
        }
      }

      // 2b. Ed25519 minisign signature against the vendored lite-agent
      //     public key. SHA-256 alone is not enough — the manifest, the
      //     image, and the SHA all come from the same GitHub Releases
      //     surface, so a compromised release endpoint could feed a
      //     consistent bogus triple. The signature ties the image bytes
      //     to a key we ship inside this client.
      if (webFlashInstall.minisignSignature) {
        setProgress({
          phase: "verifying",
          percent: 5,
          message: t("status.verifyingSignature"),
        });
        await verifyLiteAgentImageSignature(
          compressed,
          webFlashInstall.minisignSignature,
        );
      } else {
        throw new Error(t("error.missingSignature"));
      }

      // 3. Use the device the operator confirmed. Already-authorized,
      //    no picker reopen.
      const device: USBDevice = chosen.device;

      const flasher = new RockchipBootromFlasher(device);
      flasherRef.current = flasher;

      // 4. Prepare. Without a SoC-specific loader blob in the manifest
      //    today, prepare() will assume the device is already in
      //    loader stage. That is the right behavior for boards that
      //    ship a stock loader on eMMC; it surfaces a clear error if
      //    the device is still in pure maskrom mode and needs a blob
      //    we don't yet have.
      setProgress({
        phase: "bootloader_init",
        percent: 5,
        message: t("status.connecting"),
      });
      await flasher.prepare({ signal: abort.signal });

      // 5. Stream the image into eMMC.
      await flasher.flash(compressed, (p) => setProgress(p), abort.signal);

      toast(t("toast.flashComplete"), "success");
    } catch (err) {
      let userMessage = err instanceof Error ? err.message : t("error.unknown");
      if (err instanceof DOMException) {
        if (err.name === "NotFoundError") {
          userMessage = t("error.noBoardSelected");
        } else if (err.name === "SecurityError") {
          userMessage = t("error.webusbBlocked");
        } else if (err.name === "NetworkError") {
          userMessage = t("error.usbDisconnected");
        } else if (err.name === "AbortError") {
          userMessage = t("error.flashAborted");
        }
      }
      if (!userMessage.toLowerCase().includes("aborted")) {
        toast(t("toast.flashFailed"), "error");
        setProgress({ phase: "error", percent: 0, message: userMessage });
      } else {
        setProgress({ phase: "idle", percent: 0, message: userMessage });
      }
    } finally {
      setIsFlashing(false);
      const f = flasherRef.current;
      flasherRef.current = null;
      abortRef.current = null;
      if (f) {
        f.dispose().catch(() => {});
      }
    }
  }, [webFlashInstall, rockchipDevices, confirmDeviceLabel, toast, t]);

  const flashDisabled =
    isFlashing ||
    !allChecked ||
    !usbSupported ||
    !webFlashInstall ||
    !webFlashInstall.imageUrl ||
    rockchipDevices.length === 0;

  return (
    <>
      <div className="bg-bg-secondary border border-border-default p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold text-text-primary flex items-center gap-2">
            <HardDrive size={14} />
            {t("targetBoard.title")}
            {manifestSource === "fallback" && (
              <span
                className="text-[10px] px-1.5 py-0.5 bg-status-warning/10 text-status-warning border border-status-warning/40"
                aria-label={t("targetBoard.offlineCatalogTooltip")}
                title={t("targetBoard.offlineCatalogTooltip")}
              >
                {t("targetBoard.offlineCatalog")}
              </span>
            )}
          </h2>
          <div className="flex items-center gap-3">
            {agentVersion && (
              <span className="text-[10px] text-text-tertiary">{t("targetBoard.version", { version: agentVersion })}</span>
            )}
            {loading && (
              <span className="text-[10px] text-text-tertiary flex items-center gap-1">
                <RefreshCw size={10} className="animate-spin" /> {t("targetBoard.loadingManifest")}
              </span>
            )}
          </div>
        </div>

        {error && (
          <div className="text-[10px] text-status-danger flex items-center justify-between">
            <span>{error}</span>
            <button onClick={onRetry} className="underline cursor-pointer">{t("common.retry")}</button>
          </div>
        )}

        <Select
          value={selectedBoardId}
          onChange={setSelectedBoardId}
          disabled={loading || eligibleBoards.length === 0}
          placeholder={loading ? t("targetBoard.loadingBoards") : t("targetBoard.noBoards", { stack: stackLabel })}
          searchable
          options={eligibleBoards.map((b) => ({
            value: b.id,
            label: b.label,
            description: b.soc,
          }))}
        />

        {selectedBoard && (
          <div className="text-[10px] text-text-tertiary space-y-0.5">
            <p><span className="text-text-secondary">{t("targetBoard.soc")}</span> {selectedBoard.soc} · <span className="text-text-secondary">{t("targetBoard.arch")}</span> {selectedBoard.arch}</p>
            {selectedBoard.description && <p>{selectedBoard.description}</p>}
          </div>
        )}
      </div>

      {install && install.method === "curl" && (
        <div className="bg-bg-secondary border border-border-default p-4 space-y-3">
          <h2 className="text-xs font-semibold text-text-primary flex items-center gap-2">
            <Terminal size={14} />
            {t("curl.title")}
          </h2>

          {install.notes && install.notes.length > 0 && (
            <ul className="space-y-1 text-[10px] text-text-tertiary list-disc list-inside">
              {install.notes.map((note, i) => <li key={i}>{note}</li>)}
            </ul>
          )}

          <div className="relative">
            <pre className="bg-bg-tertiary border border-border-default p-3 pr-12 text-[11px] text-text-secondary font-mono overflow-x-auto whitespace-pre break-words">
              {install.command}
            </pre>
            <button
              onClick={() => copyCommand(install.command)}
              aria-pressed={copied}
              aria-label={copied ? t("a11y.copyButtonCopied") : t("a11y.copyButtonCopy")}
              className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 text-[10px] font-semibold border border-border-default text-text-secondary hover:text-text-primary hover:bg-bg-secondary cursor-pointer transition-colors">
              {copied ? <Check size={10} /> : <Copy size={10} />}
              {copied ? t("common.copied") : t("common.copy")}
            </button>
            <span className="sr-only" aria-live="polite">
              {copied ? t("a11y.copyAnnounce") : ""}
            </span>
          </div>

          <div className="flex items-start gap-2 text-[10px] text-text-tertiary">
            <Info size={11} className="mt-0.5 flex-shrink-0" />
            <p>
              {t("curl.setupHintBefore")}<code className="text-text-secondary">http://&lt;board-ip&gt;:8080</code>{t("curl.setupHintAfter")}
            </p>
          </div>
        </div>
      )}

      {webFlashInstall && (
        <div className="bg-bg-secondary border border-border-default p-4 space-y-3">
          <h2 className="text-xs font-semibold text-text-primary flex items-center gap-2">
            <Usb size={14} />
            {t("webFlash.title")}
          </h2>

          {webFlashInstall.notes && webFlashInstall.notes.length > 0 && (
            <ul className="space-y-1 text-[10px] text-text-tertiary list-disc list-inside">
              {webFlashInstall.notes.map((note, i) => <li key={i}>{note}</li>)}
            </ul>
          )}

          {webFlashInstall.imageUrl ? (
            <div className="text-[10px] text-text-tertiary space-y-1">
              <p><span className="text-text-secondary">{t("webFlash.imageSizeLabel")}</span> {(webFlashInstall.imageSizeBytes / (1024 * 1024)).toFixed(1)} MB</p>
              <p className="font-mono break-all"><span className="text-text-secondary not-italic">{t("webFlash.sha256")}</span> {webFlashInstall.sha256}</p>
            </div>
          ) : (
            <p className="text-[10px] text-status-warning">
              {t("webFlash.noImage")}
            </p>
          )}

          {/* Connection panel */}
          <RockchipConnectionPanel
            devices={rockchipDevices}
            usbSupported={usbSupported}
            isFlashing={isFlashing}
            onScan={handleScanForBoard}
          />

          {statusMessage && !progress && (
            <p className="text-[10px] text-text-tertiary font-mono">{statusMessage}</p>
          )}

          {progress && (
            <div role="status" aria-live="polite" aria-atomic="true">
              <span className="sr-only">
                {t("a11y.flashStatus", {
                  phase: progress.phase,
                  percent: Math.floor(progress.percent),
                })}
              </span>
              <FirmwareFlashProgress
                progress={progress}
                isFlashing={isFlashing}
                onAbort={handleAbort}
              />
            </div>
          )}

          {confirming && !isFlashing ? (
            <div className="border border-status-warning/40 bg-status-warning/5 p-3 space-y-2">
              <p className="text-[11px] text-status-warning font-semibold">
                {t("confirm.title")}
              </p>
              <p className="text-[10px] text-text-secondary">
                {t("confirm.body", { board: confirmDeviceLabel })}
              </p>
              {rockchipDevices.length > 1 && (
                <Select
                  value={confirmDeviceLabel}
                  onChange={setConfirmDeviceLabel}
                  options={rockchipDevices.map((d) => ({
                    value: d.label,
                    label: d.label,
                  }))}
                />
              )}
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCancelConfirm}
                  className="flex-1 px-3 py-1.5 text-[11px] font-semibold border border-border-default text-text-secondary hover:text-text-primary hover:bg-bg-secondary cursor-pointer transition-colors"
                >
                  {t("confirm.cancel")}
                </button>
                <button
                  onClick={runFlash}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold border border-accent-primary bg-accent-primary/10 text-accent-primary hover:bg-accent-primary/20 cursor-pointer transition-colors"
                >
                  <Zap size={12} /> {t("confirm.confirm")}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={handleFlash}
              disabled={flashDisabled}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold border border-accent-primary bg-accent-primary/10 text-accent-primary hover:bg-accent-primary/20 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
            >
              {isFlashing ? (
                <>
                  <X size={12} /> {t("webFlash.flashing")}
                </>
              ) : (
                <>
                  <Zap size={12} /> {t("webFlash.title")}
                </>
              )}
            </button>
          )}

          {!allChecked && webFlashInstall.imageUrl && (
            <p className="text-[10px] text-text-tertiary">
              {t("webFlash.checklistHint")}
            </p>
          )}
        </div>
      )}
    </>
  );
}

// ── Connection panel ─────────────────────────────────────────

function RockchipConnectionPanel({
  devices, usbSupported, isFlashing, onScan,
}: {
  devices: UsbDeviceInfo[];
  usbSupported: boolean;
  isFlashing: boolean;
  onScan: () => void;
}) {
  const t = useTranslations("flashTool.ados");
  if (devices.length > 0) {
    return (
      <div
        className="border border-status-success/40 bg-status-success/5 p-3 space-y-1"
        aria-live="polite"
        aria-label={t("a11y.connectionStatusRegion")}
      >
        <p className="text-[11px] text-status-success font-semibold">{t("connection.boardConnected")}</p>
        <p className="text-[10px] text-text-secondary">
          {t("connection.readyToFlash", { devices: devices.map((d) => d.label).join(", ") })}
        </p>
      </div>
    );
  }
  return (
    <div
      className="border border-border-default bg-bg-tertiary p-3 space-y-2"
      aria-live="polite"
      aria-label={t("a11y.connectionStatusRegion")}
    >
      <p className="text-[11px] text-text-secondary font-semibold">{t("connection.noBoardConnected")}</p>
      <p className="text-[10px] text-text-tertiary">
        {t("connection.scanHint", { vendor: hex(ROCKCHIP_USB_VID) })}
      </p>
      {usbSupported && (
        <button
          onClick={onScan}
          disabled={isFlashing}
          className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold border border-border-default text-text-secondary hover:text-text-primary hover:bg-bg-secondary disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
        >
          <Usb size={12} /> {t("connection.scanForBoard")}
        </button>
      )}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────

function concatBytes(parts: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const p of parts) total += p.byteLength;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.byteLength;
  }
  return out;
}

async function sha256Hex(data: Uint8Array): Promise<string> {
  // Copy into a fresh ArrayBuffer; some browsers reject views backed
  // by SharedArrayBuffer (which can occur when chunks come off a fetch
  // stream) when fed directly to subtle.digest.
  const buf = new ArrayBuffer(data.byteLength);
  new Uint8Array(buf).set(data);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hex(n: number): string {
  return "0x" + n.toString(16).toUpperCase().padStart(4, "0");
}
