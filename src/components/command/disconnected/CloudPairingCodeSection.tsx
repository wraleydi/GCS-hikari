"use client";

/**
 * @module CloudPairingCodeSection
 * @description Cloud pair-code flow shown only after the operator
 * has opted into cloud / remote access. Generates a code via
 * Convex, displays it for the agent installer, and lets the
 * agent claim it via the cloud relay beacon.
 *
 * This is the *secondary* pair path. The primary path is the
 * local-first Add-a-Node card. Both can coexist.
 * @license GPL-3.0-only
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { useConvexAvailable } from "@/app/ConvexClientProvider";
import { cmdPairingApi } from "@/lib/community-api-drones";
import {
  PairingCodeCard,
  getInstallCommand,
} from "./PairingCodeCard";

const CODE_TTL_MS = 15 * 60 * 1000; // 15 minutes

export function CloudPairingCodeSection() {
  // Defensive: the parent (AgentDisconnectedPage) gates this mount on
  // `convexAvailable && isAuthenticated`, but a future refactor could
  // drop one of those checks. useMutation outside the Convex context
  // throws at render time, so we short-circuit here as a belt.
  const convexAvailable = useConvexAvailable();
  if (!convexAvailable) return null;
  return <CloudPairingCodeSectionInner />;
}

function CloudPairingCodeSectionInner() {
  const preGenerate = useMutation(cmdPairingApi.preGenerateCode);

  const [code, setCode] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedInstall, setCopiedInstall] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(CODE_TTL_MS / 1000);
  const [expired, setExpired] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);

  const expiryRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const codeGeneratedAt = useRef<number>(0);

  const generateCode = useCallback(async () => {
    setExpired(false);
    setCopiedCode(false);
    setCopiedInstall(false);
    setCodeError(null);

    let generated: string;
    try {
      const result = await preGenerate({});
      generated = result.code;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setCodeError(msg);
      setCode(null);
      return;
    }

    setCode(generated);
    codeGeneratedAt.current = Date.now();
    setSecondsLeft(CODE_TTL_MS / 1000);

    if (expiryRef.current) clearInterval(expiryRef.current);
    expiryRef.current = setInterval(() => {
      const elapsed = Date.now() - codeGeneratedAt.current;
      const remaining = Math.max(
        0,
        Math.ceil((CODE_TTL_MS - elapsed) / 1000),
      );
      setSecondsLeft(remaining);
      if (remaining <= 0) {
        setExpired(true);
        if (expiryRef.current) clearInterval(expiryRef.current);
      }
    }, 1000);
  }, [preGenerate]);

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) void generateCode();
    });
    return () => {
      cancelled = true;
      if (expiryRef.current) clearInterval(expiryRef.current);
    };
  }, [generateCode]);

  function handleCopyCode() {
    if (!code) return;
    navigator.clipboard
      .writeText(code)
      .then(() => {
        setCopiedCode(true);
        setTimeout(() => setCopiedCode(false), 2000);
      })
      .catch(() => {});
  }

  function handleCopyInstall() {
    if (!code) return;
    navigator.clipboard
      .writeText(getInstallCommand(code))
      .then(() => {
        setCopiedInstall(true);
        setTimeout(() => setCopiedInstall(false), 2000);
      })
      .catch(() => {});
  }

  return (
    <PairingCodeCard
      codeError={codeError}
      code={code}
      expired={expired}
      secondsLeft={secondsLeft}
      copiedCode={copiedCode}
      copiedInstall={copiedInstall}
      onRegenerate={generateCode}
      onCopyCode={handleCopyCode}
      onCopyInstall={handleCopyInstall}
    />
  );
}
