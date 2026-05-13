export const runtime = "nodejs";
export const preferredRegion = "hnd1";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminSession } from "@/lib/admin-auth";
import { sendSlackNotification } from "@/lib/slack";

const ALLOWED_TARGETS = ["published", "approved"] as const;
type Target = (typeof ALLOWED_TARGETS)[number];
function isTarget(v: string): v is Target {
  return (ALLOWED_TARGETS as readonly string[]).includes(v);
}

export async function POST(
  req: Request,
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
    const body = await req.json().catch(() => ({}));
    // `target=published` to publish; `target=approved` to unpublish (back to approved)
    const targetIn = String(body?.target ?? "published").trim();
    if (!isTarget(targetIn)) {
      return NextResponse.json(
        { ok: false, error: "invalid_target" },
        { status: 400 }
      );
    }

    const existing = await prisma.event.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { ok: false, error: "event_not_found" },
        { status: 404 }
      );
    }

    if (targetIn === "published" && existing.status === "draft") {
      return NextResponse.json(
        {
          ok: false,
          error: "not_approved",
          message: "draft の状態では公開できません。先に承認してください",
        },
        { status: 409 }
      );
    }

    const updated = await prisma.event.update({
      where: { id },
      data: { status: targetIn },
    });

    await sendSlackNotification(
      [
        targetIn === "published"
          ? "🌐 [イベント] HP公開"
          : "🌐 [イベント] HP非公開（approved に戻す）",
        `operator: ${admin.email}`,
        `event: ${existing.title}`,
      ].join("\n")
    );

    return NextResponse.json({ ok: true, event: updated });
  } catch (error) {
    console.error("[admin/events/[id]/publish-hp] error:", error);
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
