import fs from "node:fs/promises";
import path from "node:path";
import type { UpdateApplyResult, UpdateCheckStatus } from "../ipc/channels.js";
import { runOpenClawCli } from "../openclaw-cli.js";
import { parseDaemonStatusPayload } from "../service/daemon-status.js";

type UpdateStatusJson = {
  update?: {
    installKind?: string;
    git?: { branch?: string; behind?: number; ahead?: number };
    registry?: { latestVersion?: string };
  };
  channel?: {
    label?: string;
  };
  availability?: {
    available?: boolean;
  };
};

type LastKnownGood = {
  backupId: string;
  at: string;
};

type RuntimePaths = {
  configPath: string;
  mcpPath: string;
  runtimeRoot: string;
  backupRoot: string;
  lastKnownGoodPath: string;
};

function resolveHomeDir(appRoot: string): string {
  return process.env.USERPROFILE ?? process.env.HOME ?? appRoot;
}

function resolveRuntimePaths(appRoot: string): RuntimePaths {
  const home = resolveHomeDir(appRoot);
  const runtimeRoot = path.join(home, ".openclaw", "runtime");
  return {
    configPath: path.join(home, ".openclaw", "openclaw.json"),
    mcpPath: path.join(home, ".openclaw", "mcp", "active.json"),
    runtimeRoot,
    backupRoot: path.join(runtimeRoot, "backups"),
    lastKnownGoodPath: path.join(runtimeRoot, "last-known-good.json"),
  };
}

function backupIdNow(): string {
  return new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
}

function hasErrnoCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === code
  );
}

async function readFileIfExists(targetPath: string): Promise<string | null> {
  try {
    return await fs.readFile(targetPath, "utf8");
  } catch (error) {
    if (hasErrnoCode(error, "ENOENT")) {
      return null;
    }
    throw error;
  }
}

async function writeUtf8(targetPath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, content, "utf8");
}

async function copyFileIfExists(sourcePath: string, targetPath: string): Promise<boolean> {
  const content = await readFileIfExists(sourcePath);
  if (content === null) {
    return false;
  }
  await writeUtf8(targetPath, content);
  return true;
}

async function restoreBackupArtifacts(args: {
  backupDir: string;
  configPath: string;
  mcpPath: string;
}): Promise<boolean> {
  const restoredConfig = await copyFileIfExists(path.join(args.backupDir, "openclaw.json"), args.configPath);
  const restoredMcp = await copyFileIfExists(path.join(args.backupDir, "mcp.active.json"), args.mcpPath);
  return restoredConfig || restoredMcp;
}

async function checkDaemonHealthy(appRoot: string): Promise<boolean> {
  const result = await runOpenClawCli({
    appRoot,
    cliArgs: ["daemon", "status", "--json", "--no-probe", "--deep"],
    timeoutMs: 20_000,
  });

  if (result.code !== 0) {
    return false;
  }

  const payload = result.stdout.trim().length > 0 ? result.stdout : `${result.stdout}\n${result.stderr}`.trim();
  const parsed = parseDaemonStatusPayload(payload, 18789);
  return parsed.gateway.state === "running";
}

async function readLastKnownGood(pathToRead: string): Promise<LastKnownGood | null> {
  const raw = await readFileIfExists(pathToRead);
  if (!raw) {
    return null;
  }

  const parsed = JSON.parse(raw) as Partial<LastKnownGood>;
  if (typeof parsed.backupId !== "string" || parsed.backupId.length === 0) {
    throw new Error("last-known-good.json is missing backupId");
  }
  if (typeof parsed.at !== "string" || parsed.at.length === 0) {
    throw new Error("last-known-good.json is missing timestamp");
  }

  return {
    backupId: parsed.backupId,
    at: parsed.at,
  };
}

export async function checkUpdates(appRoot: string): Promise<UpdateCheckStatus> {
  const result = await runOpenClawCli({
    appRoot,
    cliArgs: ["update", "status", "--json", "--timeout", "5"],
    timeoutMs: 30_000,
  });

  if (result.code !== 0) {
    return {
      installKind: "unknown",
      channelLabel: "unknown",
      available: false,
      details: (result.stderr || result.stdout || "update status failed").trim(),
    };
  }

  try {
    const parsed = JSON.parse(result.stdout) as UpdateStatusJson;
    const installKind = parsed.update?.installKind ?? "unknown";
    const gitPart = parsed.update?.git
      ? `git ${parsed.update.git.branch ?? "detached"} (ahead ${parsed.update.git.ahead ?? 0}, behind ${parsed.update.git.behind ?? 0})`
      : null;
    const npmPart = parsed.update?.registry?.latestVersion
      ? `npm latest ${parsed.update.registry.latestVersion}`
      : null;

    return {
      installKind,
      channelLabel: parsed.channel?.label ?? "unknown",
      available: parsed.availability?.available === true,
      details: [gitPart, npmPart].filter(Boolean).join(" · ") || "Update status unavailable",
    };
  } catch {
    return {
      installKind: "unknown",
      channelLabel: "unknown",
      available: false,
      details: "Failed to parse update status JSON",
    };
  }
}

export async function applyUpdates(args: {
  appRoot: string;
  channel?: "stable" | "beta" | "dev";
}): Promise<UpdateApplyResult> {
  const paths = resolveRuntimePaths(args.appRoot);
  const backupId = backupIdNow();
  const backupDir = path.join(paths.backupRoot, backupId);

  await fs.mkdir(backupDir, { recursive: true });
  await copyFileIfExists(paths.configPath, path.join(backupDir, "openclaw.json"));
  await copyFileIfExists(paths.mcpPath, path.join(backupDir, "mcp.active.json"));

  const cliArgs = ["update", "--json", "--yes", "--no-restart"];
  if (args.channel) {
    cliArgs.push("--channel", args.channel);
  }

  const updateRun = await runOpenClawCli({
    appRoot: args.appRoot,
    cliArgs,
    timeoutMs: 10 * 60 * 1000,
  });

  if (updateRun.code !== 0) {
    const rollbackApplied = await restoreBackupArtifacts({
      backupDir,
      configPath: paths.configPath,
      mcpPath: paths.mcpPath,
    });
    return {
      status: rollbackApplied ? "rolled-back" : "error",
      backupId,
      rollbackApplied,
      healthAfterUpdate: false,
      message: (updateRun.stderr || updateRun.stdout || "Update apply failed").trim(),
    };
  }

  const healthy = await checkDaemonHealthy(args.appRoot);
  if (!healthy) {
    const rollbackApplied = await restoreBackupArtifacts({
      backupDir,
      configPath: paths.configPath,
      mcpPath: paths.mcpPath,
    });
    return {
      status: rollbackApplied ? "rolled-back" : "error",
      backupId,
      rollbackApplied,
      healthAfterUpdate: false,
      message: rollbackApplied
        ? "Update applied but daemon health check failed; restored last-known-good config"
        : "Update applied but daemon health check failed and no backup was available",
    };
  }

  await writeUtf8(
    paths.lastKnownGoodPath,
    `${JSON.stringify({ backupId, at: new Date().toISOString() }, null, 2)}\n`,
  );

  return {
    status: "ok",
    backupId,
    rollbackApplied: false,
    healthAfterUpdate: true,
    message: "Update applied and daemon status check passed",
  };
}

export async function rollbackLastKnownGood(appRoot: string): Promise<UpdateApplyResult> {
  const paths = resolveRuntimePaths(appRoot);
  const marker = await readLastKnownGood(paths.lastKnownGoodPath);
  if (!marker) {
    return {
      status: "error",
      backupId: "none",
      rollbackApplied: false,
      healthAfterUpdate: false,
      message: "No last-known-good marker found",
    };
  }

  const backupDir = path.join(paths.backupRoot, marker.backupId);
  const rollbackApplied = await restoreBackupArtifacts({
    backupDir,
    configPath: paths.configPath,
    mcpPath: paths.mcpPath,
  });

  if (!rollbackApplied) {
    return {
      status: "error",
      backupId: marker.backupId,
      rollbackApplied: false,
      healthAfterUpdate: false,
      message: `Backup ${marker.backupId} is missing restorable artifacts`,
    };
  }

  const restart = await runOpenClawCli({
    appRoot,
    cliArgs: ["daemon", "restart", "--json"],
    timeoutMs: 30_000,
  });

  if (restart.code !== 0) {
    return {
      status: "error",
      backupId: marker.backupId,
      rollbackApplied: true,
      healthAfterUpdate: false,
      message: (restart.stderr || restart.stdout || "Daemon restart failed after rollback").trim(),
    };
  }

  const healthy = await checkDaemonHealthy(appRoot);
  return {
    status: healthy ? "ok" : "error",
    backupId: marker.backupId,
    rollbackApplied: true,
    healthAfterUpdate: healthy,
    message: healthy
      ? `Rolled back to backup ${marker.backupId} and daemon is healthy`
      : `Rolled back to backup ${marker.backupId}, but daemon health check failed`,
  };
}
