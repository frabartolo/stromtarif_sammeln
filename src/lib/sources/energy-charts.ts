import { fetchJson } from "@/lib/http";
import type { SourceStatus, SpotSnapshot } from "@/lib/types";

type EnergyChartsPrice = {
  unix_seconds?: number[];
  price?: Array<number | null>;
  unit?: string;
};

function stats(values: number[]) {
  if (values.length === 0) return { avg: null, min: null, max: null, n: 0 };
  const sum = values.reduce((a, b) => a + b, 0);
  return {
    avg: sum / values.length,
    min: Math.min(...values),
    max: Math.max(...values),
    n: values.length,
  };
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function fetchSpotPrices(): Promise<{
  spot: SpotSnapshot | null;
  source: SourceStatus;
}> {
  const now = new Date();
  const start90 = new Date(now.getTime() - 90 * 24 * 3600 * 1000);
  const url = `https://api.energy-charts.info/price?bzn=DE-LU&start=${isoDate(start90)}&end=${isoDate(now)}`;

  const res = await fetchJson<EnergyChartsPrice>(url);
  if (!res.ok) {
    return {
      spot: null,
      source: {
        id: "energy-charts",
        label: "Energy-Charts / SMARD Day-Ahead DE-LU",
        ok: false,
        fetchedAt: now.toISOString(),
        url,
        error: res.error,
      },
    };
  }

  const series = (res.data.price ?? []).filter((p): p is number => p != null);
  const seconds = res.data.unix_seconds ?? [];
  const cutoff30 = now.getTime() / 1000 - 30 * 24 * 3600;
  const cutoff1 = now.getTime() / 1000 - 24 * 3600;
  const last30: number[] = [];
  const today: number[] = [];
  series.forEach((price, i) => {
    const t = seconds[i];
    if (t != null && t >= cutoff30) last30.push(price);
    if (t != null && t >= cutoff1) today.push(price);
  });

  const all = stats(series);
  const d30 = stats(last30);
  const d1 = stats(today);

  return {
    spot: {
      unit: res.data.unit ?? "EUR / MWh",
      days90AvgCt: all.avg != null ? all.avg / 10 : null,
      days30AvgCt: d30.avg != null ? d30.avg / 10 : null,
      todayAvgCt: d1.avg != null ? d1.avg / 10 : null,
      minCt: all.min != null ? all.min / 10 : null,
      maxCt: all.max != null ? all.max / 10 : null,
      samples30: d30.n,
      samples90: all.n,
    },
    source: {
      id: "energy-charts",
      label: "Energy-Charts / SMARD Day-Ahead DE-LU",
      ok: true,
      fetchedAt: now.toISOString(),
      url,
      note: "Börsenpreis in ct/kWh (EUR/MWh ÷ 10), ohne Netzentgelte und Steuern.",
    },
  };
}
