import { execFile, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type OpenClawCliTarget = {
  command: string;
  bootstrapArgs: string[];
};

export function resolveAppRoot(fromDir: string): string {
  return path.resolve(fromDir, "../..");
}

export function resolveRepoRoot(appRoot: string): string {
  return path.resolve(appRoot, "../..");
}

export function resolveOpenClawTarget(appRoot: string): OpenClawCliTarget {
  const explicit = process.env.OPENCLAW_WINDOWS_ELECTRON_OPENCLAW_BIN?.trim();
  if (explicit) {
    return { command: explicit, bootstrapArgs: [] };
  }

  const repoRoot = resolveRepoRoot(appRoot);
  const devEntrypoint = path.join(repoRoot, "scripts", "run-node.mjs");
  if (fs.existsSync(devEntrypoint)) {
    return {
      command: process.env.OPENCLAW_WINDOWS_ELECTRON_NODE_BIN?.trim() || "node",
      bootstrapArgs: [devEntrypoint],
    };
  }

  return {
    command: "openclaw",
    bootstrapArgs: [],
  };
}

export async function runOpenClawCli(args: {
  appRoot: string;
  cliArgs: string[];
  timeoutMs?: number;
  env?: Record<string, string | undefined>;
}): Promise<{ stdout: string; stderr: string; code: number }> {
  const target = resolveOpenClawTarget(args.appRoot);
  const repoRoot = resolveRepoRoot(args.appRoot);
  try {
    const result = await execFileAsync(target.command, [...target.bootstrapArgs, ...args.cliArgs], {
      cwd: repoRoot,
      timeout: args.timeoutMs ?? 15_000,
      windowsHide: true,
      encoding: "utf8",
      env: {
        ...process.env,
        ...(args.env ?? {}),
      },
    });
    return {
      stdout: String(result.stdout ?? ""),
      stderr: String(result.stderr ?? ""),
      code: 0,
    };
  } catch (error) {
    const typed = error as {
      stdout?: unknown;
      stderr?: unknown;
      code?: unknown;
      message?: unknown;
    };
    return {
      stdout: typeof typed.stdout === "string" ? typed.stdout : "",
      stderr:
        typeof typed.stderr === "string"
          ? typed.stderr
          : typeof typed.message === "string"
            ? typed.message
            : "",
      code: typeof typed.code === "number" ? typed.code : 1,
    };
  }
}

export function spawnOpenClawCli(args: {
  appRoot: string;
  cliArgs: string[];
}) {
  const target = resolveOpenClawTarget(args.appRoot);
  const repoRoot = resolveRepoRoot(args.appRoot);
  return spawn(target.command, [...target.bootstrapArgs, ...args.cliArgs], {
    cwd: repoRoot,
    windowsHide: true,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
}
