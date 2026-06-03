export const runtime = "nodejs";
export const preferredRegion = "hnd1";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminSession } from "@/lib/admin-auth";
import { postFacebook } from "@/lib/facebook";
import { postInstagram } from "@/lib/instagram";
import { sendSlackNotification } from "@/lib/slack";

function jsonError(error: string, status = 400, message?: string) {
  return NextResponse.json(
    { ok: false, error, ...(message ? { message } : {}) },
    { status }
  );
}

/**
 * イベントに紐づかない汎用SNS投稿（SnsBroadcast）を即時投稿する。
 * - 先に SnsBroadcast を status:"draft" で作成
 * - toFb なら postFacebook、toIg かつ imageUrl あれば postInstagram
 * - FB/IG を個別 try/catch し、部分成功を partial として記録（既存 post-now を踏襲）
 */
export async function POST(req: Request) {
  const admin = await getAdminSession();
  if (!admin) return jsonError("unauthorized", 401);

  try {
    const body = await req.json().catch(() => ({}));
    const caption = typeof body?.caption === "string" ? body.caption.trim() : "";
    const imageUrl = typeof body?.imageUrl === "string" ? body.imageUrl.trim() : "";
    const toIg = Boolean(body?.toIg);
    const toFb = Boolean(body?.toFb);

    if (!caption) {
      return jsonError("caption_required", 400, "キャプションを入力してください");
    }
    if (!toIg && !toFb) {
      return jsonError("no_target", 400, "投稿先（Instagram / Facebook）を1つ以上選択してください");
    }

    // 先に draft レコードを作成
    const broadcast = await prisma.snsBroadcast.create({
      data: {
        caption,
        imageUrl: imageUrl || null,
        toIg,
        toFb,
        status: "draft",
      },
    });

    // Facebook
    let fbPostId: string | null = null;
    let fbError: string | null = null;
    if (toFb) {
      try {
        const r = await postFacebook({ message: caption });
        fbPostId = r.fbPostId;
      } catch (e) {
        fbError = e instanceof Error ? e.message : String(e);
      }
    }

    // Instagram（imageUrl があるときのみ）
    let igPostId: string | null = null;
    let igError: string | null = null;
    let igSkipped = false;
    if (toIg) {
      if (imageUrl) {
        try {
          igPostId = await postInstagram(caption, imageUrl);
        } catch (e) {
          igError = e instanceof Error ? e.message : String(e);
        }
      } else {
        igSkipped = true;
        igError = "imageUrl が無いため Instagram はスキップしました";
      }
    }

    // ステータス判定
    const fbOk = !toFb || fbPostId !== null;
    const igOk = !toIg || igPostId !== null;
    let status: "posted" | "partial" | "failed";
    if (fbPostId === null && igPostId === null) {
      status = "failed";
    } else if (fbOk && igOk) {
      status = "posted";
    } else {
      status = "partial";
    }

    const errorText =
      [fbError, igError].filter(Boolean).join(" / ") || null;
    const anySuccess = fbPostId !== null || igPostId !== null;

    const updated = await prisma.snsBroadcast.update({
      where: { id: broadcast.id },
      data: {
        fbPostId,
        igPostId,
        status,
        error: errorText,
        postedAt: anySuccess ? new Date() : null,
      },
    });

    // Slack 通知
    const lines: string[] = [];
    if (status === "posted") lines.push("📣 [SNS Broadcast] 投稿完了");
    else if (status === "partial") lines.push("⚠️ [SNS Broadcast] 部分成功");
    else lines.push("🔴 [SNS Broadcast] 投稿失敗");
    lines.push(`operator: ${admin.email}`);
    lines.push(`caption: ${caption.slice(0, 60)}${caption.length > 60 ? "…" : ""}`);
    if (fbPostId) lines.push(`fbPostId: ${fbPostId}`);
    if (fbError) lines.push(`fbError: ${fbError}`);
    if (igPostId) lines.push(`igPostId: ${igPostId}`);
    if (igError) lines.push(`igError: ${igError}`);
    await sendSlackNotification(lines.join("\n")).catch(() => {});

    const payload = {
      ok: status !== "failed",
      status,
      fbPostId,
      igPostId,
      igSkipped,
      error: errorText,
      broadcast: updated,
    };

    return NextResponse.json(payload, { status: status === "failed" ? 500 : 200 });
  } catch (error) {
    console.error("[admin/sns/post-now] error:", error);
    return jsonError(
      "server_error",
      500,
      error instanceof Error ? error.message : String(error)
    );
  }
}
