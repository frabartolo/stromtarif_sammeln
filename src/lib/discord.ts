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

export async function postToDiscord(
  report: ScanReport,
): Promise<ScanReport["discord"]> {
  const settings = loadSettings();
  const url = settings.discordWebhookUrl.trim();
  if (!url) {
    return {
      attempted: false,
      posted: false,
      skippedReason: "Kein Discord-Webhook konfiguriert (Einstellungen oder DISCORD_WEBHOOK_URL).",
    };
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildDiscordPayload(report)),
    });
    if (!res.ok) {
      const body = await res.text();
      const fallback = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "Stromtarif-Agent",
          content: report.recommendation.headline.slice(0, 1800),
        }),
      });
      if (fallback.ok) {
        return { attempted: true, posted: true };
      }
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

export function discordStatusPublic() {
  const settings = loadSettings();
  return {
    configured: Boolean(settings.discordWebhookUrl),
    masked: maskWebhook(settings.discordWebhookUrl),
    weeklyCron: settings.weeklyCron,
    envLocked: Boolean(process.env.DISCORD_WEBHOOK_URL?.trim()),
  };
}
