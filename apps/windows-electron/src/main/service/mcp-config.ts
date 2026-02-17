import fs from "node:fs/promises";
import path from "node:path";
import type { McpConfigPayload, McpValidationResult } from "../ipc/channels.js";
import {
  applyMcpConfig,
  resolveMcpRuntimeEnv,
  validateMcpConfig,
} from "../mcp/config-manager.js";

const EMPTY_CONFIG: McpConfigPayload = {
  mcpServers: {},
};

export async function validateMcpConfigDraft(args: {
  appRoot: string;
  config: McpConfigPayload;
}): Promise<McpValidationResult> {
  return await validateMcpConfig(args);
}

export async function applyMcpConfigDraft(args: {
  appRoot: string;
  config: McpConfigPayload;
}): Promise<McpValidationResult> {
  return await applyMcpConfig(args);
}

async function ensureActiveConfigFile(appRoot: string): Promise<void> {
  const env = resolveMcpRuntimeEnv({ appRoot });
  const activePath = env.OPENCLAW_GATEWAY_MCP_CONFIG;
  try {
    await fs.access(activePath);
    return;
  } catch (error) {
    if (!(typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "ENOENT")) {
      throw error;
    }
  }

  await fs.mkdir(path.dirname(activePath), { recursive: true });
  await fs.writeFile(activePath, `${JSON.stringify(EMPTY_CONFIG, null, 2)}\n`, "utf8");
}

export async function resolveMcpCliEnv(appRoot: string): Promise<Record<string, string>> {
  await ensureActiveConfigFile(appRoot);
  return resolveMcpRuntimeEnv({ appRoot });
}
