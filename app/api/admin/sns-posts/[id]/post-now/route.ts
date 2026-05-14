export const runtime = "nodejs";
export const preferredRegion = "hnd1";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminSession } from "@/lib/admin-auth";
import { postFacebook, postFacebookScheduled } from "@/lib/facebook";
import { sendSlackNotification } from "@/lib/slack";

function jsonError(error: string, status = 400, message?: string) {
  return NextResponse.json(
    { ok: false, error, ...(message ? { message } : {}) },
    { status }
  );
}

/**
 * SnsPost を Facebook に投稿する。
 *
 * - body.mode = "now" (default): 即時投稿
 * - body.mode = "scheduled": SnsPost.scheduledAt を Facebook 側に予約投稿として渡す
 *
 * 投稿後は SnsPost を status="posted" / fbPostId / postedAt に更新。
 */
export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminSession();
  if (!admin) return jsonError("unauthorized", 401);

  try {
    const { id } = await context.params;
    const body = await req.json().catch(() => ({}));
    const mode: "now" | "scheduled" =
      body?.mode === "scheduled" ? "scheduled" : "now";

    const post = await prisma.snsPost.findUnique({
      where: { id },
      include: { event: { select: { id: true, title: true } } },
    });
    if (!post) return jsonError("not_found", 404);
    if (post.status === "posted") {
      return jsonError("already_posted", 409);
    }

    let result;
    if (mode === "scheduled") {
      if (!post.scheduledAt) {
        return jsonError("scheduled_at_required", 400);
      }
      // FB の制約: 10分以上先 〜 6ヶ月以内
      const minTime = Date.now() + 10 * 60 * 1000;
      if (post.scheduledAt.getTime() < minTime) {
        return jsonError(
          "scheduled_at_too_soon",
          400,
          "予約投稿は10分以上先の時刻を指定してください"
        );
      }
      result = await postFacebookScheduled({
        message: post.postText,
        scheduledAt: post.scheduledAt,
      });
    } else {
      result = await postFacebook({ message: post.postText });
    }

    const updated = await prisma.snsPost.update({
      where: { id },
      data: {
        fbPostId: result.fbPostId,
        postedAt: result.scheduled ? null : new Date(),
        status: result.scheduled ? "scheduled" : "posted",
      },
    });

    await sendSlackNotification(
      [
        result.scheduled
          ? "📅 [SNS] Facebook 予約投稿を受付"
          : "📣 [SNS] Facebook に投稿完了",
        `operator: ${admin.email}`,
        `event: ${post.event?.title ?? "(unknown)"}`,
        `phase: ${post.phaseLabel}`,
        `fbPostId: ${result.fbPostId}`,
      ].join("\n")
    );

    return NextResponse.json({ ok: true, post: updated, result });
  } catch (error) {
    console.error("[admin/sns-posts/post-now] error:", error);
    return jsonError(
      "server_error",
      500,
      error instanceof Error ? error.message : String(error)
    );
  }
}
