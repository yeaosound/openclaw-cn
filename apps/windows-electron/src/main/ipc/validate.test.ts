import test from "node:test";
import assert from "node:assert/strict";
import { IPC_SCHEMA_VERSION } from "./channels.js";
import {
  parseGatewayLogsTailRequest,
  parseMcpApplyRequest,
  parseRequestBase,
  parseUpdateApplyRequest,
} from "./validate.js";

test("parseRequestBase accepts valid payload", () => {
  const payload = parseRequestBase({
    requestId: "req-12345678",
    schemaVersion: IPC_SCHEMA_VERSION,
  });

  assert.equal(payload.requestId, "req-12345678");
  assert.equal(payload.schemaVersion, IPC_SCHEMA_VERSION);
});

test("parseRequestBase rejects schema mismatch", () => {
  assert.throws(
    () =>
      parseRequestBase({
        requestId: "req-12345678",
        schemaVersion: IPC_SCHEMA_VERSION + 1,
      }),
    /IPC schema mismatch/,
  );
});

test("parseGatewayLogsTailRequest clamps line count", () => {
  const payload = parseGatewayLogsTailRequest({
    requestId: "req-12345678",
    schemaVersion: IPC_SCHEMA_VERSION,
    lines: 999,
  });

  assert.equal(payload.lines, 500);
});

test("parseMcpApplyRequest validates config payload", () => {
  const payload = parseMcpApplyRequest({
    requestId: "req-12345678",
    schemaVersion: IPC_SCHEMA_VERSION,
    config: {
      mcpServers: {
        local: {
          command: "node",
          args: ["server.js"],
        },
      },
    },
  });

  assert.equal(payload.config.mcpServers.local.command, "node");
});

test("parseUpdateApplyRequest validates channel enum", () => {
  const payload = parseUpdateApplyRequest({
    requestId: "req-12345678",
    schemaVersion: IPC_SCHEMA_VERSION,
    channel: "beta",
  });

  assert.equal(payload.channel, "beta");
  assert.throws(
    () =>
      parseUpdateApplyRequest({
        requestId: "req-12345678",
        schemaVersion: IPC_SCHEMA_VERSION,
        channel: "nightly",
      }),
    /stable\|beta\|dev/,
  );
});
