import { app, dialog, ipcMain } from "electron";
import { setupPermissions } from "./permissions";
import { startServer, stopServer } from "./server";
import { createMainWindow } from "./window";
import { setupAutoUpdater } from "./updater";

// Enable Chromium features required by Command GCS
app.commandLine.appendSwitch("enable-features", "WebSerial,WebUSB");

// Parse CLI flags
const isDemoMode = process.argv.includes("--demo");

// Windows installer events: exit early on Squirrel install/update/uninstall so
// the installer's silent process never lingers as a windowless background app.
if (process.platform === "win32") {
  const squirrelEvent = process.argv.find((a) =>
    ["--squirrel-install", "--squirrel-updated", "--squirrel-uninstall", "--squirrel-obsolete"].includes(a),
  );
  if (squirrelEvent) {
    app.quit();
    process.exit(0);
  }
}

// Prevent multiple instances. The second-instance handler below focuses the
// existing window when the user re-launches.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}

app.whenReady().then(async () => {
  try {
    // Setup device permissions (WebSerial, WebUSB)
    setupPermissions();

    // Start the embedded Next.js standalone server
    const port = await startServer({ demo: isDemoMode });

    // In packaged builds, passively log /_next/static requests for diagnostics
    // (no interception — Chromium talks directly to the localhost server)
    if (app.isPackaged) {
      const { session } = require("electron");
      const filter = { urls: ["http://127.0.0.1:*/_next/*"] };
      session.defaultSession.webRequest.onCompleted(filter, (details: any) => {
        console.log(`[req] ${details.statusCode} ${details.url.substring(0, 120)}`);
      });
      session.defaultSession.webRequest.onErrorOccurred(filter, (details: any) => {
        console.error(`[req] ERR ${details.error} ${details.url.substring(0, 120)}`);
      });
    }

    // Create the main browser window
    const win = createMainWindow(port);

    // IPC handlers for window controls
    ipcMain.handle("window:minimize", () => win.minimize());
    ipcMain.handle("window:maximize", () => {
      if (win.isMaximized()) {
        win.unmaximize();
      } else {
        win.maximize();
      }
    });
    ipcMain.handle("window:close", () => win.close());
    ipcMain.handle("app:version", () => app.getVersion());

    // Setup auto-updater (silent check on startup)
    setupAutoUpdater(win);

    // macOS: re-create window when dock icon clicked
    app.on("activate", () => {
      if (!win.isDestroyed()) {
        win.show();
      }
    });
  } catch (err: any) {
    // Without this, a failed startup leaves a hidden process with no window —
    // the user sees a dock icon / Task Manager entry but nothing to interact
    // with. Surface the failure and exit cleanly instead.
    console.error("[main] startup failed:", err);
    const message = err?.stack || err?.message || String(err);
    try {
      dialog.showErrorBox(
        "Altnautica Command failed to start",
        `The embedded server did not start.\n\n${message}\n\nPlease report this with the log file.`,
      );
    } catch {
      // dialog may be unavailable in some environments; fall through to quit
    }
    app.quit();
  }
}).catch((err) => {
  console.error("[main] whenReady handler failed:", err);
  app.quit();
});

app.on("second-instance", () => {
  // Focus existing window if user tries to open another instance
  const wins = require("electron").BrowserWindow.getAllWindows();
  if (wins.length > 0) {
    if (wins[0].isMinimized()) wins[0].restore();
    wins[0].focus();
  }
});

app.on("window-all-closed", async () => {
  await stopServer();
  app.quit();
});
