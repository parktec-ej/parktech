export const runtime = "nodejs";
export const preferredRegion = "hnd1";

import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getAdminSession } from "@/lib/admin-auth";
import { generateSnsText } from "@/lib/claude-sns-text";

const PHASE_LABELS: Record<number, string> = {
  1: "① イベント決定アナウンス",
  2: "② 予約開始日のお知らせ",
  3: "③ 予約開始1週間前の予告",
  4: "④ 予約開始3日前の予告",
  5: "⑤ 予約受付開始アナウンス",
  6: "⑥ 満車・残りわずか通知",
  7: "⑦ キャンセル報告",
};

function jsonError(error: string, status = 400, message?: string) {
  return NextResponse.json(
    { ok: false, error, ...(message ? { message } : {}) },
    { status }
  );
}

/**
 * GET ?eventId=... : 指定イベントの SnsPost 一覧
 */
export async function GET(req: Request) {
  const admin = await getAdminSession();
  if (!admin) return jsonError("unauthorized", 401);

  const url = new URL(req.url);
  const eventId = (url.searchParams.get("eventId") ?? "").trim();

  const where: Prisma.SnsPostWhereInput = {};
  if (eventId) where.eventId = eventId;

  const posts = await prisma.snsPost.findMany({
    where,
    orderBy: [{ phase: "asc" }, { createdAt: "desc" }],
  });
  return NextResponse.json({ ok: true, posts });
}

/**
 * POST
 *  body: { eventId, phase, postText?, scheduledAt?, autoGenerate?: boolean }
 *
 * - autoGenerate=true で postText 空欄なら Claude で本文を生成
 * - scheduledAt 指定でドラフト保持。実投稿は /post-now か Phase 6 を待つ
 */
export async function POST(req: Request) {
  const admin = await getAdminSession();
  if (!admin) return jsonError("unauthorized", 401);

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return jsonError("invalid_json");

    const eventId = String(body.eventId ?? "").trim();
    const phase = Number(body.phase);
    if (!eventId) return jsonError("event_id_required");
    if (!Number.isFinite(phase) || phase < 1 || phase > 7) {
      return jsonError("invalid_phase");
    }
    const phaseLabel =
      typeof body.phaseLabel === "string" && body.phaseLabel
        ? String(body.phaseLabel)
        : PHASE_LABELS[phase] ?? `Phase ${phase}`;

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        title: true,
        venue: true,
        startAt: true,
        bookingStartAt: true,
      },
    });
    if (!event) return jsonError("event_not_found", 404);

    let postText = typeof body.postText === "string" ? body.postText : "";
    const autoGenerate = body.autoGenerate === true;
    if (!postText && autoGenerate) {
      postText = await generateSnsText({
        phase,
        title: event.title,
        startAt: event.startAt,
        venue: event.venue,
        bookingStartAt: event.bookingStartAt,
      });
    }
    if (!postText) return jsonError("post_text_required");

    const scheduledAt = body.scheduledAt
      ? new Date(String(body.scheduledAt))
      : null;
    if (scheduledAt && Number.isNaN(scheduledAt.getTime())) {
      return jsonError("invalid_scheduled_at");
    }

    const platform =
      typeof body.platform === "string" &&
      ["facebook", "instagram"].includes(body.platform)
        ? body.platform
        : "facebook";

    const created = await prisma.snsPost.create({
      data: {
        eventId,
        phase: Math.trunc(phase),
        phaseLabel,
        platform,
        postText,
        scheduledAt,
        triggerType: scheduledAt ? "scheduled" : "scheduled",
        status: "draft",
      },
    });
    return NextResponse.json({ ok: true, post: created });
  } catch (error) {
    console.error("[admin/sns-posts][POST] error:", error);
    return jsonError(
      "server_error",
      500,
      error instanceof Error ? error.message : String(error)
    );
  }
}
