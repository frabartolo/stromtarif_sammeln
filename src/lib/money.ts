export function parseDeNumber(value: string): number {
  const cleaned = value
    .trim()
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const n = Number(cleaned);
  if (!Number.isFinite(n)) {
    throw new Error(`Keine Zahl: ${value}`);
  }
  return n;
}

export function formatEur(value: number, digits = 0): string {
  return value.toLocaleString("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function formatCt(value: number, digits = 2): string {
  return `${value.toLocaleString("de-DE", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })} ct/kWh`;
}

export function formatKwh(value: number): string {
  return `${value.toLocaleString("de-DE")} kWh`;
}

export function roundEuro(value: number): number {
  return Math.round(value * 100) / 100;
}

export function effectiveCt(yearCost: number, kwh: number): number {
  if (kwh <= 0) return 0;
  return (yearCost / kwh) * 100;
}
