import { statusClass } from "../components/status-pill.js";
import { GatewayStore } from "../state/gateway-store.js";

export function mountDashboard(root: HTMLElement) {
  const store = new GatewayStore();

  root.innerHTML = `
    <main class="layout">
      <section class="card">
        <h1>OpenClaw Windows Gateway</h1>
        <p class="muted">M2 baseline: owner-safe lifecycle + MCP strict config + update rollback controls.</p>
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

      <section class="card">
        <h2>MCP Strict Config</h2>
        <p class="muted">Draft JSON is validated before apply. Strict mode is enforced by daemon install args.</p>
        <textarea id="mcp-draft" class="draft"></textarea>
        <div class="actions">
          <button id="mcp-validate" class="btn">Validate draft</button>
          <button id="mcp-apply" class="btn btn-primary">Apply draft</button>
        </div>
        <pre id="mcp-result" class="logs">No validation yet.</pre>
      </section>

      <section class="card">
        <h2>Update + Rollback</h2>
        <div id="update-summary" class="mono">Not checked</div>
        <div class="actions">
          <button id="update-refresh" class="btn">Check update</button>
          <button id="update-apply" class="btn btn-primary">Apply update</button>
          <button id="update-beta" class="btn">Apply beta</button>
          <button id="update-rollback" class="btn">Rollback</button>
        </div>
        <pre id="update-result" class="logs">No update run yet.</pre>
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
  const mcpDraft = root.querySelector<HTMLTextAreaElement>("#mcp-draft");
  const mcpResult = root.querySelector<HTMLElement>("#mcp-result");
  const updateSummary = root.querySelector<HTMLElement>("#update-summary");
  const updateResult = root.querySelector<HTMLElement>("#update-result");

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

  mcpDraft?.addEventListener("input", () => {
    store.setMcpDraft(mcpDraft.value);
  });
  root.querySelector<HTMLButtonElement>("#mcp-validate")?.addEventListener("click", async () => {
    await store.validateMcp();
  });
  root.querySelector<HTMLButtonElement>("#mcp-apply")?.addEventListener("click", async () => {
    await store.applyMcp();
  });

  root.querySelector<HTMLButtonElement>("#update-refresh")?.addEventListener("click", async () => {
    await store.refreshAll();
  });
  root.querySelector<HTMLButtonElement>("#update-apply")?.addEventListener("click", async () => {
    await store.applyUpdate();
  });
  root.querySelector<HTMLButtonElement>("#update-beta")?.addEventListener("click", async () => {
    await store.applyUpdate("beta");
  });
  root.querySelector<HTMLButtonElement>("#update-rollback")?.addEventListener("click", async () => {
    await store.rollbackUpdate();
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

    if (mcpDraft && mcpDraft.value !== state.mcpDraft) {
      mcpDraft.value = state.mcpDraft;
    }

    if (mcpResult && state.mcpValidation) {
      mcpResult.textContent = `${state.mcpValidation.ok ? "OK" : "FAILED"}\n${state.mcpValidation.details}`;
    }

    if (updateSummary) {
      const badge = state.update.available ? "update available" : "up to date";
      updateSummary.textContent = `${state.update.channelLabel} · ${badge} · ${state.update.details}`;
    }

    if (updateResult && state.updateApply) {
      updateResult.textContent = JSON.stringify(state.updateApply, null, 2);
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
