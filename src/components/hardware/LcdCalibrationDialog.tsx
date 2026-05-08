"use client";

/**
 * @module LcdCalibrationDialog
 * @description Modal that walks the operator through the agent's
 * 5-point touch calibration wizard remotely. Polls
 * `GET /api/v1/display/calibrate/status` at 1 Hz, draws the five
 * target positions on a stylized 480x320 panel, highlights the
 * active step, and surfaces the rms residual once the agent
 * reports `complete=true`. Skip pushes
 * `POST /api/v1/display/calibrate/skip`; Cancel just closes the
 * dialog (the agent's wizard keeps running until completion or
 * skip from the operator).
 *
 * @license GPL-3.0-only
 */

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { useAgentConnectionStore } from "@/stores/agent-connection-store";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

const TOTAL_STEPS = 5;
const POLL_INTERVAL_MS = 1000;

// Five target positions in normalized coordinates (0..1) on the
// stylized 480x320 panel: 4 corners + center.
const TARGETS: Array<{ x: number; y: number }> = [
  { x: 0.1, y: 0.15 },
  { x: 0.9, y: 0.15 },
  { x: 0.5, y: 0.5 },
  { x: 0.1, y: 0.85 },
  { x: 0.9, y: 0.85 },
];

interface CalibrationStatus {
  current_step: number;
  complete: boolean;
  rms_residual_px: number | null;
  skipped: boolean;
}

const INITIAL_STATUS: CalibrationStatus = {
  current_step: 1,
  complete: false,
  rms_residual_px: null,
  skipped: false,
};

interface LcdCalibrationDialogProps {
  open: boolean;
  onClose: () => void;
}

export function LcdCalibrationDialog({
  open,
  onClose,
}: LcdCalibrationDialogProps) {
  const client = useAgentConnectionStore((s) => s.client);
  const t = useTranslations("hardware.lcdCalibration");
  const { toast } = useToast();

  const [status, setStatus] = useState<CalibrationStatus>(INITIAL_STATUS);
  const [skipping, setSkipping] = useState(false);

  // Reset on open so a re-opened dialog doesn't show stale numbers.
  useEffect(() => {
    if (open) setStatus(INITIAL_STATUS);
  }, [open]);

  // Poll status while the dialog is open.
  useEffect(() => {
    if (!open || !client) return;

    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const tick = async () => {
      if (cancelled) return;
      if (typeof document !== "undefined" && document.hidden) return;
      try {
        const res = await client.getDisplayCalibrationStatus();
        if (cancelled) return;
        setStatus({
          current_step: typeof res.current_step === "number" ? res.current_step : 1,
          complete: Boolean(res.complete),
          rms_residual_px:
            typeof res.rms_residual_px === "number" ? res.rms_residual_px : null,
          skipped: Boolean(res.skipped),
        });
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : t("statusFailed");
        toast(msg, "error");
      }
    };

    void tick();
    timer = setInterval(() => {
      void tick();
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [open, client, t, toast]);

  const handleSkip = async () => {
    if (!client || skipping) return;
    setSkipping(true);
    try {
      await client.skipDisplayCalibration();
      toast(t("skipped"), "info");
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("skipFailed");
      toast(msg, "error");
    } finally {
      setSkipping(false);
    }
  };

  const stepDisplay = Math.max(1, Math.min(TOTAL_STEPS, status.current_step));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("title")}
      className="max-w-lg"
      footer={
        status.complete ? (
          <Button variant="primary" size="sm" onClick={onClose}>
            {t("close")}
          </Button>
        ) : (
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleSkip}
              disabled={!client || skipping}
            >
              {t("skip")}
            </Button>
            <Button variant="ghost" size="sm" onClick={onClose}>
              {t("cancel")}
            </Button>
          </>
        )
      }
    >
      <div className="flex flex-col gap-3">
        <div
          className="relative mx-auto w-full overflow-hidden rounded border border-border-default bg-bg-tertiary"
          style={{ aspectRatio: "480 / 320", maxWidth: 480 }}
          aria-label="LCD calibration panel"
        >
          {TARGETS.map((tgt, idx) => {
            const stepNumber = idx + 1;
            const isActive = !status.complete && stepNumber === stepDisplay;
            const isDone = stepNumber < stepDisplay || status.complete;
            return (
              <div
                key={idx}
                data-step={stepNumber}
                data-state={
                  isActive ? "active" : isDone ? "done" : "pending"
                }
                className={cn(
                  "absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2",
                  isActive
                    ? "h-6 w-6 border-accent-primary bg-accent-primary/30 ring-2 ring-accent-primary"
                    : isDone
                      ? "h-5 w-5 border-status-success bg-status-success/40"
                      : "h-5 w-5 border-text-tertiary/60 bg-bg-secondary",
                )}
                style={{
                  left: `${tgt.x * 100}%`,
                  top: `${tgt.y * 100}%`,
                }}
              />
            );
          })}
        </div>

        {status.complete ? (
          <div className="rounded border border-status-success/40 bg-status-success/10 p-3 text-sm text-status-success">
            <p className="font-semibold">{t("complete")}</p>
            <p className="mt-1 text-xs">
              {t("completeBody", {
                residual:
                  status.rms_residual_px !== null
                    ? status.rms_residual_px.toFixed(2)
                    : "-",
              })}
            </p>
          </div>
        ) : (
          <p className="text-center text-sm text-text-secondary">
            {t("instruction", {
              current: stepDisplay,
              total: TOTAL_STEPS,
            })}
          </p>
        )}
      </div>
    </Modal>
  );
}
