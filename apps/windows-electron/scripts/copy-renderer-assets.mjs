import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "..");

const source = path.join(appRoot, "src", "renderer", "index.html");
const target = path.join(appRoot, "dist", "renderer", "index.html");

await fs.mkdir(path.dirname(target), { recursive: true });
await fs.copyFile(source, target);
