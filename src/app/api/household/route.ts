import { NextResponse } from "next/server";
import { loadHousehold, saveHousehold } from "@/lib/household";
import type { Household } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(loadHousehold());
}

export async function PUT(request: Request) {
  const body = (await request.json()) as Partial<Household>;
  const next = saveHousehold(body);
  return NextResponse.json(next);
}
