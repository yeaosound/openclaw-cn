import { ipcMain } from "electron";
import {
  IPC_CHANNELS,
  type DesktopError,
  type GatewaySupervisorStatus,
  type IpcEnvelope,
  type ScheduledTaskStatus,
} from "./channels.js";
import { parseGatewayLogsTailRequest, parseRequestBase } from "./validate.js";
import type { GatewaySupervisor } from "../gateway/supervisor.js";
import { readGatewayLogTail } from "../gateway/log-tail.js";
import {
  getScheduledTaskStatus,
  installScheduledTask,
  restartScheduledTask,
} from "../service/scheduled-task.js";

type RegisterIpcArgs = {
  appRoot: string;
  supervisor: GatewaySupervisor;
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
}
