import fs from "node:fs/promises";
import path from "node:path";

export async function readGatewayLogTail(lines: number): Promise<string[]> {
  const home = process.env.USERPROFILE ?? process.env.HOME;
  if (!home) {
    return ["No USERPROFILE/HOME found; cannot resolve gateway log path."];
  }

  const gatewayLog = path.join(home, ".openclaw", "logs", "gateway.log");
  try {
    const content = await fs.readFile(gatewayLog, "utf8");
    return content
      .split(/\r?\n/)
      .filter((line) => line.length > 0)
      .slice(-lines);
  } catch (error) {
    return [`Unable to read gateway log at ${gatewayLog}: ${String(error)}`];
  }
}
