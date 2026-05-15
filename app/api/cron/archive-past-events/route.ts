export const runtime = "nodejs";
export const preferredRegion = "hnd1";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

function isAuthorized(req: Request): boolean {
  const header = req.headers.get("authorization") ?? "";
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return header === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 }
    );
  }

  const now = new Date();
  const result = await prisma.event.updateMany({
    where: {
      startAt: { lt: now },
      status: { in: ["draft", "approved", "published"] },
    },
    data: { status: "archived" },
  });

  console.log(`[archive-past-events] archived ${result.count} events`);
  return NextResponse.json({ ok: true, archivedCount: result.count });
}
