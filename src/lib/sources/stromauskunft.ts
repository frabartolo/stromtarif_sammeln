import { fetchText, stripTags } from "@/lib/http";
import { parseDeNumber } from "@/lib/money";
import type { Household } from "@/lib/types";
import type { SourceStatus, TariffOffer } from "@/lib/types";

const URL =
  "https://www.stromauskunft.de/de/stadt/stromanbieter-in-bad-kreuznach.html";

function match(text: string, re: RegExp): string | null {
  const m = text.match(re);
  return m?.[1]?.trim() ?? null;
}

function firstEuro(text: string, re: RegExp): number | null {
  const m = text.match(re);
  if (!m?.[1]) return null;
  const value = parseDeNumber(m[1]);
  return Number.isFinite(value) ? value : null;
}

function isPlausibleYear1(cost: number): boolean {
  return cost >= 700 && cost <= 2500;
}

function scaleFrom3500(opts: {
  id: string;
  provider: string;
  name: string;
  year1At3500: number;
  green: boolean;
  kwh: number;
  assumedBonus: number;
  assumedGpYear: number;
  sourceNote: string;
}): TariffOffer {
  const apCt =
    ((opts.year1At3500 + opts.assumedBonus - opts.assumedGpYear) / 3500) * 100;
  const recurring = (opts.kwh * apCt) / 100 + opts.assumedGpYear;
  const firstYear = Math.max(0, recurring - opts.assumedBonus);
  return {
    id: opts.id,
    provider: opts.provider,
    name: opts.name,
    kind: "fixed",
    green: opts.green,
    workingPriceCt: apCt,
    basePriceYear: opts.assumedGpYear,
    firstYearCost: firstYear,
    recurringYearCost: recurring,
    bonusYear1: opts.assumedBonus,
    priceGuaranteeMonths: 12,
    contractMonths: 12,
    monthlyFee: null,
    source: "StromAuskunft Bad Kreuznach",
    sourceUrl: URL,
    estimated: true,
    notes: [
      `Portalpreis bei 3.500 kWh: ${opts.year1At3500.toLocaleString("de-DE", {
        style: "currency",
        currency: "EUR",
      })} inkl. Bonus.`,
      `Hochrechnung auf ${opts.kwh.toLocaleString("de-DE")} kWh mit angenommenem Grundpreis ${opts.assumedGpYear.toLocaleString("de-DE")} €/a und Bonus ${opts.assumedBonus.toLocaleString("de-DE")} € (Boni skalieren nicht mit dem Verbrauch).`,
      opts.sourceNote,
    ],
  };
}

export async function fetchStromauskunft(household: Household): Promise<{
  offers: TariffOffer[];
  source: SourceStatus;
  cheapestEffectiveCt: number | null;
}> {
  const now = new Date().toISOString();
  const res = await fetchText(URL);
  if (!res.ok) {
    return {
      offers: [],
      cheapestEffectiveCt: null,
      source: {
        id: "stromauskunft",
        label: "StromAuskunft Bad Kreuznach",
        ok: false,
        fetchedAt: now,
        url: URL,
        error: res.error,
      },
    };
  }

  const text = stripTags(res.text);
  let cheapestEffectiveCt: number | null = null;
  const cheapestCtRaw = match(
    text,
    /Günstigster Strompreis für Neukunden in Bad Kreuznach\s+([\d,]+)\s*Cent/i,
  );
  if (cheapestCtRaw) {
    const ct = parseDeNumber(cheapestCtRaw);
    if (ct >= 15 && ct <= 55) cheapestEffectiveCt = ct;
  }

  const candidates = [
    firstEuro(text, /([\d.]+,\d{2})\s*€\s*Günstigster Anbieter/i),
    firstEuro(text, /NEWfair Strom[\s\S]{0,60}?((?:[1-2]\.\d{3}|\d{3,4}),\d{2})\s*€/i),
    cheapestEffectiveCt != null ? (cheapestEffectiveCt * 3500) / 100 : null,
  ].filter((n): n is number => n != null && isPlausibleYear1(n));

  const greenCandidates = [
    firstEuro(text, /ENTEGA Ökostrom[\s\S]{0,80}?((?:[1-2]\.\d{3}|\d{3,4}),\d{2})\s*€/i),
    firstEuro(text, /günstigster Ökostromtarif[\s\S]{0,160}?((?:[1-2]\.\d{3}|\d{3,4}),\d{2})\s*€/i),
  ].filter((n): n is number => n != null && isPlausibleYear1(n));

  const provider =
    match(text, /Günstigster Anbieter \(([^)]+)\)/i) ?? "NEW Energie & Wasser";
  const cheapestName = match(text, /(NEWfair Strom(?:\s+\d+)?)/i) ?? "NEWfair Strom 12";
  const greenName = match(text, /(ENTEGA Ökostrom[^\d]{0,24})/i) ?? "ENTEGA Ökostrom pur 12";

  const offers: TariffOffer[] = [];
  const year1 = candidates[0];
  if (year1 != null) {
    offers.push(
      scaleFrom3500({
        id: "sa-cheapest",
        provider,
        name: cheapestName,
        year1At3500: year1,
        green: false,
        kwh: household.purchasedKwh,
        assumedBonus: 220,
        assumedGpYear: 175,
        sourceNote:
          "StromAuskunft, Stand der Seite. Vor Abschluss Arbeitspreis, Grundpreis und Bonusdeckel im Rechner mit 14.500 kWh gegenprüfen.",
      }),
    );
  }
  if (greenCandidates[0] != null) {
    offers.push(
      scaleFrom3500({
        id: "sa-green",
        provider: "ENTEGA",
        name: greenName.replace(/\s+/g, " ").trim(),
        year1At3500: greenCandidates[0],
        green: true,
        kwh: household.purchasedKwh,
        assumedBonus: 200,
        assumedGpYear: 175,
        sourceNote: "Günstigster Ökostrom laut StromAuskunft für Bad Kreuznach.",
      }),
    );
  }

  return {
    offers,
    cheapestEffectiveCt,
    source: {
      id: "stromauskunft",
      label: "StromAuskunft Bad Kreuznach",
      ok: offers.length > 0,
      fetchedAt: now,
      url: URL,
      note:
        offers.length > 0
          ? "Tagesaktuelle Portalpreise für 3.500 kWh, hochgerechnet auf euren Netzbezug. Jahreskosten unter 700 € bei 3.500 kWh werden als Parserfehler verworfen."
          : "Seite geladen, aber keine plausiblen Jahreskosten erkannt.",
      error: offers.length === 0 ? "Parser hat keine Tarifkosten gefunden." : undefined,
    },
  };
}
