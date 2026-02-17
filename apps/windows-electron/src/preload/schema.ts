import type { DesktopError, IpcEnvelope } from "../main/ipc/channels.js";

export function assertEnvelope<T>(value: unknown): IpcEnvelope<T> {
  if (typeof value !== "object" || value === null) {
    throw new Error("IPC response must be an object");
  }

  const envelope = value as { ok?: unknown; data?: unknown; error?: unknown };
  if (envelope.ok === true) {
    return { ok: true, data: envelope.data as T };
  }

  const fallbackError: DesktopError = {
    code: "invalid_ipc_response",
    message: "IPC response does not contain a valid error payload",
    retriable: false,
  };

  if (envelope.ok === false && typeof envelope.error === "object" && envelope.error !== null) {
    const candidate = envelope.error as Partial<DesktopError>;
    return {
      ok: false,
      error: {
        code: typeof candidate.code === "string" ? candidate.code : fallbackError.code,
        message: typeof candidate.message === "string" ? candidate.message : fallbackError.message,
        hint: typeof candidate.hint === "string" ? candidate.hint : undefined,
        retriable: typeof candidate.retriable === "boolean" ? candidate.retriable : false,
      },
    };
  }

  return {
    ok: false,
    error: fallbackError,
  };
}

export function sanitizeLogTailArgs(input?: { lines?: number }): { lines: number } {
  if (!input || typeof input !== "object") {
    return { lines: 120 };
  }
  const lines = Number(input.lines);
  if (!Number.isFinite(lines)) {
    return { lines: 120 };
  }
  return { lines: Math.max(10, Math.min(Math.floor(lines), 500)) };
}

export function createRequestBase(schemaVersion: number): {
  requestId: string;
  schemaVersion: number;
} {
  return {
    requestId: crypto.randomUUID(),
    schemaVersion,
  };
}
