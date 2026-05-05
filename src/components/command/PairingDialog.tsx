"use client";

/**
 * @module PairingDialog
 * @description Modal dialog for pairing a new ADOS Drone Agent. Hosts the
 * dialog chrome and copy-to-clipboard helpers; lifecycle state machine lives
 * in `usePairingFlow`, per-stage UI lives in `./pairing/`.
 * @license GPL-3.0-only
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import { useMutation } from "convex/react";
import { cn } from "@/lib/utils";
import { useConvexAvailable } from "@/app/ConvexClientProvider";
import { cmdPairingApi } from "@/lib/community-api-drones";
import { useAuthStore } from "@/stores/auth-store";
import { usePairingStore } from "@/stores/pairing-store";
import { SignInModal } from "@/components/auth/SignInModal";
import { PairingPrompt } from "./pairing/PairingPrompt";
import { PairingConfirm } from "./pairing/PairingConfirm";
import { PairingResult } from "./pairing/PairingResult";
import {
  usePairingFlow,
  buildInstallCommand,
  type ClaimCodeMutation,
  type PreGenerateMutation,
} from "./pairing/use-pairing-flow";

interface PairingDialogProps {
  open: boolean;
  onClose: () => void;
  onPaired?: (deviceId: string, apiKey: string, url: string) => void;
  /** Deep-link supplied code. When set, the dialog claims this code
   *  instead of generating a new one. */
  initialCode?: string | null;
}

export function PairingDialog(props: PairingDialogProps) {
  const convexAvailable = useConvexAvailable();
  if (convexAvailable) {
    return <PairingDialogWithConvex {...props} />;
  }
  return (
    <PairingDialogBase
      {...props}
      claimCode={null}
      preGenerate={null}
      requiresSignIn={false}
    />
  );
}

function PairingDialogWithConvex(props: PairingDialogProps) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isAuthLoading = useAuthStore((s) => s.isLoading);
  const claimCode = useMutation(cmdPairingApi.claimPairingCode);
  const preGenerate = useMutation(cmdPairingApi.preGenerateCode);

  return (
    <PairingDialogBase
      {...props}
      claimCode={isAuthenticated ? (claimCode as ClaimCodeMutation) : null}
      preGenerate={isAuthenticated ? (preGenerate as PreGenerateMutation) : null}
      requiresSignIn={!isAuthenticated && !isAuthLoading}
    />
  );
}

interface BaseProps extends PairingDialogProps {
  claimCode: ClaimCodeMutation;
  preGenerate: PreGenerateMutation;
  requiresSignIn: boolean;
}

function PairingDialogBase({
  open,
  onClose,
  onPaired,
  claimCode,
  preGenerate,
  requiresSignIn,
  initialCode,
}: BaseProps) {
  const t = useTranslations("command");
  const tCommon = useTranslations("common");
  const [signInOpen, setSignInOpen] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedInstall, setCopiedInstall] = useState(false);

  const onCodeReset = useCallback(() => {
    setCopiedCode(false);
    setCopiedInstall(false);
  }, []);

  const flow = usePairingFlow({
    open,
    requiresSignIn,
    claimCode,
    preGenerate,
    onPaired,
    onCodeReset,
    initialCode,
  });

  const discoveredAgents = usePairingStore((s) => s.discoveredAgents);

  // Close on ESC
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  const handleCopyCode = useCallback(() => {
    if (!flow.preGenCode) return;
    navigator.clipboard
      .writeText(flow.preGenCode)
      .then(() => {
        setCopiedCode(true);
        setTimeout(() => setCopiedCode(false), 2000);
      })
      .catch(() => {});
  }, [flow.preGenCode]);

  const handleCopyInstall = useCallback(() => {
    if (!flow.preGenCode) return;
    navigator.clipboard
      .writeText(buildInstallCommand(flow.preGenCode))
      .then(() => {
        setCopiedInstall(true);
        setTimeout(() => setCopiedInstall(false), 2000);
      })
      .catch(() => {});
  }, [flow.preGenCode]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-bg-secondary border border-border-default rounded-lg shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-default">
          <h2 className="text-sm font-semibold text-text-primary">
            {t("pairNewDrone")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-text-tertiary hover:text-text-primary transition-colors"
            title={tCommon("close")}
            aria-label={tCommon("close")}
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-5 space-y-5">
          {requiresSignIn && (
            <PairingPrompt variant="sign-in" onSignIn={() => setSignInOpen(true)} />
          )}

          {!requiresSignIn && flow.state === "setup" && (
            <PairingPrompt variant="setup" />
          )}

          {flow.state === "waiting" && flow.preGenCode && (
            <PairingConfirm
              code={flow.preGenCode}
              secondsLeft={flow.secondsLeft}
              copiedCode={copiedCode}
              copiedInstall={copiedInstall}
              installCommand={buildInstallCommand(flow.preGenCode)}
              discoveredAgents={discoveredAgents}
              onCopyCode={handleCopyCode}
              onCopyInstall={handleCopyInstall}
              onDiscoveredPair={flow.claimDiscovered}
            />
          )}

          {flow.state === "success" && flow.pairedInfo && (
            <PairingResult variant="success" info={flow.pairedInfo} />
          )}

          {flow.state === "error" && (
            <PairingResult
              variant="error"
              message={flow.errorMessage}
              onRetry={flow.generateCode}
            />
          )}

          {flow.state === "expired" && (
            <PairingResult variant="expired" onRetry={flow.generateCode} />
          )}
        </div>
      </div>
      <SignInModal open={signInOpen} onClose={() => setSignInOpen(false)} />
    </div>
  );
}

/**
 * Inline pairing code input for embedding in other pages. Same 6-char input
 * logic without the modal wrapper.
 */
export function PairingCodeInput({
  onSubmit,
  disabled,
}: {
  onSubmit: (code: string) => void;
  disabled?: boolean;
}) {
  const [code, setCode] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function handleChange(value: string) {
    const cleaned = value
      .replace(/[^A-Za-z0-9]/g, "")
      .toUpperCase()
      .slice(0, 6);
    setCode(cleaned);
    if (cleaned.length === 6) {
      onSubmit(cleaned);
    }
  }

  return (
    <input
      ref={inputRef}
      type="text"
      value={code}
      onChange={(e) => handleChange(e.target.value)}
      maxLength={6}
      disabled={disabled}
      placeholder="------"
      className={cn(
        "w-52 text-center text-xl font-mono font-bold tracking-[0.4em] bg-bg-primary border border-border-default rounded-lg px-3 py-2 text-text-primary placeholder:text-text-tertiary/40 outline-none focus:border-accent-primary transition-colors uppercase",
        disabled && "opacity-50 cursor-not-allowed"
      )}
      autoComplete="off"
      spellCheck={false}
    />
  );
}
