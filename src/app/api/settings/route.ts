import { NextResponse } from "next/server";
import { discordStatusPublic } from "@/lib/discord";
import { saveSettings } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(discordStatusPublic());
}

export async function PUT(request: Request) {
  const body = (await request.json()) as { discordWebhookUrl?: string; weeklyCron?: string };
  if (process.env.DISCORD_WEBHOOK_URL?.trim() && body.discordWebhookUrl) {
    return NextResponse.json(
      { error: "Webhook ist per DISCORD_WEBHOOK_URL festgesetzt und kann nicht aus der UI überschrieben werden." },
      { status: 409 },
    );
  }
  saveSettings({
    discordWebhookUrl: body.discordWebhookUrl?.trim(),
    weeklyCron: body.weeklyCron?.trim(),
  });
  return NextResponse.json({ ...discordStatusPublic(), saved: true, restartHint: body.weeklyCron ? "Cron-Änderung gilt nach Neustart des Containers." : undefined });
}
