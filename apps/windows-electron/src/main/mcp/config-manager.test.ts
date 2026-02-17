import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { resolveMcpRuntimeEnv, validateMcpConfig } from "./config-manager.js";

test("validateMcpConfig accepts minimal server config", async () => {
  const result = await validateMcpConfig({
    appRoot: "C:/workspace/openclaw",
    config: {
      mcpServers: {
        local: {
          command: "node",
          args: ["server.js"],
        },
      },
    },
  });

  assert.equal(result.valid, true);
  assert.equal(result.issues.length, 0);
  assert.equal(result.activePath.endsWith(path.join(".openclaw", "mcp", "active.json")), true);
});

test("validateMcpConfig rejects cwd traversal", async () => {
  const result = await validateMcpConfig({
    appRoot: "C:/workspace/openclaw",
    config: {
      mcpServers: {
        invalid: {
          command: "node",
          cwd: "../escape",
        },
      },
    },
  });

  assert.equal(result.valid, false);
  assert.equal(result.issues.some((issue) => issue.path === "mcpServers.invalid.cwd"), true);
});

test("resolveMcpRuntimeEnv respects strict toggle", () => {
  const previous = process.env.OPENCLAW_WINDOWS_ELECTRON_MCP_STRICT;
  try {
    delete process.env.OPENCLAW_WINDOWS_ELECTRON_MCP_STRICT;
    const strictOn = resolveMcpRuntimeEnv({ appRoot: "C:/workspace/openclaw" });
    assert.equal(strictOn.OPENCLAW_GATEWAY_STRICT_MCP_CONFIG, "1");

    process.env.OPENCLAW_WINDOWS_ELECTRON_MCP_STRICT = "0";
    const strictOff = resolveMcpRuntimeEnv({ appRoot: "C:/workspace/openclaw" });
    assert.equal(strictOff.OPENCLAW_GATEWAY_STRICT_MCP_CONFIG, "0");
  } finally {
    if (previous === undefined) {
      delete process.env.OPENCLAW_WINDOWS_ELECTRON_MCP_STRICT;
    } else {
      process.env.OPENCLAW_WINDOWS_ELECTRON_MCP_STRICT = previous;
    }
  }
});
