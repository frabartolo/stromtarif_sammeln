import { SWK_GRID_2026 } from "@/lib/grid";
import type { Household, SourceStatus, TariffOffer } from "@/lib/types";

export function grundversorgungOffer(household: Household): TariffOffer {
  const energy = (household.purchasedKwh * SWK_GRID_2026.gvWorkingGrossCt) / 100;
  const year = energy + SWK_GRID_2026.gvBaseGrossYear;
  return {
    id: "swk-gv",
    provider: SWK_GRID_2026.gvProvider,
    name: SWK_GRID_2026.gvName,
    kind: "grundversorgung",
    green: false,
    workingPriceCt: SWK_GRID_2026.gvWorkingGrossCt,
    basePriceYear: SWK_GRID_2026.gvBaseGrossYear,
    firstYearCost: year,
    recurringYearCost: year,
    bonusYear1: 0,
    priceGuaranteeMonths: null,
    contractMonths: null,
    monthlyFee: null,
    source: "Preisblatt Grundversorgung ab 01.01.2026",
    sourceUrl:
      "https://www.kreuznacherstadtwerke.de/fileadmin/user_upload/_Energie-fuer-Ihr-Zuhause/Netz/2026-01-01_Preisblatt__Strom_Grundversorgung_BF.pdf",
    estimated: false,
    notes: [
      "Gesetzliche Grundversorgung, 2 Wochen Kündigungsfrist.",
      "Arbeitspreis 34,53 ct/kWh brutto, Grundpreis 183,64 €/Jahr brutto.",
    ],
  };
}

export function localStadtwerkeOffers(household: Household): TariffOffer[] {
  const ap = 32.3;
  const gp = 15.25 * 12;
  const year = (household.purchasedKwh * ap) / 100 + gp;
  return [
    {
      id: "swk-nahestrom-fix27",
      provider: "Stadtwerke GmbH Bad Kreuznach",
      name: "NaheSTROM natur fix 27",
      kind: "local",
      green: true,
      workingPriceCt: ap,
      basePriceYear: gp,
      firstYearCost: year,
      recurringYearCost: year,
      bonusYear1: 0,
      priceGuaranteeMonths: 12,
      contractMonths: 12,
      monthlyFee: 15.25,
      source: "Drittanbieter-Preisblatt (Stromvermittlung), bitte im Stadtwerke-Rechner prüfen",
      sourceUrl: "https://www.kreuznacherstadtwerke.de/energie-fuer-ihr-zuhause/nahestrom-natur",
      estimated: true,
      notes: [
        "Lokales Ökostrom-Angebot der Stadtwerke, ohne Wechsel weg vom örtlichen Versorger.",
        "Arbeitspreis/Grundpreis stammen aus einem veröffentlichten Preisvergleich, nicht aus einem Live-Rechner. Vor Abschluss auf der Stadtwerke-Seite gegenprüfen.",
      ],
    },
  ];
}

export function localSources(): SourceStatus[] {
  const now = new Date().toISOString();
  return [
    {
      id: "swk-preisblatt",
      label: "Stadtwerke Bad Kreuznach Preisblatt Grundversorgung",
      ok: true,
      fetchedAt: now,
      url: "https://www.kreuznacherstadtwerke.de/fileadmin/user_upload/_Energie-fuer-Ihr-Zuhause/Netz/2026-01-01_Preisblatt__Strom_Grundversorgung_BF.pdf",
      note: "Offizielle Bruttopreise ab 01.01.2026.",
    },
  ];
}
