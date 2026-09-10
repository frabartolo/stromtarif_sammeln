import { NextResponse } from "next/server";
import { buildDiscordPayload, discordConfigured, sendDiscordPayload } from "@/lib/discord";
import { loadHousehold } from "@/lib/household";
import { latestReport } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  if (!discordConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Kein Discord-Ziel. Auf Kiara DISCORD_BOT_TOKEN und DISCORD_ALLOWED_USERS aus /home/kiara/.hermes/.env übernehmen.",
      },
      { status: 400 },
    );
  }

  const household = loadHousehold();
  const latest = latestReport();
  const payload = latest
    ? buildDiscordPayload(latest)
    : {
        content: `Testnachricht vom Stromtarif-Agenten für ${household.street}, ${household.zip} ${household.city}. Noch kein Scan vorhanden.`,
      };

  const result = await sendDiscordPayload(
    payload,
    latest?.recommendation.headline ?? payload.content,
  );
  if (!result.posted) {
    return NextResponse.json(
      { ok: false, error: result.error ?? result.skippedReason ?? "Discord-Test fehlgeschlagen." },
      { status: 502 },
    );
  }
  return NextResponse.json({ ok: true });
}
