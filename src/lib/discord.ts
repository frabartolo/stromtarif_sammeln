import { daysUntilContractEnd, switchByHint } from "@/lib/contract";
import { formatCt, formatEur, formatKwh } from "@/lib/money";
import { loadSettings, maskWebhook } from "@/lib/store";
import type { ScanReport, TariffOffer } from "@/lib/types";

function offerLine(offer: TariffOffer): string {
  const saveNote = offer.bonusYear1 > 0 ? ` · Jahr 1 ${formatEur(offer.firstYearCost, 0)}` : "";
  return `**${offer.provider}** – ${offer.name}: ${formatEur(offer.recurringYearCost, 0)}/a${saveNote}`;
}

export function buildDiscordPayload(report: ScanReport) {
  const rec = report.offers.find((o) => o.id === report.recommendation.offerId);
  const gv = report.offers.find((o) => o.kind === "grundversorgung");
  const top = [...report.offers]
    .sort((a, b) => a.recurringYearCost - b.recurringYearCost)
    .slice(0, 4);

  const color = report.recommendation.savingsVsGrundversorgung != null &&
    report.recommendation.savingsVsGrundversorgung > 0
    ? 0x3dd68c
    : 0xe8b86d;

  const fields = [
    {
      name: "Haushalt",
      value: `${report.household.street}, ${report.household.zip} ${report.household.city}\nNetzbezug ${formatKwh(report.household.purchasedKwh)} von ${formatKwh(report.household.totalKwh)}`,
      inline: false,
    },
    {
      name: "Empfehlung",
      value: rec
        ? `${rec.provider} · ${rec.name}\n${formatEur(rec.recurringYearCost, 0)} / Jahr (${formatCt(rec.workingPriceCt ?? 0)})`
        : report.recommendation.headline,
      inline: false,
    },
  ];

  if (gv) {
    fields.push({
      name: "Gegen Grundversorgung",
      value: `${formatEur(gv.recurringYearCost, 0)} / Jahr${
        report.recommendation.savingsVsGrundversorgung != null
          ? `\nΔ ${formatEur(report.recommendation.savingsVsGrundversorgung, 0)}`
          : ""
      }`,
      inline: true,
    });
  }

  if (report.household.currentProvider) {
    const days = daysUntilContractEnd(report.household);
    const switchBy = switchByHint(report.household);
    fields.push({
      name: "Aktueller Vertrag",
      value: `${report.household.currentProvider}${report.household.currentTariff ? ` · ${report.household.currentTariff}` : ""}${
        report.household.contractEnd
          ? `\nEnde ${new Date(`${report.household.contractEnd}T00:00:00`).toLocaleDateString("de-DE")}${days != null ? ` · noch ${days} Tage` : ""}`
          : ""
      }${switchBy ? `\nWechsel anstoßen bis ca. ${switchBy}` : ""}`,
      inline: false,
    });
  }

  if (report.recommendation.savingsVsCurrent != null) {
    fields.push({
      name: "Gegen enercity (letzte Rechnung)",
      value: formatEur(report.recommendation.savingsVsCurrent, 0),
      inline: true,
    });
  }

  if (report.spot?.days90AvgCt != null) {
    fields.push({
      name: "Börse 90 Tage",
      value: formatCt(report.spot.days90AvgCt),
      inline: true,
    });
  }

  fields.push({
    name: "Top-Tarife (Folgekosten ohne Bonus)",
    value: top.map(offerLine).join("\n").slice(0, 1024),
    inline: false,
  });

  if (report.missingInfo.length) {
    fields.push({
      name: "Noch offen",
      value: report.missingInfo.slice(0, 6).map((m) => `• ${m}`).join("\n").slice(0, 1024),
      inline: false,
    });
  }

  const failed = report.sources.filter((s) => !s.ok);
  if (failed.length) {
    fields.push({
      name: "Quellen mit Fehler",
      value: failed.map((s) => `• ${s.label}: ${s.error ?? "unbekannt"}`).join("\n").slice(0, 1024),
      inline: false,
    });
  }

  const links = report.portalLinks
    .slice(0, 4)
    .map((l) => `[${l.label}](${l.url})`)
    .join(" · ");
  if (links) {
    fields.push({ name: "Vergleichsportale", value: links, inline: false });
  }

  return {
    username: "Stromtarif-Agent",
    content: report.recommendation.headline.slice(0, 1800),
    embeds: [
      {
        title: `Stromtarif-Check · ${new Date(report.createdAt).toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" })}`,
        description: report.recommendation.body.slice(0, 400),
        color,
        fields,
        footer: {
          text: "Hermes / Kiara · private Suche, keine Abschlussempfehlung ohne Gegenprüfung",
        },
        timestamp: report.createdAt,
      },
    ],
  };
}

const DISCORD_API = "https://discord.com/api/v10";

export type DiscordRuntime = {
  botToken: string;
  allowedUsers: string[];
  homeChannel: string;
  webhookUrl: string;
};

export type DiscordPayload = ReturnType<typeof buildDiscordPayload> | {
  username?: string;
  content: string;
  embeds?: unknown[];
};

export function parseIdList(value: string | undefined | null): string[] {
  if (!value) return [];
  return [...new Set(value.split(/[,\s;]+/).map((part) => part.trim()).filter((part) => /^\d{5,}$/.test(part)))];
}

export function discordRuntime(): DiscordRuntime {
  const settings = loadSettings();
  return {
    botToken: process.env.DISCORD_BOT_TOKEN?.trim() ?? "",
    allowedUsers: parseIdList(process.env.DISCORD_ALLOWED_USERS),
    homeChannel: (process.env.DISCORD_HOME_CHANNEL ?? process.env.DISCORD_CHANNEL_ID ?? "").trim(),
    webhookUrl: (process.env.DISCORD_WEBHOOK_URL?.trim() || settings.discordWebhookUrl).trim(),
  };
}

export function discordConfigured(rt = discordRuntime()): boolean {
  if (rt.botToken && (rt.homeChannel || rt.allowedUsers.length)) return true;
  return Boolean(rt.webhookUrl);
}

function botAuthHeaders(token: string) {
  return {
    Authorization: `Bot ${token}`,
    "Content-Type": "application/json",
  };
}

function botMessageBody(payload: DiscordPayload) {
  return {
    content: payload.content,
    embeds: "embeds" in payload ? payload.embeds : undefined,
    allowed_mentions: { parse: [] as string[] },
  };
}

async function discordApi(token: string, path: string, body: unknown) {
  const res = await fetch(`${DISCORD_API}${path}`, {
    method: "POST",
    headers: botAuthHeaders(token),
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, text };
}

async function postViaBot(
  rt: DiscordRuntime,
  payload: DiscordPayload,
): Promise<ScanReport["discord"]> {
  const errors: string[] = [];
  let posted = false;
  const body = botMessageBody(payload);

  if (rt.homeChannel) {
    const res = await discordApi(rt.botToken, `/channels/${rt.homeChannel}/messages`, body);
    if (res.ok) posted = true;
    else errors.push(`Home-Kanal HTTP ${res.status}: ${res.text.slice(0, 160)}`);
  } else {
    for (const userId of rt.allowedUsers) {
      const dm = await discordApi(rt.botToken, "/users/@me/channels", { recipient_id: userId });
      if (!dm.ok) {
        errors.push(
          `DM ${userId.slice(-4)} HTTP ${dm.status}: ${dm.text.slice(0, 120)}` +
            (dm.status === 403 ? " (gemeinsamer Server nötig oder DISCORD_HOME_CHANNEL setzen)" : ""),
        );
        continue;
      }
      let channelId = "";
      try {
        channelId = (JSON.parse(dm.text) as { id?: string }).id ?? "";
      } catch {
        channelId = "";
      }
      if (!channelId) {
        errors.push(`DM ${userId.slice(-4)}: keine Kanal-ID`);
        continue;
      }
      const msg = await discordApi(rt.botToken, `/channels/${channelId}/messages`, body);
      if (msg.ok) posted = true;
      else errors.push(`Nachricht ${userId.slice(-4)} HTTP ${msg.status}: ${msg.text.slice(0, 120)}`);
    }
  }

  if (posted) return { attempted: true, posted: true };
  return {
    attempted: true,
    posted: false,
    error: errors.join(" · ") || "Discord-Bot konnte nicht senden.",
  };
}

async function postViaWebhook(
  url: string,
  payload: DiscordPayload,
  fallbackContent: string,
): Promise<ScanReport["discord"]> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.text();
      const fallback = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "Stromtarif-Agent",
          content: fallbackContent.slice(0, 1800),
        }),
      });
      if (fallback.ok) return { attempted: true, posted: true };
      return {
        attempted: true,
        posted: false,
        error: `Discord HTTP ${res.status}: ${body.slice(0, 180)}`,
      };
    }
    return { attempted: true, posted: true };
  } catch (error) {
    return {
      attempted: true,
      posted: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function sendDiscordPayload(
  payload: DiscordPayload,
  fallbackContent: string,
): Promise<ScanReport["discord"]> {
  const rt = discordRuntime();
  if (!discordConfigured(rt)) {
    return {
      attempted: false,
      posted: false,
      skippedReason:
        "Kein Discord-Ziel. Auf Kiara DISCORD_BOT_TOKEN und DISCORD_ALLOWED_USERS aus /home/kiara/.hermes/.env, optional DISCORD_HOME_CHANNEL.",
    };
  }

  if (rt.botToken && (rt.homeChannel || rt.allowedUsers.length)) {
    try {
      const botResult = await postViaBot(rt, payload);
      if (botResult.posted) return botResult;
      if (rt.webhookUrl) {
        const hook = await postViaWebhook(rt.webhookUrl, payload, fallbackContent);
        if (hook.posted) return hook;
      }
      return botResult;
    } catch (error) {
      if (rt.webhookUrl) {
        return postViaWebhook(rt.webhookUrl, payload, fallbackContent);
      }
      return {
        attempted: true,
        posted: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  return postViaWebhook(rt.webhookUrl, payload, fallbackContent);
}

export async function postToDiscord(
  report: ScanReport,
): Promise<ScanReport["discord"]> {
  return sendDiscordPayload(buildDiscordPayload(report), report.recommendation.headline);
}

export function discordStatusPublic() {
  const settings = loadSettings();
  const rt = discordRuntime();
  const botReady = Boolean(rt.botToken && (rt.homeChannel || rt.allowedUsers.length));
  let mode: "bot" | "webhook" | "none" = "none";
  if (botReady) mode = "bot";
  else if (rt.webhookUrl) mode = "webhook";

  let masked = "";
  if (mode === "bot") {
    masked = rt.homeChannel
      ? `Hermes-Bot · Kanal …${rt.homeChannel.slice(-6)}`
      : `Hermes-Bot · DM an ${rt.allowedUsers.length} Nutzer`;
  } else if (mode === "webhook") {
    masked = maskWebhook(rt.webhookUrl);
  }

  return {
    configured: discordConfigured(rt),
    mode,
    masked,
    target: masked,
    allowedUserCount: rt.allowedUsers.length,
    weeklyCron: settings.weeklyCron,
    envLocked: Boolean(process.env.DISCORD_BOT_TOKEN?.trim() || process.env.DISCORD_WEBHOOK_URL?.trim()),
  };
}
