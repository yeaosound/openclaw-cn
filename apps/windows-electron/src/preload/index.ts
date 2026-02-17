import { contextBridge, ipcRenderer } from "electron";
import {
  IPC_CHANNELS,
  IPC_SCHEMA_VERSION,
  type GatewaySupervisorStatus,
  type IpcEnvelope,
  type McpConfigPayload,
  type McpValidationResult,
  type ScheduledTaskStatus,
  type UpdateApplyResult,
  type UpdateCheckStatus,
} from "../main/ipc/channels.js";
import { assertEnvelope, createRequestBase, sanitizeLogTailArgs } from "./schema.js";

const api = {
  gateway: {
    start: async (): Promise<IpcEnvelope<GatewaySupervisorStatus>> =>
      assertEnvelope<GatewaySupervisorStatus>(
        await ipcRenderer.invoke(IPC_CHANNELS.gatewayStart, createRequestBase(IPC_SCHEMA_VERSION)),
      ),
    stop: async (): Promise<IpcEnvelope<GatewaySupervisorStatus>> =>
      assertEnvelope<GatewaySupervisorStatus>(
        await ipcRenderer.invoke(IPC_CHANNELS.gatewayStop, createRequestBase(IPC_SCHEMA_VERSION)),
      ),
    restart: async (): Promise<IpcEnvelope<GatewaySupervisorStatus>> =>
      assertEnvelope<GatewaySupervisorStatus>(
        await ipcRenderer.invoke(IPC_CHANNELS.gatewayRestart, createRequestBase(IPC_SCHEMA_VERSION)),
      ),
    getStatus: async (): Promise<IpcEnvelope<GatewaySupervisorStatus>> =>
      assertEnvelope<GatewaySupervisorStatus>(
        await ipcRenderer.invoke(IPC_CHANNELS.gatewayStatusGet, createRequestBase(IPC_SCHEMA_VERSION)),
      ),
    getLogs: async (input?: { lines?: number }): Promise<IpcEnvelope<string[]>> =>
      assertEnvelope<string[]>(
        await ipcRenderer.invoke(IPC_CHANNELS.gatewayLogsTail, {
          ...createRequestBase(IPC_SCHEMA_VERSION),
          ...sanitizeLogTailArgs(input),
        }),
      ),
  },
  scheduledTask: {
    getStatus: async (): Promise<IpcEnvelope<ScheduledTaskStatus>> =>
      assertEnvelope<ScheduledTaskStatus>(
        await ipcRenderer.invoke(
          IPC_CHANNELS.serviceScheduledTaskGet,
          createRequestBase(IPC_SCHEMA_VERSION),
        ),
      ),
    install: async (): Promise<IpcEnvelope<ScheduledTaskStatus>> =>
      assertEnvelope<ScheduledTaskStatus>(
        await ipcRenderer.invoke(
          IPC_CHANNELS.serviceScheduledTaskInstall,
          createRequestBase(IPC_SCHEMA_VERSION),
        ),
      ),
    restart: async (): Promise<IpcEnvelope<ScheduledTaskStatus>> =>
      assertEnvelope<ScheduledTaskStatus>(
        await ipcRenderer.invoke(
          IPC_CHANNELS.serviceScheduledTaskRestart,
          createRequestBase(IPC_SCHEMA_VERSION),
        ),
      ),
  },
  mcp: {
    validate: async (config: McpConfigPayload): Promise<IpcEnvelope<McpValidationResult>> =>
      assertEnvelope<McpValidationResult>(
        await ipcRenderer.invoke(IPC_CHANNELS.mcpConfigValidate, {
          ...createRequestBase(IPC_SCHEMA_VERSION),
          config,
        }),
      ),
    apply: async (config: McpConfigPayload): Promise<IpcEnvelope<McpValidationResult>> =>
      assertEnvelope<McpValidationResult>(
        await ipcRenderer.invoke(IPC_CHANNELS.mcpConfigApply, {
          ...createRequestBase(IPC_SCHEMA_VERSION),
          config,
        }),
      ),
  },
  updates: {
    check: async (): Promise<IpcEnvelope<UpdateCheckStatus>> =>
      assertEnvelope<UpdateCheckStatus>(
        await ipcRenderer.invoke(IPC_CHANNELS.updatesCheck, createRequestBase(IPC_SCHEMA_VERSION)),
      ),
    apply: async (channel?: "stable" | "beta" | "dev"): Promise<IpcEnvelope<UpdateApplyResult>> =>
      assertEnvelope<UpdateApplyResult>(
        await ipcRenderer.invoke(IPC_CHANNELS.updatesApply, {
          ...createRequestBase(IPC_SCHEMA_VERSION),
          ...(channel ? { channel } : {}),
        }),
      ),
    rollback: async (): Promise<IpcEnvelope<UpdateApplyResult>> =>
      assertEnvelope<UpdateApplyResult>(
        await ipcRenderer.invoke(
          IPC_CHANNELS.updatesRollback,
          createRequestBase(IPC_SCHEMA_VERSION),
        ),
      ),
  },
} as const;

contextBridge.exposeInMainWorld("openClawDesktop", api);

export type OpenClawDesktopApi = typeof api;

declare global {
  interface Window {
    openClawDesktop: OpenClawDesktopApi;
  }
}
