import fs from "node:fs";
import { dataFile } from "@/lib/paths";
import type { Household } from "@/lib/types";

export const DEFAULT_HOUSEHOLD: Household = {
  name: "Haushalt Wilhelm",
  street: "Ippesheimer Weg 24",
  zip: "55545",
  city: "Bad Kreuznach",
  totalKwh: 22000,
  purchasedKwh: 14500,
  purchasedKwhMin: 14000,
  purchasedKwhMax: 15000,
  preferGreen: false,
  hasPv: true,
  hasBattery: false,
  hasHeatPump: true,
  hasWallbox: true,
  evCount: 2,
  hasSmartMeter: false,
  hasSeparateMeters: null,
  hasSection14a: null,
  currentProvider: "enercity AG",
  currentTariff: "Sondervertrag (endet 31.12.2026)",
  currentWorkingPriceCt: null,
  currentBasePriceYear: null,
  contractEnd: "2026-12-31",
  notes:
    "Gesamtverbrauch ca. 22.000 kWh (Haushalt, Wärmepumpe, Wallbox für zwei E-Autos), davon rund 14.000–15.000 kWh Netzbezug. PV ohne Speicher. Noch kein Smart Meter. Aktueller Lieferant: enercity, Vertrag bis Jahresende 2026.",
};

export function loadHousehold(): Household {
  const file = dataFile("household.json");
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, JSON.stringify(DEFAULT_HOUSEHOLD, null, 2) + "\n");
    return { ...DEFAULT_HOUSEHOLD };
  }
  const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<Household>;
  return { ...DEFAULT_HOUSEHOLD, ...parsed };
}

export function saveHousehold(update: Partial<Household>): Household {
  const next = { ...loadHousehold(), ...update };
  fs.writeFileSync(dataFile("household.json"), JSON.stringify(next, null, 2) + "\n");
  return next;
}

export function currentYearCost(household: Household): number | null {
  if (household.currentWorkingPriceCt == null) return null;
  const base = household.currentBasePriceYear ?? 0;
  return (household.purchasedKwh * household.currentWorkingPriceCt) / 100 + base;
}
