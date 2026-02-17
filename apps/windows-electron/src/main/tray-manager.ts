import { Menu, Tray, nativeImage } from "electron";

const TRAY_DOT_ICON_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAC7SURBVHgBpZM9CsJAEIafQ2UlJhZ2trGJja34AFm6A4iNrYVYa+ENfAFLCwsLHyCksfFFmB3YzY0wl8rCSXf2f4aP5mFg4CeESQWYJ8zAflZQZWQ3ssoIxkwN0fVkrQAG7jvWqsl2AQaYQqCcA2iE4Uj6K6q7Q4Ar7TpAT5LFZmQohkCJQ8SkMl8nKkVYlDkDkrbAOJ8xyl0A8ArjM3QJY26O09U5rIk5y1q3d3NZfX2V6wkoY1Wf5KGk1HfK8kN6FzReN7l4YQAAAABJRU5ErkJggg==";

export type TrayManagerActions = {
  onShowWindow: () => void;
  onOpenBootstrap: () => void;
  onOpenOnboarding: () => void;
  onOpenFullUi: () => void;
  onReloadWindow: () => void;
  onQuit: () => void;
};

export class TrayManager {
  private tray: Tray | null = null;

  init(actions: TrayManagerActions) {
    if (this.tray) {
      return;
    }

    const icon = nativeImage.createFromDataURL(TRAY_DOT_ICON_DATA_URL);
    const tray = new Tray(icon);
    tray.setToolTip("OpenClaw for Windows");

    const rebuildMenu = () => {
      const menu = Menu.buildFromTemplate([
        {
          label: "Open OpenClaw",
          click: () => actions.onShowWindow(),
        },
        {
          label: "Open Desktop Bootstrap",
          click: () => actions.onOpenBootstrap(),
        },
        {
          label: "Open Onboarding",
          click: () => actions.onOpenOnboarding(),
        },
        {
          label: "Open Full UI",
          click: () => actions.onOpenFullUi(),
        },
        {
          label: "Reload UI",
          click: () => actions.onReloadWindow(),
        },
        { type: "separator" },
        {
          label: "Quit",
          click: () => actions.onQuit(),
        },
      ]);
      tray.setContextMenu(menu);
    };

    rebuildMenu();

    tray.on("click", () => {
      actions.onShowWindow();
    });

    this.tray = tray;
  }

  dispose() {
    if (!this.tray) {
      return;
    }
    this.tray.destroy();
    this.tray = null;
  }
}
