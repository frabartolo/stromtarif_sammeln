import { NextResponse } from "next/server";
import { runScan } from "@/lib/scan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { notify?: boolean };
  const report = await runScan({ notify: body.notify !== false, reason: "manueller Scan" });
  return NextResponse.json(report);
}
