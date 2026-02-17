import { BrowserWindow } from "electron";
import path from "node:path";
import { pathToFileURL } from "node:url";

type DesktopSurfaceMode = "bootstrap" | "onboarding" | "full";

const CONTROL_UI_ORIGIN = "http://127.0.0.1:18789";

function normalizeFileUrl(filePath: string): string {
  return pathToFileURL(filePath).toString();
}

function controlUiUrl(mode: "onboarding" | "full"): string {
  if (mode === "onboarding") {
    return `${CONTROL_UI_ORIGIN}/?onboarding=1`;
  }
  return `${CONTROL_UI_ORIGIN}/`;
}

function isAllowedWindowUrl(url: string, bootstrapUrl: string): boolean {
  if (url === bootstrapUrl) {
    return true;
  }
  return url.startsWith(`${CONTROL_UI_ORIGIN}/`) || url.startsWith("http://localhost:18789/");
}

export class WindowManager {
  private window: BrowserWindow | null = null;
  private shouldQuit = false;
  private bootstrapRendererPath: string | null = null;
  private activeSurface: DesktopSurfaceMode = "bootstrap";

  createMainWindow(preloadPath: string, rendererHtmlPath: string): BrowserWindow {
    if (this.window) {
      this.showMainWindow();
      return this.window;
    }

    this.bootstrapRendererPath = rendererHtmlPath;

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

    const bootstrapUrl = normalizeFileUrl(rendererHtmlPath);
    window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    window.webContents.on("will-navigate", (event, url) => {
      if (!isAllowedWindowUrl(url, bootstrapUrl)) {
        event.preventDefault();
      }
    });

    void window.loadFile(rendererHtmlPath);
    this.window = window;

    window.on("close", (event) => {
      if (this.shouldQuit) {
        return;
      }
      event.preventDefault();
      window.hide();
    });

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

  showMainWindow() {
    if (!this.window) {
      return;
    }
    if (!this.window.isVisible()) {
      this.window.show();
    }
    this.focusMainWindow();
  }

  hideMainWindow() {
    if (!this.window) {
      return;
    }
    this.window.hide();
  }

  async openBootstrapSurface() {
    if (!this.window || !this.bootstrapRendererPath) {
      return;
    }
    this.activeSurface = "bootstrap";
    await this.window.loadFile(this.bootstrapRendererPath);
    this.showMainWindow();
  }

  async openControlUi(mode: "onboarding" | "full") {
    if (!this.window) {
      return;
    }
    this.activeSurface = mode;
    await this.window.loadURL(controlUiUrl(mode));
    this.showMainWindow();
  }

  async reloadMainWindow() {
    if (!this.window) {
      return;
    }
    if (this.activeSurface === "bootstrap") {
      await this.openBootstrapSurface();
      return;
    }
    await this.openControlUi(this.activeSurface);
  }

  prepareForQuit() {
    this.shouldQuit = true;
  }

  resolveRendererHtml(appRoot: string): string {
    return path.join(appRoot, "dist", "renderer", "index.html");
  }

  resolvePreloadBundle(appRoot: string): string {
    return path.join(appRoot, "dist", "preload", "index.js");
  }
}
