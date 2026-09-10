import { SWK_GRID_2026 } from "@/lib/grid";
import type { Household } from "@/lib/types";

export function portalLinks(household: Household) {
  const kwh = household.purchasedKwh;
  const plz = household.zip;
  return [
    {
      label: "Verivox Stromvergleich",
      url: `https://www.verivox.de/stromvergleich/?plz=${encodeURIComponent(plz)}&kwh=${kwh}`,
    },
    {
      label: "Check24 Stromvergleich",
      url: "https://www.check24.de/strom/",
    },
    {
      label: "StromAuskunft Bad Kreuznach",
      url: "https://www.stromauskunft.de/de/stadt/stromanbieter-in-bad-kreuznach.html",
    },
    {
      label: "Stadtwerke NaheSTROM Rechner",
      url: "https://www.kreuznacherstadtwerke.de/energie-fuer-ihr-zuhause/nahestrom-natur",
    },
    {
      label: "Check24 Wärmepumpe / Heizstrom",
      url: "https://www.check24.de/strom/waermepumpe/",
    },
    {
      label: "enercity Kundenportal / Rechnung",
      url: "https://www.enercity.de/privatkunden/kundenservice",
    },
    {
      label: `${SWK_GRID_2026.netOperator} Netz`,
      url: "https://www.kreuznacherstadtwerke.de/energie-fuer-ihr-zuhause/netz",
    },
  ];
}
