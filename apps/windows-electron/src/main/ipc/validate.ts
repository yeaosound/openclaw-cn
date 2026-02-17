import {
  IPC_SCHEMA_VERSION,
  type GatewayLogsTailRequest,
  type IpcRequestBase,
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
