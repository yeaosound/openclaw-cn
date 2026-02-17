import type { GatewaySupervisorStatus, ScheduledTaskStatus } from "../../main/ipc/channels.js";

type ViewState = {
  gateway: GatewaySupervisorStatus;
  scheduledTask: ScheduledTaskStatus;
  logs: string[];
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
    const [gatewayStatus, scheduledTask, logs] = await Promise.all([
      window.openClawDesktop.gateway.getStatus(),
      window.openClawDesktop.scheduledTask.getStatus(),
      window.openClawDesktop.gateway.getLogs({ lines: 120 }),
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
}
