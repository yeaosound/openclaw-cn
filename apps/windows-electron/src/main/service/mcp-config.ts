import fs from "node:fs/promises";
import path from "node:path";

type McpPayload = {
  mcpServers: Record<string, unknown>;
};

function resolveMcpConfigPath(appRoot: string): string {
  const home = process.env.USERPROFILE ?? process.env.HOME ?? appRoot;
  return path.join(home, ".openclaw", "windows-electron", "mcp.config.json");
}

function parseServersJson(raw: string): Record<string, unknown> {
  const parsed = JSON.parse(raw) as unknown;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("MCP servers must be a JSON object");
  }
  return parsed as Record<string, unknown>;
}

export async function ensureMcpConfig(appRoot: string): Promise<{ path: string; strict: boolean }> {
  const configPath = resolveMcpConfigPath(appRoot);
  const strict = process.env.OPENCLAW_WINDOWS_ELECTRON_MCP_STRICT !== "0";
  const rawServers = process.env.OPENCLAW_WINDOWS_ELECTRON_MCP_SERVERS_JSON?.trim();

  const payload: McpPayload = {
    mcpServers: rawServers ? parseServersJson(rawServers) : {},
  };

  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(configPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return { path: configPath, strict };
}

export async function resolveMcpCliEnv(appRoot: string): Promise<Record<string, string>> {
  const mcp = await ensureMcpConfig(appRoot);
  return {
    OPENCLAW_GATEWAY_MCP_CONFIG: mcp.path,
    OPENCLAW_GATEWAY_STRICT_MCP_CONFIG: mcp.strict ? "1" : "0",
  };
}
