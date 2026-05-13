export const runtime = "nodejs";
export const preferredRegion = "hnd1";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminSession } from "@/lib/admin-auth";
import { sendSlackNotification } from "@/lib/slack";

export async function POST(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 }
    );
  }

  try {
    const { id } = await context.params;
    const existing = await prisma.event.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { ok: false, error: "event_not_found" },
        { status: 404 }
      );
    }
    if (existing.status === "published") {
      return NextResponse.json(
        { ok: false, error: "already_published" },
        { status: 409 }
      );
    }

    const updated = await prisma.event.update({
      where: { id },
      data: { status: "approved" },
    });

    await sendSlackNotification(
      [
        "🎫 [イベント] 承認",
        `operator: ${admin.email}`,
        `event: ${existing.title}`,
        `startAt: ${existing.startAt.toISOString()}`,
      ].join("\n")
    );

    return NextResponse.json({ ok: true, event: updated });
  } catch (error) {
    console.error("[admin/events/[id]/approve] error:", error);
    return NextResponse.json(
      {
        ok: false,
        error: "server_error",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
