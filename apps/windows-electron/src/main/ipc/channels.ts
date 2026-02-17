export const IPC_SCHEMA_VERSION = 1;

export type IpcRequestBase = {
  requestId: string;
  schemaVersion: number;
};

export type GatewayLogsTailRequest = IpcRequestBase & {
  lines?: number;
};

export type McpServerConfig = {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
};

export type McpConfigPayload = {
  mcpServers: Record<string, McpServerConfig>;
};

export type McpValidateRequest = IpcRequestBase & {
  config: McpConfigPayload;
};

export type McpApplyRequest = IpcRequestBase & {
  config: McpConfigPayload;
};

export type UpdateApplyRequest = IpcRequestBase & {
  channel?: "stable" | "beta" | "dev";
};

export const IPC_CHANNELS = {
  gatewayStart: "gateway:start",
  gatewayStop: "gateway:stop",
  gatewayRestart: "gateway:restart",
  gatewayStatusGet: "gateway:status:get",
  gatewayLogsTail: "gateway:logs:tail",
  serviceScheduledTaskGet: "service:scheduled-task:get",
  serviceScheduledTaskInstall: "service:scheduled-task:install",
  serviceScheduledTaskRestart: "service:scheduled-task:restart",
  mcpConfigValidate: "mcp:config:validate",
  mcpConfigApply: "mcp:config:apply",
  updatesCheck: "updates:check",
  updatesApply: "updates:apply",
  updatesRollback: "updates:rollback",
} as const;

export type IpcChannelName = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];

export type DesktopError = {
  code: string;
  message: string;
  hint?: string;
  retriable: boolean;
};

export type IpcEnvelope<T> = {
  ok: true;
  data: T;
} | {
  ok: false;
  error: DesktopError;
};

export type GatewaySupervisorStatus = {
  state: "stopped" | "starting" | "running" | "error";
  port: number;
  pid?: number;
  startedAt?: string;
  lastExitCode?: number;
  lastError?: string;
};

export type ScheduledTaskStatus = {
  status: string;
  detail?: string;
  state?: string;
  lastRunTime?: string;
  lastRunResult?: string;
};

export type ValidationIssue = {
  path: string;
  message: string;
};

export type McpValidationResult = {
  valid: boolean;
  strict: boolean;
  activePath: string;
  backupPath?: string;
  issues: ValidationIssue[];
};

export type UpdateCheckStatus = {
  installKind: string;
  channelLabel: string;
  available: boolean;
  details: string;
};

export type UpdateApplyResult = {
  status: "ok" | "error" | "rolled-back";
  backupId: string;
  rollbackApplied: boolean;
  healthAfterUpdate: boolean;
  message: string;
};
