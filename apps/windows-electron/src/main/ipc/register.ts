import { ipcMain } from "electron";
import {
  IPC_CHANNELS,
  type DesktopError,
  type DesktopViewMode,
  type GatewaySupervisorStatus,
  type IpcEnvelope,
  type McpValidationResult,
  type ScheduledTaskStatus,
  type UpdateApplyResult,
  type UpdateCheckStatus,
} from "./channels.js";
import {
  parseDesktopNavigateRequest,
  parseGatewayLogsTailRequest,
  parseMcpApplyRequest,
  parseMcpValidateRequest,
  parseRequestBase,
  parseUpdateApplyRequest,
} from "./validate.js";
import type { GatewaySupervisor } from "../gateway/supervisor.js";
import type { WindowManager } from "../window-manager.js";
import { readGatewayLogTail } from "../gateway/log-tail.js";
import { applyMcpConfigDraft, validateMcpConfigDraft } from "../service/mcp-config.js";
import {
  getScheduledTaskStatus,
  installScheduledTask,
  restartScheduledTask,
} from "../service/scheduled-task.js";
import { applyUpdates, checkUpdates, rollbackLastKnownGood } from "../updates/updater.js";

type RegisterIpcArgs = {
  appRoot: string;
  supervisor: GatewaySupervisor;
  windowManager: WindowManager;
  onGatewayTransition: (status: GatewaySupervisorStatus) => void;
};

function toDesktopError(error: unknown): DesktopError {
  if (error instanceof Error) {
    return {
      code: "internal_error",
      message: error.message,
      hint: "Check gateway and daemon logs for details.",
      retriable: true,
    };
  }
  return {
    code: "internal_error",
    message: String(error),
    hint: "Unexpected non-Error rejection",
    retriable: false,
  };
}

async function wrap<T>(handler: () => Promise<T>): Promise<IpcEnvelope<T>> {
  try {
    return { ok: true, data: await handler() };
  } catch (error) {
    return { ok: false, error: toDesktopError(error) };
  }
}

export function registerIpcHandlers(args: RegisterIpcArgs) {
  ipcMain.handle(IPC_CHANNELS.gatewayStart, async (_event, payload: unknown) =>
    await wrap(async () => {
      const request = parseRequestBase(payload);
      const status = await args.supervisor.start(request.requestId);
      args.onGatewayTransition(status);
      return status;
    }),
  );

  ipcMain.handle(IPC_CHANNELS.gatewayStop, async (_event, payload: unknown) =>
    await wrap(async () => {
      const request = parseRequestBase(payload);
      const status = await args.supervisor.stop(request.requestId);
      args.onGatewayTransition(status);
      return status;
    }),
  );

  ipcMain.handle(IPC_CHANNELS.gatewayRestart, async (_event, payload: unknown) =>
    await wrap(async () => {
      const request = parseRequestBase(payload);
      const status = await args.supervisor.restart(request.requestId);
      args.onGatewayTransition(status);
      return status;
    }),
  );

  ipcMain.handle(IPC_CHANNELS.gatewayStatusGet, async (_event, payload: unknown) =>
    await wrap(async () => {
      const request = parseRequestBase(payload);
      return await args.supervisor.refreshStatus(request.requestId);
    }),
  );

  ipcMain.handle(IPC_CHANNELS.gatewayLogsTail, async (_event, payload: unknown) =>
    await wrap(async () => {
      const request = parseGatewayLogsTailRequest(payload);
      return await readGatewayLogTail(request.lines ?? 120);
    }),
  );

  ipcMain.handle(IPC_CHANNELS.serviceScheduledTaskGet, async (_event, payload: unknown) =>
    await wrap<ScheduledTaskStatus>(async () => {
      parseRequestBase(payload);
      return await getScheduledTaskStatus(args.appRoot);
    }),
  );

  ipcMain.handle(IPC_CHANNELS.serviceScheduledTaskInstall, async (_event, payload: unknown) =>
    await wrap<ScheduledTaskStatus>(async () => {
      parseRequestBase(payload);
      return await installScheduledTask(args.appRoot);
    }),
  );

  ipcMain.handle(IPC_CHANNELS.serviceScheduledTaskRestart, async (_event, payload: unknown) =>
    await wrap<ScheduledTaskStatus>(async () => {
      parseRequestBase(payload);
      return await restartScheduledTask(args.appRoot);
    }),
  );

  ipcMain.handle(IPC_CHANNELS.mcpConfigValidate, async (_event, payload: unknown) =>
    await wrap<McpValidationResult>(async () => {
      const request = parseMcpValidateRequest(payload);
      return await validateMcpConfigDraft({ appRoot: args.appRoot, config: request.config });
    }),
  );

  ipcMain.handle(IPC_CHANNELS.mcpConfigApply, async (_event, payload: unknown) =>
    await wrap<McpValidationResult>(async () => {
      const request = parseMcpApplyRequest(payload);
      return await applyMcpConfigDraft({ appRoot: args.appRoot, config: request.config });
    }),
  );

  ipcMain.handle(IPC_CHANNELS.updatesCheck, async (_event, payload: unknown) =>
    await wrap<UpdateCheckStatus>(async () => {
      parseRequestBase(payload);
      return await checkUpdates(args.appRoot);
    }),
  );

  ipcMain.handle(IPC_CHANNELS.updatesApply, async (_event, payload: unknown) =>
    await wrap<UpdateApplyResult>(async () => {
      const request = parseUpdateApplyRequest(payload);
      return await applyUpdates({ appRoot: args.appRoot, channel: request.channel });
    }),
  );

  ipcMain.handle(IPC_CHANNELS.updatesRollback, async (_event, payload: unknown) =>
    await wrap<UpdateApplyResult>(async () => {
      parseRequestBase(payload);
      return await rollbackLastKnownGood(args.appRoot);
    }),
  );

  ipcMain.handle(IPC_CHANNELS.appNavigate, async (_event, payload: unknown) =>
    await wrap<{ mode: DesktopViewMode }>(async () => {
      const request = parseDesktopNavigateRequest(payload);
      if (request.mode === "bootstrap") {
        await args.windowManager.openBootstrapSurface();
      } else {
        await args.windowManager.openControlUi(request.mode);
      }
      return { mode: request.mode };
    }),
  );
}
