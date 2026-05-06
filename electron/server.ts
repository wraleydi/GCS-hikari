import { ChildProcess, fork } from "child_process";
import { createServer as createTcpServer } from "net";
import path from "path";
import fs from "fs";
import http from "http";
import { app } from "electron";

let serverProcess: ChildProcess | null = null;
let serverPort: number = 4000;

/** Find a free port, starting with the preferred one. */
async function findFreePort(preferred: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createTcpServer();
    srv.listen(preferred, "127.0.0.1", () => {
      srv.close(() => resolve(preferred));
    });
    srv.on("error", () => {
      // Preferred port taken — let OS assign one
      const srv2 = createTcpServer();
      srv2.listen(0, "127.0.0.1", () => {
        const addr = srv2.address();
        if (addr && typeof addr === "object") {
          srv2.close(() => resolve(addr.port));
        } else {
          reject(new Error("Could not find free port"));
        }
      });
      srv2.on("error", reject);
    });
  });
}

/** Resolve path to the standalone server.js. */
function getServerPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "standalone", "server.js");
  }
  return path.join(__dirname, "..", ".next", "standalone", "server.js");
}

/** Get the static files directory (for diagnostic logging only). */
function getStaticDir(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "standalone", ".next", "static");
  }
  return path.join(__dirname, "..", ".next", "static");
}

/** Wait for the server to respond to HTTP requests. */
async function waitForReady(
  port: number,
  timeoutMs: number = 15000
): Promise<void> {
  const start = Date.now();
  const interval = 200;

  return new Promise((resolve, reject) => {
    const check = () => {
      if (Date.now() - start > timeoutMs) {
        reject(new Error(`Server did not start within ${timeoutMs}ms`));
        return;
      }

      const req = http.get(`http://127.0.0.1:${port}`, (res) => {
        if (res.statusCode && res.statusCode < 500) {
          resolve();
        } else {
          setTimeout(check, interval);
        }
        res.resume();
      });

      req.on("error", () => {
        setTimeout(check, interval);
      });

      req.setTimeout(1000, () => {
        req.destroy();
        setTimeout(check, interval);
      });
    };

    check();
  });
}

interface StartOptions {
  demo?: boolean;
}

/**
 * Start the Next.js standalone server. Returns the port.
 *
 * The standalone server serves static files natively when .next/static/
 * is present in the standalone directory. No proxy needed.
 */
export async function startServer(options: StartOptions = {}): Promise<number> {
  const port = await findFreePort(4000);

  const serverPath = getServerPath();
  const staticDir = getStaticDir();

  const env: Record<string, string> = {
    ...((process.env as Record<string, string>) || {}),
    PORT: String(port),
    HOSTNAME: "127.0.0.1",
    NODE_ENV: "production",
  };

  if (options.demo) {
    env.NEXT_PUBLIC_DEMO_MODE = "true";
  }

  // Diagnostic: verify static directory exists in packaged builds
  if (app.isPackaged) {
    try {
      const entries = fs.readdirSync(staticDir);
      console.log(`[electron] Static dir OK: ${entries.join(", ")}`);
    } catch (err: any) {
      console.error(`[electron] Static dir MISSING: ${staticDir}`, err.message);
    }
  }

  serverProcess = fork(serverPath, [], {
    env,
    stdio: "pipe",
    cwd: app.isPackaged
      ? path.join(process.resourcesPath, "standalone")
      : path.join(__dirname, ".."),
  });

  serverProcess.stdout?.on("data", (data: Buffer) => {
    console.log(`[server] ${data.toString().trim()}`);
  });

  serverProcess.stderr?.on("data", (data: Buffer) => {
    console.error(`[server] ${data.toString().trim()}`);
  });

  serverProcess.on("exit", (code) => {
    console.log(`[server] exited with code ${code}`);
    serverProcess = null;
  });

  await waitForReady(port);

  serverPort = port;
  console.log(`[server] ready on port ${serverPort}`);
  return serverPort;
}

/** Gracefully stop the server. */
export async function stopServer(): Promise<void> {
  if (serverProcess) {
    serverProcess.kill("SIGTERM");

    // Wait up to 5 seconds for graceful shutdown
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        if (serverProcess) {
          serverProcess.kill("SIGKILL");
        }
        resolve();
      }, 5000);

      serverProcess!.on("exit", () => {
        clearTimeout(timeout);
        resolve();
      });
    });

    serverProcess = null;
  }
}
