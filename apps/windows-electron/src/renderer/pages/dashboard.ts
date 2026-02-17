import { statusClass } from "../components/status-pill.js";
import { GatewayStore } from "../state/gateway-store.js";

export function mountDashboard(root: HTMLElement) {
  const store = new GatewayStore();

  root.innerHTML = `
    <main class="layout">
      <section class="card">
        <h1>OpenClaw Windows Gateway</h1>
        <p class="muted">M1 baseline shell: gateway lifecycle, scheduled task status, and logs.</p>
        <div class="row">
          <span id="gateway-state" class="status-pill">stopped</span>
          <span id="gateway-port" class="mono">port 18789</span>
        </div>
        <div class="actions">
          <button id="gateway-start" class="btn btn-primary">Start</button>
          <button id="gateway-stop" class="btn">Stop</button>
          <button id="gateway-restart" class="btn">Restart</button>
        </div>
      </section>

      <section class="card">
        <h2>Scheduled Task</h2>
        <div id="scheduled-task-state" class="mono">unknown</div>
        <div class="actions">
          <button id="task-install" class="btn">Install / Repair</button>
          <button id="task-restart" class="btn">Restart task</button>
        </div>
      </section>

      <section class="card card-logs">
        <h2>Recent Gateway Logs</h2>
        <pre id="gateway-logs" class="logs">Loading logs…</pre>
      </section>

      <section id="error-banner" class="error-banner hidden"></section>
    </main>
  `;

  const gatewayState = root.querySelector<HTMLSpanElement>("#gateway-state");
  const gatewayPort = root.querySelector<HTMLSpanElement>("#gateway-port");
  const scheduledTaskState = root.querySelector<HTMLDivElement>("#scheduled-task-state");
  const logs = root.querySelector<HTMLElement>("#gateway-logs");
  const errorBanner = root.querySelector<HTMLElement>("#error-banner");

  root.querySelector<HTMLButtonElement>("#gateway-start")?.addEventListener("click", async () => {
    await store.startGateway();
  });
  root.querySelector<HTMLButtonElement>("#gateway-stop")?.addEventListener("click", async () => {
    await store.stopGateway();
  });
  root.querySelector<HTMLButtonElement>("#gateway-restart")?.addEventListener("click", async () => {
    await store.restartGateway();
  });
  root.querySelector<HTMLButtonElement>("#task-install")?.addEventListener("click", async () => {
    await store.installScheduledTask();
    await store.refreshAll();
  });
  root.querySelector<HTMLButtonElement>("#task-restart")?.addEventListener("click", async () => {
    await store.restartScheduledTask();
    await store.refreshAll();
  });

  store.subscribe((state) => {
    if (gatewayState) {
      gatewayState.className = statusClass(state.gateway.state);
      gatewayState.textContent = state.gateway.state;
    }

    if (gatewayPort) {
      gatewayPort.textContent = `port ${state.gateway.port}`;
    }

    if (scheduledTaskState) {
      const runtime = [
        state.scheduledTask.status,
        state.scheduledTask.state,
        state.scheduledTask.lastRunResult,
      ]
        .filter(Boolean)
        .join(" · ");
      scheduledTaskState.textContent = runtime || "unknown";
    }

    if (logs) {
      logs.textContent = state.logs.length > 0 ? state.logs.join("\n") : "No logs yet.";
    }

    if (errorBanner) {
      if (state.lastError) {
        errorBanner.classList.remove("hidden");
        errorBanner.textContent = state.lastError;
      } else {
        errorBanner.classList.add("hidden");
        errorBanner.textContent = "";
      }
    }
  });

  void store.refreshAll();
}
