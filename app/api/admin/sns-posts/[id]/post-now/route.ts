export const runtime = "nodejs";
export const preferredRegion = "hnd1";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminSession } from "@/lib/admin-auth";
import { postFacebook, postFacebookScheduled } from "@/lib/facebook";
import { postInstagram } from "@/lib/instagram";
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

    // Instagram 投稿（画像必須、scheduled 非対応）
    if (post.platform === "instagram") {
      if (mode === "scheduled") {
        return jsonError(
          "ig_scheduled_unsupported",
          400,
          "Instagram は予約投稿に対応していません（即時投稿のみ）"
        );
      }
      const imageUrl =
        typeof body?.imageUrl === "string" ? body.imageUrl.trim() : "";
      if (!imageUrl) {
        return jsonError(
          "image_url_required",
          400,
          "Instagram投稿には画像URLが必要です"
        );
      }

      const igPostId = await postInstagram(post.postText, imageUrl);

      const updatedIg = await prisma.snsPost.update({
        where: { id },
        data: {
          fbPostId: igPostId, // Instagram の post ID も fbPostId 列に格納（カラム追加回避）
          postedAt: new Date(),
          status: "posted",
        },
      });

      await sendSlackNotification(
        [
          "📸 [SNS] Instagram に投稿完了",
          `operator: ${admin.email}`,
          `event: ${post.event?.title ?? "(unknown)"}`,
          `phase: ${post.phaseLabel}`,
          `igPostId: ${igPostId}`,
        ].join("\n")
      );

      return NextResponse.json({
        ok: true,
        post: updatedIg,
        result: { ok: true, igPostId, scheduled: false },
      });
    }

    // Facebook 投稿（既存ロジック）
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
