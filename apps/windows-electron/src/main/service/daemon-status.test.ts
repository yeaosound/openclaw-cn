import test from "node:test";
import assert from "node:assert/strict";
import { parseDaemonStatusPayload } from "./daemon-status.js";

test("parseDaemonStatusPayload extracts runtime and port", () => {
  const parsed = parseDaemonStatusPayload(
    JSON.stringify({
      service: {
        loaded: true,
        runtime: {
          status: "running",
          state: "Running",
          pid: 4321,
          lastRunResult: "0x0",
          lastRunTime: "02/17/2026 02:00:00",
        },
      },
      port: {
        status: "busy",
      },
      extraServices: [{ label: "legacy", detail: "leftover" }],
      gateway: {
        port: 19001,
      },
    }),
    18789,
  );

  assert.equal(parsed.scheduledTask.status, "running");
  assert.equal(parsed.gateway.state, "running");
  assert.equal(parsed.gateway.port, 19001);
  assert.equal(parsed.gateway.pid, 4321);
  assert.equal(parsed.owner.serviceLoaded, true);
  assert.equal(parsed.owner.portBusy, true);
  assert.equal(parsed.owner.extraServiceCount, 1);
});

test("parseDaemonStatusPayload falls back to error when json invalid", () => {
  const parsed = parseDaemonStatusPayload("not-json", 18789);

  assert.equal(parsed.scheduledTask.status, "unknown");
  assert.equal(parsed.gateway.state, "error");
  assert.equal(parsed.gateway.port, 18789);
  assert.equal(parsed.gateway.lastError, "not-json");
});
