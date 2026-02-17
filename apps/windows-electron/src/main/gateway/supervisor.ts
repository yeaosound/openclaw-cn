import { runOpenClawCli } from "../openclaw-cli.js";
import type { GatewaySupervisorStatus } from "../ipc/channels.js";
import { parseDaemonStatusPayload } from "../service/daemon-status.js";
import { logOwnerDecision } from "../telemetry/owner-log.js";
import { waitForGatewayHealthy } from "./health-probe.js";

export type GatewaySupervisorOptions = {
  appRoot: string;
  gatewayPort: number;
};

export class GatewaySupervisor {
  private readonly appRoot: string;
  private readonly gatewayPort: number;
  private status: GatewaySupervisorStatus;

  constructor(options: GatewaySupervisorOptions) {
    this.appRoot = options.appRoot;
    this.gatewayPort = options.gatewayPort;
    this.status = {
      state: "stopped",
      port: options.gatewayPort,
    };
  }

  getStatus(): GatewaySupervisorStatus {
    return { ...this.status };
  }

  async refreshStatus(requestId: string = crypto.randomUUID()): Promise<GatewaySupervisorStatus> {
    const result = await runOpenClawCli({
      appRoot: this.appRoot,
      cliArgs: ["daemon", "status", "--json", "--no-probe", "--deep"],
    });

    const payload = result.code === 0 ? result.stdout : `${result.stdout}\n${result.stderr}`.trim();
    const parsed = parseDaemonStatusPayload(payload, this.gatewayPort);
    this.status = parsed.gateway;
    await logOwnerDecision({
      requestId,
      action: "status",
      decision: "allow",
      detail: `loaded=${parsed.owner.serviceLoaded} busy=${parsed.owner.portBusy} extra=${parsed.owner.extraServiceCount}`,
    });
    return this.getStatus();
  }

  private async ensureOwnerAvailable(requestId: string, action: "start" | "restart") {
    const statusResult = await runOpenClawCli({
      appRoot: this.appRoot,
      cliArgs: ["daemon", "status", "--json", "--no-probe", "--deep"],
    });
    const payload =
      statusResult.code === 0
        ? statusResult.stdout
        : `${statusResult.stdout}\n${statusResult.stderr}`.trim();
    const parsed = parseDaemonStatusPayload(payload, this.gatewayPort);
    const conflict = !parsed.owner.serviceLoaded && (parsed.owner.portBusy || parsed.owner.extraServiceCount > 0);

    if (!conflict) {
      await logOwnerDecision({
        requestId,
        action,
        decision: "allow",
        detail: `owner-ok loaded=${parsed.owner.serviceLoaded} busy=${parsed.owner.portBusy} extra=${parsed.owner.extraServiceCount}`,
      });
      return;
    }

    await logOwnerDecision({
      requestId,
      action,
      decision: "deny",
      detail: `owner-conflict loaded=${parsed.owner.serviceLoaded} busy=${parsed.owner.portBusy} extra=${parsed.owner.extraServiceCount}`,
    });

    throw new Error("Owner conflict: another gateway-like service appears active. Resolve conflict before starting.");
  }

  async start(requestId: string = crypto.randomUUID()): Promise<GatewaySupervisorStatus> {
    try {
      await this.ensureOwnerAvailable(requestId, "start");
    } catch (error) {
      this.status = {
        state: "error",
        port: this.status.port,
        lastError: String(error),
      };
      return this.getStatus();
    }

    const startResult = await runOpenClawCli({
      appRoot: this.appRoot,
      cliArgs: ["daemon", "start", "--json"],
    });

    if (startResult.code !== 0) {
      this.status = {
        state: "error",
        port: this.status.port,
        lastError: (startResult.stderr || startResult.stdout || "daemon start failed").trim(),
      };
      await logOwnerDecision({
        requestId,
        action: "start",
        decision: "error",
        detail: this.status.lastError ?? "daemon start failed",
      });
      return this.getStatus();
    }

    const refreshed = await this.refreshStatus(requestId);
    const healthy = await waitForGatewayHealthy({ port: refreshed.port });
    if (!healthy) {
      this.status = {
        ...refreshed,
        state: "error",
        lastError: "Gateway service started but health probe did not pass",
      };
      await logOwnerDecision({
        requestId,
        action: "start",
        decision: "error",
        detail: this.status.lastError ?? "Gateway service started but health probe did not pass",
      });
      return this.getStatus();
    }

    this.status = {
      ...refreshed,
      state: "running",
      startedAt: new Date().toISOString(),
      lastError: undefined,
    };
    return this.getStatus();
  }

  async stop(requestId: string = crypto.randomUUID()): Promise<GatewaySupervisorStatus> {
    const result = await runOpenClawCli({
      appRoot: this.appRoot,
      cliArgs: ["daemon", "stop", "--json"],
    });

    if (result.code !== 0) {
      this.status = {
        ...this.status,
        state: "error",
        lastError: (result.stderr || result.stdout || "daemon stop failed").trim(),
      };
      await logOwnerDecision({
        requestId,
        action: "stop",
        decision: "error",
        detail: this.status.lastError ?? "daemon stop failed",
      });
      return this.getStatus();
    }

    this.status = {
      ...(await this.refreshStatus(requestId)),
      state: "stopped",
      pid: undefined,
    };
    return this.getStatus();
  }

  async restart(requestId: string = crypto.randomUUID()): Promise<GatewaySupervisorStatus> {
    try {
      await this.ensureOwnerAvailable(requestId, "restart");
    } catch (error) {
      this.status = {
        state: "error",
        port: this.status.port,
        lastError: String(error),
      };
      return this.getStatus();
    }

    const result = await runOpenClawCli({
      appRoot: this.appRoot,
      cliArgs: ["daemon", "restart", "--json"],
    });

    if (result.code !== 0) {
      this.status = {
        ...this.status,
        state: "error",
        lastError: (result.stderr || result.stdout || "daemon restart failed").trim(),
      };
      await logOwnerDecision({
        requestId,
        action: "restart",
        decision: "error",
        detail: this.status.lastError ?? "daemon restart failed",
      });
      return this.getStatus();
    }

    const refreshed = await this.refreshStatus(requestId);
    const healthy = await waitForGatewayHealthy({ port: refreshed.port });
    if (!healthy) {
      this.status = {
        ...refreshed,
        state: "error",
        lastError: "Gateway service restarted but health probe did not pass",
      };
      await logOwnerDecision({
        requestId,
        action: "restart",
        decision: "error",
        detail: this.status.lastError ?? "Gateway service restarted but health probe did not pass",
      });
      return this.getStatus();
    }

    this.status = {
      ...refreshed,
      state: "running",
      startedAt: new Date().toISOString(),
      lastError: undefined,
    };
    return this.getStatus();
  }
}
