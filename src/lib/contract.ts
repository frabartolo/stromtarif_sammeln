import type { Household } from "@/lib/types";

export function daysUntilContractEnd(household: Household, from = new Date()): number | null {
  if (!household.contractEnd) return null;
  const end = new Date(`${household.contractEnd}T23:59:59+01:00`);
  return Math.ceil((end.getTime() - from.getTime()) / 86_400_000);
}

export function switchByHint(household: Household): string | null {
  if (!household.contractEnd) return null;
  const end = new Date(`${household.contractEnd}T00:00:00+01:00`);
  const switchBy = new Date(end);
  switchBy.setDate(switchBy.getDate() - 45);
  return switchBy.toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" });
}
