import { fetchText, stripTags } from "@/lib/http";
import { parseDeNumber } from "@/lib/money";
import { providerListingHref, signupForProvider } from "@/lib/sources/signup";
import type { Household, SourceStatus, TariffOffer } from "@/lib/types";

const URL =
  "https://www.stromauskunft.de/de/stadt/stromanbieter-in-bad-kreuznach.html";

function match(text: string, re: RegExp): string | null {
  const m = text.match(re);
  return m?.[1]?.trim() ?? null;
}

function euro(text: string, re: RegExp): number | null {
  const raw = match(text, re);
  if (!raw) return null;
  try {
    const value = parseDeNumber(raw);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

function inferProvider(name: string, chunk: string): string {
  const n = name.toLowerCase();
  if (n.includes("eprimo")) return "eprimo";
  if (/\be\.?\s*on\b/i.test(name)) return "E.ON";
  if (/entega/i.test(name)) return "ENTEGA";
  const brands = [
    "LichtBlick",
    "ENTEGA",
    "eprimo",
    "E.ON",
    "NEW Energie",
    "lekker",
    "Vattenfall",
    "EnBW",
    "Naturstrom",
    "Grünwelt",
    "E WIE EINFACH",
    "YWIE EINFACH",
  ];
  for (const brand of brands) {
    if (new RegExp(brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(chunk)) {
      return brand;
    }
  }
  return name.replace(/\s+\d+$/, "").trim() || "Anbieter";
}

function offerFromPrices(opts: {
  id: string;
  provider: string;
  name: string;
  green: boolean;
  kwh: number;
  workingPriceCt: number;
  monthlyFee: number;
  bonusFixed: number;
  bonusPercent: number | null;
  guaranteeMonths: number | null;
  contractMonths: number | null;
  sourceNote: string;
  estimated: boolean;
  listingUrl?: string;
  household: Household;
}): TariffOffer {
  const basePriceYear = opts.monthlyFee * 12;
  const recurring = (opts.kwh * opts.workingPriceCt) / 100 + basePriceYear;
  const percentBonus = opts.bonusPercent != null ? recurring * (opts.bonusPercent / 100) : 0;
  const bonusYear1 = percentBonus + opts.bonusFixed;
  const firstYear = Math.max(0, recurring - bonusYear1);
  const links = signupForProvider(opts.provider, opts.household, opts.listingUrl);
  return {
    id: opts.id,
    provider: opts.provider,
    name: opts.name,
    kind: "fixed",
    green: opts.green,
    workingPriceCt: opts.workingPriceCt,
    basePriceYear,
    firstYearCost: firstYear,
    recurringYearCost: recurring,
    bonusYear1,
    priceGuaranteeMonths: opts.guaranteeMonths,
    contractMonths: opts.contractMonths,
    monthlyFee: opts.monthlyFee,
    source: "StromAuskunft Bad Kreuznach",
    sourceUrl: links.sourceUrl,
    signupUrl: links.signupUrl,
    signupLabel: links.signupLabel,
    estimated: opts.estimated,
    notes: [
      `Arbeitspreis ${opts.workingPriceCt.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ct/kWh, Grundpreis ${opts.monthlyFee.toLocaleString("de-DE", { minimumFractionDigits: 2 })} €/Monat.`,
      opts.bonusPercent != null
        ? `Neukundenbonus ${opts.bonusPercent} % vom Jahresbetrag plus ${opts.bonusFixed.toLocaleString("de-DE", { style: "currency", currency: "EUR" })} Sofortbonus – Deckel in den AGB prüfen, Portale rechnen oft bei 3.500 kWh.`
        : `Bonus im Portal ${opts.bonusFixed.toLocaleString("de-DE", { style: "currency", currency: "EUR" })} (Neukunden + Sofort). Bei 14.500 kWh oft gedeckelt, nicht linear höher.`,
      opts.sourceNote,
    ],
  };
}

function parseListedTariffs(html: string, household: Household): TariffOffer[] {
  const offers: TariffOffer[] = [];
  const kwh = household.purchasedKwh;
  const re = /Tarif:\s*([^<]{3,80})/gi;
  let matchTariff: RegExpExecArray | null;
  while ((matchTariff = re.exec(html))) {
    const name = matchTariff[1].replace(/\s+/g, " ").trim();
    const next = html.indexOf("Tarif:", matchTariff.index + 6);
    const chunk = html.slice(matchTariff.index, next === -1 ? matchTariff.index + 12000 : next);
    const text = stripTags(chunk);
    const workingPriceCt = euro(text, /([\d,]+)\s*Ct\/kWh\s*Arbeitspreis/i);
    const monthlyFee = euro(text, /([\d,]+)\s*€\/Monat\s*Grundpreis/i);
    if (workingPriceCt == null || monthlyFee == null) continue;
    if (workingPriceCt < 18 || workingPriceCt > 55) continue;

    const bonusPercentRaw = match(text, /inkl\.\s*([\d,]+)\s*%\s*Neukundenbonus/i);
    const bonusPercent = bonusPercentRaw ? parseDeNumber(bonusPercentRaw) : null;
    const neukundenEuro = bonusPercent == null ? euro(text, /([\d.]+,\d{2})\s*€\s*Neukundenbonus/i) ?? 0 : 0;
    const sofortEuro = euro(text, /([\d.]+,\d{2})\s*€\s*Sofortbonus/i) ?? 0;
    const guaranteeMonths = euro(text, /Preisgarantie:\s*(\d+)\s*Monate/i);
    const contractMonths = euro(text, /Erstlaufzeit:\s*(\d+)\s*Monate/i);
    const green = /öko|klima|grün/i.test(name) || /Ökostrom|100%\s*Ökostrom/i.test(text);
    const provider = inferProvider(name, chunk + " " + text);

    offers.push(
      offerFromPrices({
        id: `sa-${slug(provider)}-${slug(name)}`,
        provider,
        name,
        green,
        kwh,
        workingPriceCt,
        monthlyFee,
        bonusFixed: neukundenEuro + sofortEuro,
        bonusPercent: bonusPercent != null && bonusPercent > 0 && bonusPercent <= 40 ? bonusPercent : null,
        guaranteeMonths,
        contractMonths,
        sourceNote:
          "Aus der StromAuskunft-Wechseltabelle. Der Button „Tarif öffnen“ führt zum Anbieter; Abschluss mit 14.500 kWh und Bonusdeckel dort oder über Verivox/Check24 gegenprüfen.",
        estimated: bonusPercent != null,
        listingUrl: providerListingHref(chunk),
        household,
      }),
    );
  }
  return offers;
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
  household: Household;
}): TariffOffer {
  const apCt =
    ((opts.year1At3500 + opts.assumedBonus - opts.assumedGpYear) / 3500) * 100;
  const recurring = (opts.kwh * apCt) / 100 + opts.assumedGpYear;
  const firstYear = Math.max(0, recurring - opts.assumedBonus);
  const links = signupForProvider(opts.provider, opts.household);
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
    source: "StromAuskunft Bad Kreuznach (Übersicht 3.500 kWh)",
    sourceUrl: links.sourceUrl,
    signupUrl: links.signupUrl,
    signupLabel: links.signupLabel,
    estimated: true,
    notes: [
      `Portalpreis bei 3.500 kWh: ${opts.year1At3500.toLocaleString("de-DE", {
        style: "currency",
        currency: "EUR",
      })} inkl. Bonus.`,
      `Hochrechnung auf ${opts.kwh.toLocaleString("de-DE")} kWh. Boni skalieren nicht 1:1 mit dem Verbrauch.`,
      opts.sourceNote,
    ],
  };
}

function alreadyListed(offers: TariffOffer[], provider: string, name: string): boolean {
  const p = provider.toLowerCase();
  const n = name.toLowerCase();
  return offers.some(
    (o) =>
      o.provider.toLowerCase().includes(p.slice(0, 8)) ||
      n.includes(o.name.toLowerCase().slice(0, 10)) ||
      o.name.toLowerCase().includes(n.slice(0, 10)),
  );
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

  const listed = parseListedTariffs(res.text, household);
  const text = stripTags(res.text);
  const cheapestCtRaw = match(
    text,
    /Günstigster Strompreis für Neukunden in Bad Kreuznach\s+([\d,]+)\s*Cent/i,
  );
  let cheapestEffectiveCt: number | null = null;
  if (cheapestCtRaw) {
    const ct = parseDeNumber(cheapestCtRaw);
    if (ct >= 15 && ct <= 55) cheapestEffectiveCt = ct;
  }

  const overviewCheapest = euro(text, /([\d.]+,\d{2})\s*€\s*Günstigster Anbieter/i);
  const overviewProvider =
    match(text, /Günstigster Anbieter \(([^)]+)\)/i) ?? "NEW Energie & Wasser";
  const overviewName = match(text, /(NEWfair Strom(?:\s+\d+)?)/i) ?? "NEWfair Strom 12";
  if (
    overviewCheapest != null &&
    overviewCheapest >= 700 &&
    overviewCheapest <= 2500 &&
    !alreadyListed(listed, overviewProvider, overviewName)
  ) {
    listed.push(
      scaleFrom3500({
        id: "sa-overview-cheapest",
        provider: overviewProvider,
        name: overviewName,
        year1At3500: overviewCheapest,
        green: false,
        kwh: household.purchasedKwh,
        assumedBonus: 220,
        assumedGpYear: 175,
        sourceNote: "Nur in der 3.500-kWh-Übersicht, nicht in der Wechseltabelle. Stärker geschätzt.",
        household,
      }),
    );
  }

  return {
    offers: listed,
    cheapestEffectiveCt,
    source: {
      id: "stromauskunft",
      label: "StromAuskunft Bad Kreuznach",
      ok: listed.length > 0,
      fetchedAt: now,
      url: URL,
      note:
        listed.length > 0
          ? `${listed.length} Tarif(e) aus der öffentlichen Wechseltabelle bzw. Übersicht. Verivox/Check24 listen oft deutlich mehr, blocken aber Bots.`
          : "Seite geladen, aber keine Tarifkarten mit Arbeits- und Grundpreis erkannt.",
      error: listed.length === 0 ? "Parser hat keine Tarifkosten gefunden." : undefined,
    },
  };
}
