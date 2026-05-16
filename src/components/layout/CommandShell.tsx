"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Settings, AlertTriangle, LogOut, CloudOff, Zap, Minimize2, X, Star, BookOpen } from "lucide-react";
import { Tooltip } from "@/components/ui/tooltip";
import { CommandNav } from "./CommandNav";
import { DemoProvider } from "./DemoProvider";
import { CommandPalette } from "@/components/shared/command-palette";
import { FailsafeAlertBanner } from "@/components/flight/FailsafeAlertBanner";
import { PluginCrashBanner } from "@/components/plugins/PluginCrashBanner";
import { useFleetStore } from "@/stores/fleet-store";
import { useAuthStore } from "@/stores/auth-store";
import { useSettingsStore } from "@/stores/settings-store";
import { LocalStorageBanner } from "@/components/ui/local-storage-banner";
import { useUiStore } from "@/stores/ui-store";
import { SignInModal } from "@/components/auth/SignInModal";
import { useAuthActions } from "@convex-dev/auth/react";
import { ConnectDialog } from "@/components/connect/ConnectDialog";
import { WelcomeModal, DisclaimerGate } from "@/components/onboarding/WelcomeModal";
import { formatSyncTime } from "@/lib/sync";
import { useAutoReconnect } from "@/hooks/use-auto-reconnect";
import { useGcsLocation } from "@/hooks/use-gcs-location";
import { usePlatform } from "@/hooks/use-platform";
import { useDisconnectGuard } from "@/hooks/use-disconnect-guard";
import { DisconnectGuard } from "@/components/fc/shared/DisconnectGuard";
import { ArmedWriteConfirmDialog } from "@/components/indicators/ArmedWriteConfirmDialog";
import { useConvexAvailable } from "@/app/ConvexClientProvider";
import { cn } from "@/lib/utils";
import { ChangelogNotificationGate } from "@/components/changelog/ChangelogNotificationGate";
import { ChangelogBadge } from "@/components/changelog/ChangelogBadge";
import Link from "next/link";

// MAVLink bridge persists across all tabs — direct import (renders null, no hydration issue)
import { AgentMavlinkBridge } from "@/components/command/AgentMavlinkBridge";
import { MeshToastBridge } from "@/components/command/MeshToastBridge";
import { RoleBadge } from "@/components/command/RoleBadge";

/**
 * User menu with sign-out. Must only mount when ConvexAuthNextjsProvider exists
 * (i.e., when convexAvailable is true), because useAuthActions requires that context.
 */
function ConvexUserMenu() {
  const { signOut } = useAuthActions();
  const user = useAuthStore((s) => s.user);
  const lastSyncedAt = useAuthStore((s) => s.lastSyncedAt);
  const t = useTranslations("shell");
  const tAuth = useTranslations("auth");
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="relative">
      <Tooltip content={user?.email || t("account")} position="bottom">
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="w-6 h-6 rounded-full bg-accent-primary/20 text-accent-primary flex items-center justify-center text-[10px] font-semibold uppercase"
        >
          {user?.name?.charAt(0) || user?.email?.charAt(0) || "U"}
        </button>
      </Tooltip>
      {menuOpen && (
        <div className="absolute right-0 top-8 bg-bg-secondary border border-border-default shadow-lg z-50 w-48 py-1">
          <div className="px-3 py-2 border-b border-border-default">
            <p className="text-xs text-text-primary font-medium truncate">{user?.name || user?.email}</p>
            <p className="text-[10px] text-text-tertiary truncate">{user?.email}</p>
            {lastSyncedAt && (
              <p className="text-[10px] text-text-tertiary mt-1">
                {t("lastSynced", { time: formatSyncTime(lastSyncedAt) })}
              </p>
            )}
          </div>
          <button
            onClick={() => {
              setMenuOpen(false);
              if (signOut) void signOut();
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary hover:bg-bg-primary transition-colors"
          >
            <LogOut size={12} />
            {tAuth("signOut")}
          </button>
        </div>
      )}
    </div>
  );
}

export function CommandShell({ children }: { children: React.ReactNode }) {
  // HDMI kiosk / HUD route opts out of the full GCS chrome (navbar, sidebar,
  // auto-reconnect, global dialogs). Root providers (Convex, Locale, Toast)
  // still wrap via app/layout.tsx. See product/specs/08-hdmi-kiosk-mode.md.
  const pathname = usePathname();
  const isHudRoute = pathname?.startsWith("/hud") ?? false;
  if (isHudRoute) {
    return <>{children}</>;
  }
  return <CommandShellInner>{children}</CommandShellInner>;
}

function CommandShellInner({ children }: { children: React.ReactNode }) {
  useAutoReconnect();
  useGcsLocation();
  const t = useTranslations("shell");
  const { isElectron, isMac, isWindows, isLinux } = usePlatform();
  const {
    guardOpen,
    commitAndDisconnect,
    discardAndDisconnect,
    cancelDisconnect,
    requestDisconnect,
  } = useDisconnectGuard();

  // Listen for disconnect requests from other components (e.g. ActiveConnections)
  useEffect(() => {
    const handler = (e: Event) => {
      const droneId = (e as CustomEvent<string>).detail;
      if (droneId) requestDisconnect(droneId);
    };
    window.addEventListener("request-disconnect", handler);
    return () => window.removeEventListener("request-disconnect", handler);
  }, [requestDisconnect]);
  const demo = useSettingsStore((s) => s.demoMode);
  const setDemoMode = useSettingsStore((s) => s.setDemoMode);
  const alertCount = useFleetStore((s) => s.alerts.filter((a) => !a.acknowledged).length);

  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const convexAvailable = useConvexAvailable();
  const immersiveMode = useUiStore((s) => s.immersiveMode);
  const exitImmersiveMode = useUiStore((s) => s.exitImmersiveMode);
  const [signInOpen, setSignInOpen] = useState(false);

  // Listen for sign-in requests from AuthGate and other components
  useEffect(() => {
    const handler = () => setSignInOpen(true);
    window.addEventListener("open-signin", handler);
    return () => window.removeEventListener("open-signin", handler);
  }, []);

  // Escape key exits immersive mode
  useEffect(() => {
    if (!immersiveMode) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") exitImmersiveMode();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [immersiveMode, exitImmersiveMode]);

  return (
    <div className="flex flex-col h-dvh">
      {/* Welcome onboarding modal */}
      <WelcomeModal />

      {/* Disclaimer gate for existing users who haven't accepted yet */}
      <DisclaimerGate />

      {/* Changelog "What's New" notification modal */}
      <ChangelogNotificationGate />

      {/* Armed-state parameter write confirmation dialog */}
      <ArmedWriteConfirmDialog />

      {/* Immersive mode exit button */}
      {immersiveMode && (
        <button
          onClick={exitImmersiveMode}
          className="fixed top-3 right-3 z-50 p-1.5 bg-bg-secondary/80 border border-border-default text-text-tertiary hover:text-text-primary transition-colors backdrop-blur-sm"
          title={t("exitImmersive")}
        >
          <Minimize2 size={14} />
        </button>
      )}

      {/* Top bar */}
      {!immersiveMode && <header className={cn(
        "h-12 flex items-center justify-between px-4 bg-bg-secondary border border-border-default shrink-0 mx-2 mt-2 rounded-2xl shadow-lg",
        isElectron && isMac && "pl-[76px]",
        isElectron && isWindows && "pr-[140px]",
        isElectron && !isLinux && "[-webkit-app-region:drag]"
      )}>
        {/* Left — Wordmark */}
        <div className={cn("flex items-center gap-2", isElectron && !isLinux && "[-webkit-app-region:no-drag]")}>
          <img src="/logo swarnakasa.png" alt="Logo" className="h-6 w-auto" />
          <div className="flex items-baseline gap-1.5">
            <span className="font-display uppercase tracking-[0.25em] text-sm font-semibold text-accent-primary">
              SWARNAKASA
            </span>
            <span className="text-[10px] uppercase tracking-widest text-text-tertiary font-medium">
              UAV MONITORING
            </span>
          </div>
          {demo && (
            <Tooltip content={t("exitDemo")} position="bottom">
              <button
                onClick={() => setDemoMode(false)}
                className="flex items-center gap-2 px-3 py-1 bg-yellow-400/10 border border-yellow-400/30 text-yellow-400 rounded-full text-[10px] font-bold tracking-wider uppercase transition-all hover:bg-yellow-400/20 hover:border-yellow-400/50 shadow-[0_0_15px_rgba(250,204,21,0.1)]"
              >
                <div className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
                {t("demo")}
                <X size={10} className="ml-0.5 opacity-60 group-hover:opacity-100" />
              </button>
            </Tooltip>
          )}
        </div>

        {/* Center — Navigation */}
        <div className={cn(isElectron && !isLinux && "[-webkit-app-region:no-drag]")}>
          <CommandNav />
        </div>

        {/* Right — Status indicators */}
        <div className={cn("flex items-center gap-3", isElectron && !isLinux && "[-webkit-app-region:no-drag]")}>
          {/* Ground-station role badge */}
          <RoleBadge />

          {/* Alert count */}
          {alertCount > 0 && (
            <Tooltip content={t("unacknowledgedAlerts")} position="bottom">
              <div className="flex items-center gap-1 text-yellow-400">
                <AlertTriangle size={12} />
                <span className="text-xs font-mono tabular-nums">{alertCount}</span>
              </div>
            </Tooltip>
          )}

          {/* Cmd+K hint */}
          <Tooltip content={t("commandPalette")} position="bottom">
            <kbd className="text-[10px] text-text-tertiary border border-border-default px-1 py-0.5 font-mono hidden sm:inline">
              ⌘K
            </kbd>
          </Tooltip>

          {/* Flash Tool */}
          <Tooltip content={t("flashTool")} position="bottom">
            <Link
              href="/config/firmware"
              className="text-text-secondary hover:text-text-primary transition-colors"
              aria-label={t("flashTool")}
            >
              <Zap size={16} />
            </Link>
          </Tooltip>

          {/* Settings */}
          <Tooltip content={t("settings")} position="bottom">
            <Link
              href="/config"
              className="text-text-secondary hover:text-text-primary transition-colors"
              aria-label={t("settings")}
            >
              <Settings size={16} />
            </Link>
          </Tooltip>

          {/* Auth — sign in or user menu (far right) */}
          {isAuthenticated && convexAvailable ? (
            <ConvexUserMenu />
          ) : (
            <Tooltip content={t("signInForSync")} position="bottom">
              <button
                onClick={() => setSignInOpen(true)}
                className="flex items-center gap-1 text-[10px] text-text-tertiary hover:text-text-secondary transition-colors"
              >
                <CloudOff size={10} />
                <span className="hidden sm:inline">{t("localOnly")}</span>
              </button>
            </Tooltip>
          )}
        </div>
      </header>}

      {/* Local storage warning banner */}
      {!immersiveMode && <LocalStorageBanner onSignIn={() => setSignInOpen(true)} />}

      {/* Sign-in modal */}
      <SignInModal open={signInOpen} onClose={() => setSignInOpen(false)} />

      {/* Connect dialog */}
      <ConnectDialog />

      {/* Disconnect guard — warns about uncommitted param writes */}
      <DisconnectGuard
        open={guardOpen}
        onCommitAndDisconnect={commitAndDisconnect}
        onDiscardAndDisconnect={discardAndDisconnect}
        onCancel={cancelDisconnect}
      />

      {/* Body */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <DemoProvider />
        <CommandPalette />
        <FailsafeAlertBanner />
        {!immersiveMode && <PluginCrashBanner />}
        {children}
        <AgentMavlinkBridge />
        <MeshToastBridge />
      </main>
    </div>
  );
}
