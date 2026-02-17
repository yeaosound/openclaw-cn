type BootstrapStatus = {
  gateway: {
    ok: boolean;
    state: string;
    port: number;
    error?: string;
  };
  task: {
    ok: boolean;
    status: string;
    detail?: string;
  };
};

type Guidance = {
  level: "ok" | "warn" | "error";
  title: string;
  action: string;
};

function friendlyTaskStatus(status: string): string {
  if (!status) {
    return "unknown";
  }
  return status;
}

function resolveGuidance(status: BootstrapStatus): Guidance {
  if (status.gateway.ok && status.gateway.state === "running") {
    return {
      level: "ok",
      title: "Gateway is healthy",
      action: "Open Full UI for normal operation.",
    };
  }

  const taskDetail = (status.task.detail ?? "").toLowerCase();
  const gatewayError = (status.gateway.error ?? "").toLowerCase();

  if (!status.task.ok || status.task.status === "unknown") {
    if (
      taskDetail.includes("not found") ||
      taskDetail.includes("cannot find") ||
      taskDetail.includes("specified file")
    ) {
      return {
        level: "warn",
        title: "Owner service is not registered yet",
        action: "Run Install + Start, then open onboarding UI.",
      };
    }
    return {
      level: "warn",
      title: "Owner status is unavailable",
      action: "Retry refresh, then run Install + Start if this remains.",
    };
  }

  if (gatewayError.includes("owner conflict") || gatewayError.includes("port") || gatewayError.includes("busy")) {
    return {
      level: "error",
      title: "Gateway ownership conflict detected",
      action: "Free port 18789 or stop the conflicting process, then restart gateway.",
    };
  }

  return {
    level: "warn",
    title: "Gateway is not running",
    action: "Open onboarding UI and complete bootstrap steps.",
  };
}

export function mountDashboard(root: HTMLElement) {
  root.innerHTML = `
    <main class="host-layout">
      <header class="host-header">
        <div>
          <h1>OpenClaw Desktop Bootstrap</h1>
          <p class="muted">No iframe mode: bootstrap here, then navigate this window directly to the built-in Control UI.</p>
        </div>
        <div class="actions">
          <button id="onboard-run" class="btn btn-primary">Install + Start</button>
          <button id="gateway-restart" class="btn">Restart Gateway</button>
          <button id="open-onboarding" class="btn">Open Onboarding UI</button>
          <button id="open-full" class="btn">Open Full UI</button>
          <button id="refresh-status" class="btn">Refresh Status</button>
          <button id="toggle-autoroute" class="btn">Auto-route: on</button>
        </div>
      </header>

      <section class="status-bar">
        <span id="gateway-status" class="mono">Gateway: checking...</span>
        <span id="task-status" class="mono">Owner: checking...</span>
      </section>

      <section class="note-card">
        <h2>Recommended next step</h2>
        <p id="guidance-title" class="guidance guidance-warn">Inspecting runtime...</p>
        <p id="guidance-action" class="muted">Run Refresh Status if this takes too long.</p>
        <ol>
          <li>Use <strong>Install + Start</strong> to bootstrap Scheduled Task + gateway.</li>
          <li>Open the built-in Control UI with either onboarding mode or full mode.</li>
          <li>Tray menu can reopen bootstrap/onboarding/full surfaces at any time.</li>
        </ol>
      </section>

      <section id="error-banner" class="error-banner hidden"></section>
    </main>
  `;

  const onboardRun = root.querySelector<HTMLButtonElement>("#onboard-run");
  const restartGateway = root.querySelector<HTMLButtonElement>("#gateway-restart");
  const openOnboarding = root.querySelector<HTMLButtonElement>("#open-onboarding");
  const openFull = root.querySelector<HTMLButtonElement>("#open-full");
  const refreshStatus = root.querySelector<HTMLButtonElement>("#refresh-status");
  const toggleAutoRoute = root.querySelector<HTMLButtonElement>("#toggle-autoroute");
  const gatewayStatus = root.querySelector<HTMLElement>("#gateway-status");
  const taskStatus = root.querySelector<HTMLElement>("#task-status");
  const guidanceTitle = root.querySelector<HTMLElement>("#guidance-title");
  const guidanceAction = root.querySelector<HTMLElement>("#guidance-action");
  const errorBanner = root.querySelector<HTMLElement>("#error-banner");

  let autoRouted = false;
  let autoRouteEnabled = window.localStorage.getItem("openclaw.desktop.bootstrapAutoRoute") !== "off";

  const syncAutoRouteButton = () => {
    if (!toggleAutoRoute) {
      return;
    }
    toggleAutoRoute.textContent = `Auto-route: ${autoRouteEnabled ? "on" : "off"}`;
  };

  syncAutoRouteButton();

  const setError = (message?: string) => {
    if (!errorBanner) {
      return;
    }
    if (!message) {
      errorBanner.classList.add("hidden");
      errorBanner.textContent = "";
      return;
    }
    errorBanner.classList.remove("hidden");
    errorBanner.textContent = message;
  };

  const setBusy = (
    button: HTMLButtonElement | null,
    busy: boolean,
    busyLabel: string,
    idleLabel: string,
  ) => {
    if (!button) {
      return;
    }
    button.disabled = busy;
    button.textContent = busy ? busyLabel : idleLabel;
  };

  const navigateDesktop = async (mode: "bootstrap" | "onboarding" | "full") => {
    const result = await window.openClawDesktop.app.navigate(mode);
    if (!result.ok) {
      throw new Error(result.error.message);
    }
  };

  const refresh = async () => {
    const [gateway, task] = await Promise.all([
      window.openClawDesktop.gateway.getStatus(),
      window.openClawDesktop.scheduledTask.getStatus(),
    ]);

    const current: BootstrapStatus = {
      gateway: gateway.ok
        ? {
            ok: true,
            state: gateway.data.state,
            port: gateway.data.port,
          }
        : {
            ok: false,
            state: "error",
            port: 18789,
            error: gateway.error.message,
          },
      task: task.ok
        ? {
            ok: true,
            status: task.data.status,
            detail: task.data.detail,
          }
        : {
            ok: false,
            status: "unknown",
            detail: task.error.message,
          },
    };

    if (gatewayStatus) {
      gatewayStatus.textContent = current.gateway.ok
        ? `Gateway: ${current.gateway.state} on port ${current.gateway.port}`
        : "Gateway: unavailable";
    }

    if (taskStatus) {
      const detail = current.task.detail ? ` (${current.task.detail})` : "";
      taskStatus.textContent = `Owner: ${friendlyTaskStatus(current.task.status)}${detail}`;
    }

    const guidance = resolveGuidance(current);
    if (guidanceTitle) {
      guidanceTitle.className = `guidance guidance-${guidance.level}`;
      guidanceTitle.textContent = guidance.title;
    }
    if (guidanceAction) {
      guidanceAction.textContent = guidance.action;
    }

    if (!gateway.ok) {
      setError(gateway.error.message);
    } else if (!task.ok) {
      setError(task.error.message);
    }

    if (!autoRouteEnabled || autoRouted) {
      return;
    }

    try {
      if (current.gateway.ok && current.gateway.state === "running") {
        autoRouted = true;
        await navigateDesktop("full");
        return;
      }

      if (current.task.ok && current.task.status !== "unknown") {
        autoRouted = true;
        await navigateDesktop("onboarding");
      }
    } catch (error) {
      autoRouted = false;
      setError(String(error));
    }
  };

  onboardRun?.addEventListener("click", async () => {
    setBusy(onboardRun, true, "Running...", "Install + Start");
    setError(undefined);
    try {
      const installResult = await window.openClawDesktop.scheduledTask.install();
      if (!installResult.ok) {
        throw new Error(installResult.error.message);
      }

      const startResult = await window.openClawDesktop.gateway.start();
      if (!startResult.ok) {
        throw new Error(startResult.error.message);
      }

      await refresh();
      await navigateDesktop("full");
    } catch (error) {
      setError(String(error));
    } finally {
      setBusy(onboardRun, false, "Running...", "Install + Start");
    }
  });

  restartGateway?.addEventListener("click", async () => {
    setBusy(restartGateway, true, "Restarting...", "Restart Gateway");
    setError(undefined);
    try {
      const result = await window.openClawDesktop.gateway.restart();
      if (!result.ok) {
        throw new Error(result.error.message);
      }
      await refresh();
    } catch (error) {
      setError(String(error));
    } finally {
      setBusy(restartGateway, false, "Restarting...", "Restart Gateway");
    }
  });

  openOnboarding?.addEventListener("click", async () => {
    setError(undefined);
    try {
      await navigateDesktop("onboarding");
    } catch (error) {
      setError(String(error));
    }
  });

  openFull?.addEventListener("click", async () => {
    setError(undefined);
    try {
      await navigateDesktop("full");
    } catch (error) {
      setError(String(error));
    }
  });

  refreshStatus?.addEventListener("click", async () => {
    setError(undefined);
    await refresh();
  });

  toggleAutoRoute?.addEventListener("click", () => {
    autoRouteEnabled = !autoRouteEnabled;
    window.localStorage.setItem("openclaw.desktop.bootstrapAutoRoute", autoRouteEnabled ? "on" : "off");
    syncAutoRouteButton();
  });

  void refresh();
}
