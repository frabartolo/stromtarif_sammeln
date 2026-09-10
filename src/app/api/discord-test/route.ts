import { NextResponse } from "next/server";
import { buildDiscordPayload } from "@/lib/discord";
import { loadHousehold } from "@/lib/household";
import { latestReport, loadSettings } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const settings = loadSettings();
  const url = settings.discordWebhookUrl.trim();
  if (!url) {
    return NextResponse.json(
      { ok: false, error: "Kein Discord-Webhook hinterlegt." },
      { status: 400 },
    );
  }

  const latest = latestReport();
  const payload = latest
    ? buildDiscordPayload(latest)
    : {
        username: "Stromtarif-Agent",
        content: `Testnachricht vom Stromtarif-Agenten für ${loadHousehold().street}, ${loadHousehold().zip} ${loadHousehold().city}. Noch kein Scan vorhanden.`,
      };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json(
      { ok: false, error: `Discord HTTP ${res.status}: ${text.slice(0, 200)}` },
      { status: 502 },
    );
  }
  return NextResponse.json({ ok: true });
}
