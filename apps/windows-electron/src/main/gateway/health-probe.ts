import net from "node:net";

async function probePortOnce(port: number, timeoutMs: number): Promise<boolean> {
  return await new Promise<boolean>((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    let settled = false;

    const finish = (result: boolean) => {
      if (settled) {
        return;
      }
      settled = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
    socket.once("close", () => finish(false));
  });
}

export async function waitForGatewayHealthy(args: {
  port: number;
  attempts?: number;
  timeoutMs?: number;
  delayMs?: number;
}): Promise<boolean> {
  const attempts = args.attempts ?? 20;
  const timeoutMs = args.timeoutMs ?? 700;
  const delayMs = args.delayMs ?? 400;

  for (let index = 0; index < attempts; index += 1) {
    const healthy = await probePortOnce(args.port, timeoutMs);
    if (healthy) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  return false;
}
