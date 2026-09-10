export type TariffKind = "fixed" | "dynamic" | "grundversorgung" | "local" | "current";

export type SourceStatus = {
  id: string;
  label: string;
  ok: boolean;
  fetchedAt: string;
  url?: string;
  error?: string;
  note?: string;
};

export type TariffOffer = {
  id: string;
  provider: string;
  name: string;
  kind: TariffKind;
  green: boolean;
  workingPriceCt: number | null;
  basePriceYear: number | null;
  firstYearCost: number;
  recurringYearCost: number;
  bonusYear1: number;
  priceGuaranteeMonths: number | null;
  contractMonths: number | null;
  monthlyFee: number | null;
  source: string;
  sourceUrl?: string;
  signupUrl?: string;
  signupLabel?: string;
  notes: string[];
  estimated: boolean;
};

export type SpotSnapshot = {
  unit: string;
  days30AvgCt: number | null;
  days90AvgCt: number | null;
  todayAvgCt: number | null;
  minCt: number | null;
  maxCt: number | null;
  samples30: number;
  samples90: number;
};

export type Household = {
  name: string;
  street: string;
  zip: string;
  city: string;
  totalKwh: number;
  purchasedKwh: number;
  purchasedKwhMin: number;
  purchasedKwhMax: number;
  preferGreen: boolean;
  hasPv: boolean;
  hasBattery: boolean;
  hasHeatPump: boolean | null;
  hasWallbox: boolean | null;
  evCount: number;
  hasSmartMeter: boolean | null;
  hasSeparateMeters: boolean | null;
  hasSection14a: boolean | null;
  currentProvider: string | null;
  currentTariff: string | null;
  currentWorkingPriceCt: number | null;
  currentBasePriceYear: number | null;
  contractEnd: string | null;
  notes: string;
};

export type ScanReport = {
  id: string;
  createdAt: string;
  household: Household;
  spot: SpotSnapshot | null;
  offers: TariffOffer[];
  recommendation: {
    offerId: string | null;
    headline: string;
    body: string;
    savingsVsGrundversorgung: number | null;
    savingsVsCurrent: number | null;
  };
  missingInfo: string[];
  sources: SourceStatus[];
  portalLinks: { label: string; url: string }[];
  discord: {
    attempted: boolean;
    posted: boolean;
    skippedReason?: string;
    error?: string;
  };
};

export type AppSettings = {
  discordWebhookUrl: string;
  weeklyCron: string;
  postOnImprovementEuro: number;
};
