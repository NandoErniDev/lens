import { NextResponse } from "next/server";
import { getReportStore } from "@/lib/store/reports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") ?? 20)));

  try {
    const store = getReportStore();
    const reports = await store.list(limit);
    return NextResponse.json(
      { reports, durable: store.durable, store: store.kind },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ reports: [], durable: false, store: "unavailable" }, { status: 200 });
  }
}
