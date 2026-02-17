import type {
  GatewaySupervisorStatus,
  McpConfigPayload,
  ScheduledTaskStatus,
  UpdateApplyResult,
  UpdateCheckStatus,
} from "../../main/ipc/channels.js";

type ViewState = {
  gateway: GatewaySupervisorStatus;
  scheduledTask: ScheduledTaskStatus;
  logs: string[];
  update: UpdateCheckStatus;
  mcpDraft: string;
  mcpValidation?: {
    ok: boolean;
    details: string;
  };
  updateApply?: UpdateApplyResult;
  lastError?: string;
};

const DEFAULT_STATE: ViewState = {
  gateway: {
    state: "stopped",
    port: 18789,
  },
  scheduledTask: {
    status: "unknown",
  },
  logs: [],
  update: {
    installKind: "unknown",
    channelLabel: "unknown",
    available: false,
    details: "Not checked yet",
  },
  mcpDraft: JSON.stringify({ mcpServers: {} }, null, 2),
};

export class GatewayStore {
  private state: ViewState = structuredClone(DEFAULT_STATE);
  private listeners = new Set<(state: ViewState) => void>();

  subscribe(listener: (state: ViewState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  private publish() {
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }

  private setState(patch: Partial<ViewState>) {
    this.state = {
      ...this.state,
      ...patch,
    };
    this.publish();
  }

  private updateGateway(response: Awaited<ReturnType<typeof window.openClawDesktop.gateway.getStatus>>) {
    if (response.ok) {
      this.setState({ gateway: response.data, lastError: undefined });
      return;
    }
    this.setState({ lastError: response.error.message });
  }

  async refreshAll() {
    const [gatewayStatus, scheduledTask, logs, update] = await Promise.all([
      window.openClawDesktop.gateway.getStatus(),
      window.openClawDesktop.scheduledTask.getStatus(),
      window.openClawDesktop.gateway.getLogs({ lines: 120 }),
      window.openClawDesktop.updates.check(),
    ]);

    this.updateGateway(gatewayStatus);

    if (scheduledTask.ok) {
      this.setState({ scheduledTask: scheduledTask.data });
    } else {
      this.setState({ lastError: scheduledTask.error.message });
    }

    if (logs.ok) {
      this.setState({ logs: logs.data });
    }

    if (update.ok) {
      this.setState({ update: update.data });
    } else {
      this.setState({ lastError: update.error.message });
    }
  }

  async startGateway() {
    this.updateGateway(await window.openClawDesktop.gateway.start());
    await this.refreshAll();
  }

  async stopGateway() {
    this.updateGateway(await window.openClawDesktop.gateway.stop());
    await this.refreshAll();
  }

  async restartGateway() {
    this.updateGateway(await window.openClawDesktop.gateway.restart());
    await this.refreshAll();
  }

  async installScheduledTask() {
    const result = await window.openClawDesktop.scheduledTask.install();
    if (result.ok) {
      this.setState({ scheduledTask: result.data, lastError: undefined });
      return;
    }
    this.setState({ lastError: result.error.message });
  }

  async restartScheduledTask() {
    const result = await window.openClawDesktop.scheduledTask.restart();
    if (result.ok) {
      this.setState({ scheduledTask: result.data, lastError: undefined });
      return;
    }
    this.setState({ lastError: result.error.message });
  }

  setMcpDraft(raw: string) {
    this.setState({ mcpDraft: raw });
  }

  private parseMcpDraft(): McpConfigPayload {
    const parsed = JSON.parse(this.state.mcpDraft) as unknown;
    if (typeof parsed !== "object" || parsed === null) {
      throw new Error("MCP draft must be a JSON object");
    }
    const body = parsed as { mcpServers?: unknown };
    if (typeof body.mcpServers !== "object" || body.mcpServers === null || Array.isArray(body.mcpServers)) {
      throw new Error("MCP draft requires mcpServers object");
    }
    return { mcpServers: body.mcpServers as McpConfigPayload["mcpServers"] };
  }

  async validateMcp() {
    try {
      const payload = this.parseMcpDraft();
      const result = await window.openClawDesktop.mcp.validate(payload);
      if (!result.ok) {
        this.setState({
          mcpValidation: { ok: false, details: result.error.message },
          lastError: result.error.message,
        });
        return;
      }

      const issues = result.data.issues.map((issue) => `${issue.path}: ${issue.message}`).join("\n");
      this.setState({
        mcpValidation: {
          ok: result.data.valid,
          details: result.data.valid ? "MCP draft is valid." : issues || "Validation failed",
        },
        lastError: result.data.valid ? undefined : issues,
      });
    } catch (error) {
      this.setState({
        mcpValidation: { ok: false, details: String(error) },
        lastError: String(error),
      });
    }
  }

  async applyMcp() {
    try {
      const payload = this.parseMcpDraft();
      const result = await window.openClawDesktop.mcp.apply(payload);
      if (!result.ok) {
        this.setState({
          mcpValidation: { ok: false, details: result.error.message },
          lastError: result.error.message,
        });
        return;
      }

      const issues = result.data.issues.map((issue) => `${issue.path}: ${issue.message}`).join("\n");
      this.setState({
        mcpValidation: {
          ok: result.data.valid,
          details: result.data.valid
            ? `Applied to ${result.data.activePath}${result.data.backupPath ? ` (backup: ${result.data.backupPath})` : ""}`
            : issues || "Apply failed",
        },
        lastError: result.data.valid ? undefined : issues,
      });
    } catch (error) {
      this.setState({
        mcpValidation: { ok: false, details: String(error) },
        lastError: String(error),
      });
    }
  }

  async applyUpdate(channel?: "stable" | "beta" | "dev") {
    const result = await window.openClawDesktop.updates.apply(channel);
    if (!result.ok) {
      this.setState({ lastError: result.error.message });
      return;
    }
    this.setState({ updateApply: result.data, lastError: undefined });
    await this.refreshAll();
  }

  async rollbackUpdate() {
    const result = await window.openClawDesktop.updates.rollback();
    if (!result.ok) {
      this.setState({ lastError: result.error.message });
      return;
    }
    this.setState({ updateApply: result.data, lastError: undefined });
    await this.refreshAll();
  }
}
