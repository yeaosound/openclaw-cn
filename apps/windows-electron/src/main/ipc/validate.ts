import {
  IPC_SCHEMA_VERSION,
  type DesktopNavigateRequest,
  type GatewayLogsTailRequest,
  type IpcRequestBase,
  type McpApplyRequest,
  type McpConfigPayload,
  type McpValidateRequest,
  type UpdateApplyRequest,
} from "./channels.js";

function toObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null) {
    throw new Error("IPC payload must be an object");
  }
  return value as Record<string, unknown>;
}

export function parseRequestBase(payload: unknown): IpcRequestBase {
  const body = toObject(payload);
  const requestId = body.requestId;
  const schemaVersion = body.schemaVersion;

  if (typeof requestId !== "string" || requestId.length < 8) {
    throw new Error("IPC payload missing valid requestId");
  }
  if (schemaVersion !== IPC_SCHEMA_VERSION) {
    throw new Error(`IPC schema mismatch: expected ${IPC_SCHEMA_VERSION}`);
  }

  return { requestId, schemaVersion };
}

function parseMcpConfig(value: unknown): McpConfigPayload {
  const body = toObject(value);
  const rawServers = body.mcpServers;
  if (typeof rawServers !== "object" || rawServers === null || Array.isArray(rawServers)) {
    throw new Error("mcpServers must be an object");
  }

  const mcpServers: McpConfigPayload["mcpServers"] = {};
  for (const [key, rawServer] of Object.entries(rawServers as Record<string, unknown>)) {
    const server = toObject(rawServer);
    const command = server.command;
    if (typeof command !== "string" || command.trim().length === 0) {
      throw new Error(`mcpServers.${key}.command must be a non-empty string`);
    }

    const next = { command: command.trim() } as McpConfigPayload["mcpServers"][string];
    if (Array.isArray(server.args)) {
      if (server.args.some((item) => typeof item !== "string")) {
        throw new Error(`mcpServers.${key}.args must be a string array`);
      }
      next.args = server.args as string[];
    }

    if (typeof server.cwd === "string") {
      next.cwd = server.cwd;
    }

    if (server.env && typeof server.env === "object" && !Array.isArray(server.env)) {
      const envEntries = Object.entries(server.env as Record<string, unknown>);
      const envObject: Record<string, string> = {};
      for (const [envKey, envValue] of envEntries) {
        if (typeof envValue !== "string") {
          throw new Error(`mcpServers.${key}.env.${envKey} must be a string`);
        }
        envObject[envKey] = envValue;
      }
      next.env = envObject;
    }

    mcpServers[key] = next;
  }

  return { mcpServers };
}

export function parseGatewayLogsTailRequest(payload: unknown): GatewayLogsTailRequest {
  const body = toObject(payload);
  const base = parseRequestBase(body);
  const rawLines = body.lines;
  const lines = Number(rawLines);

  return {
    ...base,
    ...(Number.isFinite(lines) ? { lines: Math.max(10, Math.min(Math.floor(lines), 500)) } : {}),
  };
}

export function parseMcpValidateRequest(payload: unknown): McpValidateRequest {
  const body = toObject(payload);
  return {
    ...parseRequestBase(body),
    config: parseMcpConfig(body.config),
  };
}

export function parseMcpApplyRequest(payload: unknown): McpApplyRequest {
  const body = toObject(payload);
  return {
    ...parseRequestBase(body),
    config: parseMcpConfig(body.config),
  };
}

export function parseUpdateApplyRequest(payload: unknown): UpdateApplyRequest {
  const body = toObject(payload);
  const base = parseRequestBase(body);
  const channel = body.channel;
  if (channel === undefined) {
    return base;
  }
  if (channel === "stable" || channel === "beta" || channel === "dev") {
    return {
      ...base,
      channel,
    };
  }
  throw new Error("updates:apply channel must be stable|beta|dev");
}

export function parseDesktopNavigateRequest(payload: unknown): DesktopNavigateRequest {
  const body = toObject(payload);
  const base = parseRequestBase(body);
  const mode = body.mode;
  if (mode === "bootstrap" || mode === "onboarding" || mode === "full") {
    return {
      ...base,
      mode,
    };
  }
  throw new Error("app:navigate mode must be bootstrap|onboarding|full");
}
