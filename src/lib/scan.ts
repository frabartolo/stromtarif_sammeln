import { randomUUID } from "node:crypto";
import { postToDiscord } from "@/lib/discord";
import { daysUntilContractEnd, switchByHint } from "@/lib/contract";
import { currentYearCost, loadHousehold } from "@/lib/household";
import { effectiveCt, formatEur } from "@/lib/money";
import { fetchSpotPrices } from "@/lib/sources/energy-charts";
import { dynamicOffers } from "@/lib/sources/dynamic";
import { portalLinks } from "@/lib/sources/portals";
import { grundversorgungOffer, localSources, localStadtwerkeOffers } from "@/lib/sources/stadtwerke";
import { fetchStromauskunft } from "@/lib/sources/stromauskunft";
import { saveReport } from "@/lib/store";
import type { Household, ScanReport, TariffOffer } from "@/lib/types";

function missingInfo(household: Household): string[] {
  const items: string[] = [];
  if (household.currentWorkingPriceCt == null) {
    items.push("Arbeitspreis und Grundpreis der letzten enercity-Rechnung");
  }
  if (household.currentTariff && household.currentTariff.includes("Sondervertrag") && household.currentWorkingPriceCt == null) {
    items.push("Exakter enercity-Tarifname (steht auf der Jahresrechnung)");
  }
  if (household.hasSeparateMeters == null) {
    items.push("Ein gemeinsamer Zähler oder getrennte Zähler für Wärmepumpe / Wallbox");
  }
  if (household.hasSection14a == null) {
    items.push("Ob Wärmepumpe und Wallbox schon nach § 14a EnWG beim Netzbetreiber angemeldet sind");
  }
  return items;
}

function isPlausibleOffer(offer: TariffOffer, kwh: number): boolean {
  const ct = effectiveCt(offer.recurringYearCost, kwh);
  return ct >= 22 && ct <= 70;
}

function pickRecommendation(offers: TariffOffer[], household: Household): ScanReport["recommendation"] {
  const gv = offers.find((o) => o.kind === "grundversorgung");
  const current = currentYearCost(household);

  const ranked = [...offers]
    .filter((offer) => isPlausibleOffer(offer, household.purchasedKwh))
    .sort((a, b) => {
      const score = (offer: TariffOffer) => {
        let value = offer.recurringYearCost;
        if (!household.hasSmartMeter && offer.kind === "dynamic") value += 500;
        if (offer.bonusYear1 > offer.recurringYearCost * 0.12) value += 80;
        if (household.preferGreen && !offer.green) value += 40;
        return value;
      };
      return score(a) - score(b);
    });

  const best = ranked[0] ?? null;
  if (!best || !gv) {
    return {
      offerId: best?.id ?? null,
      headline: "Noch kein vollständiger Vergleich möglich",
      body: "Es liegen nicht genug Quellen vor. Bitte den Scan später wiederholen.",
      savingsVsGrundversorgung: null,
      savingsVsCurrent: null,
    };
  }

  const vsGv = gv.recurringYearCost - best.recurringYearCost;
  const vsCurrent = current != null ? current - best.recurringYearCost : null;
  const caveat = best.estimated
    ? " Die Zahl ist eine Modellrechnung – vor dem Wechsel Arbeitspreis, Grundpreis, Bonusdeckel und Preisgarantie im Portal mit 14.500 kWh gegenprüfen."
    : "";

  const daysLeft = daysUntilContractEnd(household);
  const switchBy = switchByHint(household);
  const deadline =
    daysLeft != null && household.currentProvider
      ? ` ${household.currentProvider} endet am ${new Date(`${household.contractEnd}T00:00:00`).toLocaleDateString("de-DE")} (noch ${daysLeft} Tage). Wechsel mit Lieferbeginn 1.1.2027 spätestens um den ${switchBy} anstoßen.`
      : "";

  const loadHint = [
    household.hasHeatPump ? "Wärmepumpe" : null,
    household.hasWallbox ? `Wallbox (${household.evCount} E-Autos)` : null,
    household.hasPv ? "PV ohne Speicher" : null,
  ]
    .filter(Boolean)
    .join(", ");

  const meterHint = household.hasSmartMeter
    ? ""
    : " Ohne Smart Meter lohnt ein dynamischer Tarif kaum – die Abrechnung läuft über ein Standardlastprofil, nicht über euer echtes Nachtladen. Erst Festpreis für 2027, Smart Meter mit der Wärmepumpe nachziehen.";

  return {
    offerId: best.id,
    headline:
      vsGv > 80
        ? `${best.provider} liegt rund ${formatEur(vsGv, 0)} unter der Grundversorgung`
        : `Günstigstes Modell: ${best.provider}`,
    body: `${best.provider} · ${best.name} kommt auf etwa ${formatEur(best.recurringYearCost, 0)} Folgekosten pro Jahr bei ${household.purchasedKwh.toLocaleString("de-DE")} kWh Netzbezug (${loadHint}). Die Grundversorgung der Stadtwerke Bad Kreuznach liegt bei ${formatEur(gv.recurringYearCost, 0)}.${deadline}${caveat}${meterHint}`,
    savingsVsGrundversorgung: vsGv,
    savingsVsCurrent: vsCurrent,
  };
}

export async function runScan(opts?: { notify?: boolean; reason?: string }): Promise<ScanReport> {
  const household = loadHousehold();
  const notify = opts?.notify !== false;

  const [spotRes, portalRes] = await Promise.all([
    fetchSpotPrices(),
    fetchStromauskunft(household),
  ]);

  const offers: TariffOffer[] = [
    grundversorgungOffer(household),
    ...localStadtwerkeOffers(household),
    ...portalRes.offers,
    ...dynamicOffers(household, spotRes.spot),
  ].filter(
    (offer) =>
      offer.kind === "grundversorgung" ||
      isPlausibleOffer(offer, household.purchasedKwh),
  );

  const report: ScanReport = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    household,
    spot: spotRes.spot,
    offers,
    recommendation: pickRecommendation(offers, household),
    missingInfo: missingInfo(household),
    sources: [spotRes.source, portalRes.source, ...localSources()],
    portalLinks: portalLinks(household),
    discord: { attempted: false, posted: false, skippedReason: "noch nicht gesendet" },
  };

  if (notify) {
    report.discord = await postToDiscord(report);
  } else {
    report.discord = {
      attempted: false,
      posted: false,
      skippedReason: opts?.reason ?? "Benachrichtigung deaktiviert",
    };
  }

  saveReport(report);
  return report;
}

export function isImprovement(
  report: ScanReport,
  previous: ScanReport | null,
  threshold = 50,
): boolean {
  if (!previous) return true;
  const prevBest = previous.offers.find((o) => o.id === previous.recommendation.offerId);
  const nextBest = report.offers.find((o) => o.id === report.recommendation.offerId);
  if (!nextBest) return false;
  if (!prevBest) return true;
  if (nextBest.provider !== prevBest.provider || nextBest.name !== prevBest.name) {
    return nextBest.recurringYearCost + 10 < prevBest.recurringYearCost;
  }
  return prevBest.recurringYearCost - nextBest.recurringYearCost >= threshold;
}
