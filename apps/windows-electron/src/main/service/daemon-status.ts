import type { GatewaySupervisorStatus, ScheduledTaskStatus } from "../ipc/channels.js";

type DaemonStatusPayload = {
  service?: {
    loaded?: boolean;
    runtime?: {
      status?: string;
      detail?: string;
      state?: string;
      lastRunTime?: string;
      lastRunResult?: string;
      pid?: number;
      lastExitStatus?: number;
    };
  };
  gateway?: {
    port?: number;
  };
  port?: {
    status?: string;
  };
  extraServices?: Array<{ label?: string; detail?: string; scope?: string }>;
};

export type ParsedDaemonStatus = {
  scheduledTask: ScheduledTaskStatus;
  gateway: GatewaySupervisorStatus;
  owner: {
    serviceLoaded: boolean;
    portBusy: boolean;
    extraServiceCount: number;
  };
};

export function parseDaemonStatusPayload(output: string, fallbackPort: number): ParsedDaemonStatus {
  try {
    const parsed = JSON.parse(output) as DaemonStatusPayload;
    const runtime = parsed.service?.runtime;
    const port = parsed.gateway?.port ?? fallbackPort;
    const owner = {
      serviceLoaded: parsed.service?.loaded === true,
      portBusy: parsed.port?.status === "busy",
      extraServiceCount: parsed.extraServices?.length ?? 0,
    };

    if (!runtime) {
      return {
        scheduledTask: {
          status: "unknown",
          detail: "No runtime information in daemon status output",
        },
        gateway: {
          state: "error",
          port,
          lastError: "No runtime information in daemon status output",
        },
        owner,
      };
    }

    const runtimeState = runtime.status ?? "unknown";
    const gatewayState: GatewaySupervisorStatus["state"] =
      runtimeState === "running"
        ? "running"
        : runtimeState === "stopped"
          ? "stopped"
          : runtimeState === "starting"
            ? "starting"
            : "error";

    return {
      scheduledTask: {
        status: runtimeState,
        detail: runtime.detail,
        state: runtime.state,
        lastRunTime: runtime.lastRunTime,
        lastRunResult: runtime.lastRunResult,
      },
      gateway: {
        state: gatewayState,
        port,
        pid: runtime.pid,
        lastExitCode: runtime.lastExitStatus,
        ...(gatewayState === "error" && runtime.detail ? { lastError: runtime.detail } : {}),
      },
      owner,
    };
  } catch {
    const detail = output.trim() || "Unable to parse daemon status output";
    return {
      scheduledTask: {
        status: "unknown",
        detail,
      },
      gateway: {
        state: "error",
        port: fallbackPort,
        lastError: detail,
      },
      owner: {
        serviceLoaded: false,
        portBusy: false,
        extraServiceCount: 0,
      },
    };
  }
}
