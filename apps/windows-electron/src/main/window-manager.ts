import { BrowserWindow } from "electron";
import path from "node:path";
import { pathToFileURL } from "node:url";

function normalizeFileUrl(filePath: string): string {
  return pathToFileURL(filePath).toString();
}

export class WindowManager {
  private window: BrowserWindow | null = null;

  createMainWindow(preloadPath: string, rendererHtmlPath: string): BrowserWindow {
    if (this.window) {
      return this.window;
    }

    const window = new BrowserWindow({
      width: 1024,
      height: 720,
      minWidth: 860,
      minHeight: 560,
      autoHideMenuBar: true,
      title: "OpenClaw for Windows",
      backgroundColor: "#0f1318",
      webPreferences: {
        preload: preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
      },
    });

    const allowedUrl = normalizeFileUrl(rendererHtmlPath);
    window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    window.webContents.on("will-navigate", (event, url) => {
      if (url !== allowedUrl) {
        event.preventDefault();
      }
    });

    void window.loadFile(rendererHtmlPath);
    this.window = window;

    window.on("closed", () => {
      this.window = null;
    });

    return window;
  }

  focusMainWindow() {
    if (!this.window) {
      return;
    }
    if (this.window.isMinimized()) {
      this.window.restore();
    }
    this.window.focus();
  }

  resolveRendererHtml(appRoot: string): string {
    return path.join(appRoot, "dist", "renderer", "index.html");
  }

  resolvePreloadBundle(appRoot: string): string {
    return path.join(appRoot, "dist", "preload", "index.js");
  }
}
