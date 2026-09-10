import { NextResponse } from "next/server";
import { discordStatusPublic } from "@/lib/discord";
import { loadHousehold } from "@/lib/household";
import { latestReport, loadSettings } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const settings = loadSettings();
  return NextResponse.json({
    household: loadHousehold(),
    latest: latestReport(),
    discord: discordStatusPublic(),
    cron: settings.weeklyCron,
    timezone: "Europe/Berlin",
  });
}
