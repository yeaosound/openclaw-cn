import { app } from "electron";
import path from "node:path";
import { registerIpcHandlers } from "./ipc/register.js";
import type { GatewaySupervisorStatus } from "./ipc/channels.js";
import { GatewaySupervisor } from "./gateway/supervisor.js";
import { DesktopEventBus } from "./telemetry/event-bus.js";
import { WindowManager } from "./window-manager.js";
import { resolveAppRoot } from "./openclaw-cli.js";

const appRoot = resolveAppRoot(path.resolve(import.meta.dirname));
const windowManager = new WindowManager();
const gatewayPort = Number(process.env.OPENCLAW_GATEWAY_PORT ?? "18789");
const supervisor = new GatewaySupervisor({ appRoot, gatewayPort });
const eventBus = new DesktopEventBus();

if (process.platform !== "win32") {
  console.warn("[windows-electron] This package is designed for Windows and may be incomplete elsewhere.");
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    windowManager.focusMainWindow();
  });

  app.whenReady().then(() => {
    const preloadPath = windowManager.resolvePreloadBundle(appRoot);
    const rendererPath = windowManager.resolveRendererHtml(appRoot);

    windowManager.createMainWindow(preloadPath, rendererPath);

    const onGatewayTransition = (status: GatewaySupervisorStatus) => {
      eventBus.emit("gatewayTransition", {
        state: status.state,
        at: new Date().toISOString(),
      });
    };

    registerIpcHandlers({
      appRoot,
      supervisor,
      onGatewayTransition,
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });

}
