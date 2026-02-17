import fs from "node:fs/promises";
import path from "node:path";
import type { McpConfigPayload, McpValidationResult, ValidationIssue } from "../ipc/channels.js";

function resolveMcpRoot(appRoot: string): string {
  const home = process.env.USERPROFILE ?? process.env.HOME ?? appRoot;
  return path.join(home, ".openclaw", "mcp");
}

function resolveActivePath(appRoot: string): string {
  return path.join(resolveMcpRoot(appRoot), "active.json");
}

function resolveBackupPath(appRoot: string, backupId: string): string {
  return path.join(resolveMcpRoot(appRoot), "backup", `${backupId}.json`);
}

function nowBackupId(): string {
  return new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
}

function validateConfigPayload(config: McpConfigPayload): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const names = Object.keys(config.mcpServers ?? {});
  for (const name of names) {
    const server = config.mcpServers[name];
    const basePath = `mcpServers.${name}`;
    if (!server || typeof server !== "object") {
      issues.push({ path: basePath, message: "Server must be an object" });
      continue;
    }

    if (typeof server.command !== "string" || server.command.trim().length === 0) {
      issues.push({ path: `${basePath}.command`, message: "command is required" });
    }

    if (server.args && !Array.isArray(server.args)) {
      issues.push({ path: `${basePath}.args`, message: "args must be a string array" });
    } else if (Array.isArray(server.args) && server.args.some((item) => typeof item !== "string")) {
      issues.push({ path: `${basePath}.args`, message: "args must contain only strings" });
    }

    if (server.env && (typeof server.env !== "object" || Array.isArray(server.env))) {
      issues.push({ path: `${basePath}.env`, message: "env must be an object" });
    }

    if (typeof server.cwd === "string" && server.cwd.includes("..")) {
      issues.push({ path: `${basePath}.cwd`, message: "cwd cannot contain parent traversal" });
    }
  }

  return issues;
}

export async function validateMcpConfig(args: {
  appRoot: string;
  config: McpConfigPayload;
}): Promise<McpValidationResult> {
  const strict = process.env.OPENCLAW_WINDOWS_ELECTRON_MCP_STRICT !== "0";
  const activePath = resolveActivePath(args.appRoot);
  const issues = validateConfigPayload(args.config);
  return {
    valid: issues.length === 0,
    strict,
    activePath,
    issues,
  };
}

export async function applyMcpConfig(args: {
  appRoot: string;
  config: McpConfigPayload;
}): Promise<McpValidationResult> {
  const result = await validateMcpConfig(args);
  if (!result.valid) {
    return result;
  }

  const backupId = nowBackupId();
  const backupPath = resolveBackupPath(args.appRoot, backupId);
  const activePath = resolveActivePath(args.appRoot);

  await fs.mkdir(path.dirname(activePath), { recursive: true });
  await fs.mkdir(path.dirname(backupPath), { recursive: true });

  try {
    const previous = await fs.readFile(activePath, "utf8");
    await fs.writeFile(backupPath, previous, "utf8");
  } catch (error) {
    if (!(typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "ENOENT")) {
      throw error;
    }
  }

  await fs.writeFile(activePath, `${JSON.stringify(args.config, null, 2)}\n`, "utf8");

  return {
    ...result,
    backupPath,
  };
}

export function resolveMcpRuntimeEnv(args: { appRoot: string }): Record<string, string> {
  const activePath = resolveActivePath(args.appRoot);
  const strict = process.env.OPENCLAW_WINDOWS_ELECTRON_MCP_STRICT !== "0";
  return {
    OPENCLAW_GATEWAY_MCP_CONFIG: activePath,
    OPENCLAW_GATEWAY_STRICT_MCP_CONFIG: strict ? "1" : "0",
  };
}
