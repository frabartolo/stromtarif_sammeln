/** Preisbestandteile Stadtwerke Bad Kreuznach, Preisblatt Grundversorgung ab 01.01.2026. */
export const SWK_GRID_2026 = {
  netApNettoCt: 6.804,
  netGpNettoYear: 91.79,
  meterNettoYear: 20.66,
  taxCt: 2.05,
  stromnevCt: 1.559,
  kwkgCt: 0.446,
  offshoreCt: 0.941,
  concessionCt: 1.59,
  vat: 1.19,
  gvWorkingGrossCt: 34.53,
  gvBaseGrossYear: 183.64,
  gvName: "Grundversorgung (§ 36 EnWG)",
  gvProvider: "Stadtwerke GmbH Bad Kreuznach",
  netOperator: "Stadtwerke GmbH Bad Kreuznach",
};

export function nonEnergyApNettoCt(): number {
  const g = SWK_GRID_2026;
  return (
    g.netApNettoCt +
    g.taxCt +
    g.stromnevCt +
    g.kwkgCt +
    g.offshoreCt +
    g.concessionCt
  );
}

export function gridBaseGrossYear(): number {
  const g = SWK_GRID_2026;
  return (g.netGpNettoYear + g.meterNettoYear) * g.vat;
}

export function dynamicAnnualCost(opts: {
  kwh: number;
  spotCt: number;
  markupCt: number;
  monthlyFeeGross: number;
  spotUplift: number;
}): { workingGrossCt: number; firstYearCost: number; recurringYearCost: number } {
  const energyCt = opts.spotCt * (1 + opts.spotUplift) + opts.markupCt;
  const workingNettoCt = energyCt + nonEnergyApNettoCt();
  const workingGrossCt = workingNettoCt * SWK_GRID_2026.vat;
  const base = gridBaseGrossYear() + opts.monthlyFeeGross * 12;
  const energyCost = (opts.kwh * workingGrossCt) / 100;
  const year = energyCost + base;
  return {
    workingGrossCt,
    firstYearCost: year,
    recurringYearCost: year,
  };
}
