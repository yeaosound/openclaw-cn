import test from "node:test";
import assert from "node:assert/strict";
import { IPC_SCHEMA_VERSION } from "./channels.js";
import { parseGatewayLogsTailRequest, parseRequestBase } from "./validate.js";

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
