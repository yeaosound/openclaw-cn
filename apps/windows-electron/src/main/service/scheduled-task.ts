import type { ScheduledTaskStatus } from "../ipc/channels.js";
import { runOpenClawCli } from "../openclaw-cli.js";
import { parseDaemonStatusPayload } from "./daemon-status.js";
import { resolveMcpCliEnv } from "./mcp-config.js";

export async function getScheduledTaskStatus(appRoot: string): Promise<ScheduledTaskStatus> {
  const result = await runOpenClawCli({
    appRoot,
    cliArgs: ["daemon", "status", "--json", "--no-probe"],
  });

  const combined = `${result.stdout}\n${result.stderr}`.trim();
  if (result.code !== 0) {
    return {
      status: "unknown",
      detail: combined || "daemon status command failed",
    };
  }

  return parseDaemonStatusPayload(result.stdout, 18789).scheduledTask;
}

export async function installScheduledTask(appRoot: string): Promise<ScheduledTaskStatus> {
  const mcpEnv = await resolveMcpCliEnv(appRoot);
  const result = await runOpenClawCli({
    appRoot,
    cliArgs: ["daemon", "install", "--json", "--force"],
    env: mcpEnv,
  });

  if (result.code !== 0) {
    return {
      status: "unknown",
      detail: (result.stderr || result.stdout || "daemon install failed").trim(),
    };
  }

  return await getScheduledTaskStatus(appRoot);
}

export async function restartScheduledTask(appRoot: string): Promise<ScheduledTaskStatus> {
  const result = await runOpenClawCli({
    appRoot,
    cliArgs: ["daemon", "restart", "--json"],
  });

  if (result.code !== 0) {
    return {
      status: "unknown",
      detail: (result.stderr || result.stdout || "daemon restart failed").trim(),
    };
  }

  return await getScheduledTaskStatus(appRoot);
}
