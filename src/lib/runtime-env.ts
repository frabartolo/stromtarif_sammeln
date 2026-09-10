import fs from "node:fs";
import path from "node:path";

let fileCache: Record<string, string> | null = null;

function parseDotEnv(contents: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of contents.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const stripped = line.startsWith("export ") ? line.slice(7).trim() : line;
    const eq = stripped.indexOf("=");
    if (eq < 1) continue;
    const key = stripped.slice(0, eq).trim();
    let value = stripped.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function loadEnvFile(): Record<string, string> {
  if (fileCache) return fileCache;
  const candidates = [
    process.env["STROMTARIF_ENV_FILE"],
    "/app/runtime.env",
    path.join(process.cwd(), ".env"),
  ].filter((item): item is string => Boolean(item));
  for (const file of candidates) {
    try {
      if (fs.existsSync(file)) {
        fileCache = parseDotEnv(fs.readFileSync(file, "utf8"));
        return fileCache;
      }
    } catch {
      // Container-User darf die Host-.env mit 600 nicht lesen – dann nur process.env.
    }
  }
  fileCache = {};
  return fileCache;
}

/** Runtime-Lookup. Bracket-Zugriff, damit Next.js den Wert nicht zur Build-Zeit leer backt. */
export function runtimeEnv(name: string): string {
  const fromProcess = process.env[name];
  if (fromProcess != null && String(fromProcess).trim() !== "") {
    return String(fromProcess).trim();
  }
  return (loadEnvFile()[name] ?? "").trim();
}
