import fs from "node:fs/promises";
import path from "node:path";

function resolveOwnerLogPath(): string {
  const home = process.env.USERPROFILE ?? process.env.HOME ?? process.cwd();
  return path.join(home, ".openclaw", "logs", "windows-electron-owner.log");
}

export async function logOwnerDecision(entry: {
  requestId: string;
  action: string;
  decision: "allow" | "deny" | "error";
  detail: string;
}): Promise<void> {
  const line = `${new Date().toISOString()} requestId=${entry.requestId} action=${entry.action} decision=${entry.decision} detail=${entry.detail}\n`;
  const target = resolveOwnerLogPath();
  try {
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.appendFile(target, line, "utf8");
  } catch {
    // keep UI responsive even if log write fails
  }
}
