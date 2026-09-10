import { dynamicAnnualCost } from "@/lib/grid";
import type { Household, SpotSnapshot, TariffOffer } from "@/lib/types";

const PROVIDERS = [
  {
    id: "dyn-tibber",
    provider: "Tibber",
    name: "Tibber dynamisch",
    green: true,
    markupCt: 2.0,
    monthlyFeeGross: 5.99,
    notes: [
      "Börsenpreis plus ca. 2 ct/kWh Aufschlag, 5,99 €/Monat, monatlich kündbar.",
      "Markups aus öffentlichen Anbietervergleichen 2026, nicht aus einem persönlichen Angebot.",
    ],
    url: "https://tibber.com/de",
  },
  {
    id: "dyn-awattar",
    provider: "aWATTar",
    name: "aWATTar HOURLY",
    green: true,
    markupCt: 3.25,
    monthlyFeeGross: 4.58,
    notes: [
      "Niedrigste Grundgebühr, etwas höherer kWh-Aufschlag (ca. 3–3,5 ct).",
      "Öffentliche API für Börsenpreise, gut für Smart-Home.",
    ],
    url: "https://www.awattar.de/",
  },
  {
    id: "dyn-ostrom",
    provider: "Ostrom",
    name: "Ostrom Simply Dynamic",
    green: true,
    markupCt: 2.5,
    monthlyFeeGross: 6.0,
    notes: ["Ökostrom-zertifiziert, ca. 2–3 ct Aufschlag, 6 €/Monat."],
    url: "https://www.ostrom.de/",
  },
  {
    id: "dyn-rabot",
    provider: "Rabot Charge",
    name: "Rabot Charge dynamisch",
    green: true,
    markupCt: 2.2,
    monthlyFeeGross: 4.99,
    notes: [
      "Verdient 20 % der Ersparnis gegenüber der Grundversorgung. Ohne Smart Meter über Standardlastprofil möglich.",
      "Die Modellrechnung nutzt einen pauschalen Aufschlag; das echte Modell ist anteilsbasiert.",
    ],
    url: "https://www.rabot-charge.de/",
  },
];

export function dynamicOffers(
  household: Household,
  spot: SpotSnapshot | null,
): TariffOffer[] {
  const spotCt = spot?.days90AvgCt;
  if (spotCt == null) return [];

  // PV-Reststrom sitzt oft in teuren Abend-/Winterstunden.
  const residualUplift = household.hasPv && !household.hasBattery ? 0.12 : 0;

  return PROVIDERS.map((p) => {
    const calc = dynamicAnnualCost({
      kwh: household.purchasedKwh,
      spotCt,
      markupCt: p.markupCt,
      monthlyFeeGross: p.monthlyFeeGross,
      spotUplift: residualUplift,
    });
    return {
      id: p.id,
      provider: p.provider,
      name: p.name,
      kind: "dynamic" as const,
      green: p.green,
      workingPriceCt: calc.workingGrossCt,
      basePriceYear: calc.recurringYearCost - (household.purchasedKwh * calc.workingGrossCt) / 100,
      firstYearCost: calc.firstYearCost,
      recurringYearCost: calc.recurringYearCost,
      bonusYear1: 0,
      priceGuaranteeMonths: 0,
      contractMonths: 1,
      monthlyFee: p.monthlyFeeGross,
      source: "Börse 90 Tage + Netzentgelte SWK 2026 + veröffentlichte Aufschläge",
      sourceUrl: p.url,
      estimated: true,
      notes: [
        ...p.notes,
        `Day-Ahead 90-Tage-Mittel ${spotCt.toFixed(2)} ct/kWh, zuzüglich regionaler Netzentgelte, Umlagen, Steuer, MwSt.`,
        residualUplift > 0
          ? "Auf den Börsenpreis ist ein 12 %-Zuschlag für PV-Restlast (Abend/Winter) gerechnet. Mit Speicher oder konsequenter Lastverschiebung fällt er geringer aus."
          : "Ohne PV-Restlast-Zuschlag gerechnet.",
      ],
    };
  });
}
