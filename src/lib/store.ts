import fs from "node:fs";
import { dataFile } from "@/lib/paths";
import type { AppSettings, ScanReport } from "@/lib/types";

const MAX_REPORTS = 60;

export const DEFAULT_SETTINGS: AppSettings = {
  discordWebhookUrl: "",
  weeklyCron: "0 7 * * 1",
  postOnImprovementEuro: 50,
};

export function loadSettings(): AppSettings {
  const envUrl = process.env.DISCORD_WEBHOOK_URL?.trim() ?? "";
  const file = dataFile("settings.json");
  let stored: Partial<AppSettings> = {};
  if (fs.existsSync(file)) {
    stored = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<AppSettings>;
  }
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    discordWebhookUrl: envUrl || stored.discordWebhookUrl || "",
    weeklyCron: process.env.REPORT_CRON?.trim() || stored.weeklyCron || DEFAULT_SETTINGS.weeklyCron,
  };
}

export function saveSettings(update: Partial<AppSettings>): AppSettings {
  const current = loadSettings();
  const next: AppSettings = {
    ...current,
    ...update,
  };
  if (process.env.DISCORD_WEBHOOK_URL?.trim()) {
    next.discordWebhookUrl = process.env.DISCORD_WEBHOOK_URL.trim();
  }
  fs.writeFileSync(dataFile("settings.json"), JSON.stringify(next, null, 2) + "\n");
  return next;
}

export function webhookConfigured(): boolean {
  return Boolean(loadSettings().discordWebhookUrl);
}

export function maskWebhook(url: string): string {
  if (!url) return "";
  try {
    const u = new URL(url);
    const tail = u.pathname.slice(-8);
    return `${u.origin}/…${tail}`;
  } catch {
    return "gesetzt";
  }
}

export function loadReports(): ScanReport[] {
  const file = dataFile("reports.json");
  if (!fs.existsSync(file)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as ScanReport[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function latestReport(): ScanReport | null {
  return loadReports()[0] ?? null;
}

export function saveReport(report: ScanReport): ScanReport[] {
  const existing = loadReports().filter((item) => item.id !== report.id);
  const next = [report, ...existing].slice(0, MAX_REPORTS);
  fs.writeFileSync(dataFile("reports.json"), JSON.stringify(next, null, 2) + "\n");
  return next;
}
