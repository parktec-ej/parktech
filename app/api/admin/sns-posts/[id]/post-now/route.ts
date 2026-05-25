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
 * SnsPost を SNS に投稿する。
 *
 * - body.mode = "now" (default): 即時投稿。FB + IG に同時投稿
 *   - imageUrl があれば IG にも投稿。FB は常に投稿
 *   - 両方の結果（fbPostId / igPostId / 各エラー）をまとめて返す
 *   - 片方失敗でも片方成功なら status=posted で記録
 * - body.mode = "scheduled": FB 側に予約投稿として登録（IGはサポートなし）
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
    const imageUrl =
      typeof body?.imageUrl === "string" ? body.imageUrl.trim() : "";

    const post = await prisma.snsPost.findUnique({
      where: { id },
      include: { event: { select: { id: true, title: true } } },
    });
    if (!post) return jsonError("not_found", 404);
    if (post.status === "posted") {
      return jsonError("already_posted", 409);
    }

    // ===== 予約投稿: FB のみ（IG非対応）=====
    if (mode === "scheduled") {
      if (!post.scheduledAt) {
        return jsonError("scheduled_at_required", 400);
      }
      const minTime = Date.now() + 10 * 60 * 1000;
      if (post.scheduledAt.getTime() < minTime) {
        return jsonError(
          "scheduled_at_too_soon",
          400,
          "予約投稿は10分以上先の時刻を指定してください"
        );
      }
      const result = await postFacebookScheduled({
        message: post.postText,
        scheduledAt: post.scheduledAt,
      });

      const updated = await prisma.snsPost.update({
        where: { id },
        data: {
          fbPostId: result.fbPostId,
          postedAt: null,
          status: "scheduled",
        },
      });

      await sendSlackNotification(
        [
          "📅 [SNS] Facebook 予約投稿を受付",
          `operator: ${admin.email}`,
          `event: ${post.event?.title ?? "(unknown)"}`,
          `phase: ${post.phaseLabel}`,
          `fbPostId: ${result.fbPostId}`,
        ].join("\n")
      );

      return NextResponse.json({ ok: true, post: updated, result });
    }

    // ===== 即時投稿: FB + IG 同時 =====
    // Step 1: Facebook 投稿
    let fbPostId: string | null = null;
    let fbError: string | null = null;
    try {
      const fbResult = await postFacebook({ message: post.postText });
      fbPostId = fbResult.fbPostId;
    } catch (e: any) {
      fbError = e?.message ?? String(e);
    }

    // Step 2: Instagram 投稿（imageUrl があれば）
    let igPostId: string | null = null;
    let igError: string | null = null;
    let igAttempted = false;
    if (imageUrl) {
      igAttempted = true;
      try {
        igPostId = await postInstagram(post.postText, imageUrl);
      } catch (e: any) {
        igError = e?.message ?? String(e);
      }
    }

    // 片方でも成功すれば DB を posted に更新
    const anySuccess = fbPostId !== null || igPostId !== null;
    if (anySuccess) {
      await prisma.snsPost.update({
        where: { id },
        data: {
          ...(fbPostId !== null ? { fbPostId } : {}),
          ...(igPostId !== null ? { igPostId } : {}),
          postedAt: new Date(),
          status: "posted",
        },
      });
    }

    // Slack 通知（成否を両方記述）
    const slackLines: string[] = [];
    if (fbPostId && igPostId) {
      slackLines.push("📣📸 [SNS] FB + IG 同時投稿完了");
    } else if (fbPostId && igAttempted) {
      slackLines.push("⚠️ [SNS] FB成功 / IG失敗");
    } else if (fbPostId) {
      slackLines.push("📣 [SNS] Facebook に投稿完了 (IGスキップ: imageUrl無し)");
    } else if (igPostId) {
      slackLines.push("⚠️ [SNS] IG成功 / FB失敗");
    } else {
      slackLines.push("🔴 [SNS] 投稿失敗（FB / IG ともに失敗）");
    }
    slackLines.push(`operator: ${admin.email}`);
    slackLines.push(`event: ${post.event?.title ?? "(unknown)"}`);
    slackLines.push(`phase: ${post.phaseLabel}`);
    if (fbPostId) slackLines.push(`fbPostId: ${fbPostId}`);
    if (fbError) slackLines.push(`fbError: ${fbError}`);
    if (igPostId) slackLines.push(`igPostId: ${igPostId}`);
    if (igError) slackLines.push(`igError: ${igError}`);
    await sendSlackNotification(slackLines.join("\n"));

    // どちらかでも失敗ならエラーレスポンスにするが、ID は返す（UIで保持できるように）
    if (fbError || igError) {
      return NextResponse.json(
        {
          ok: false,
          error: "partial_failure",
          message: [fbError, igError].filter(Boolean).join(" / "),
          fbPostId,
          igPostId,
          fbError,
          igError,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      fbPostId,
      igPostId,
      result: { fbPostId, igPostId, scheduled: false },
    });
  } catch (error) {
    console.error("[admin/sns-posts/post-now] error:", error);
    return jsonError(
      "server_error",
      500,
      error instanceof Error ? error.message : String(error)
    );
  }
}
