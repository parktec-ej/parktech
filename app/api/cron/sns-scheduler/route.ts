export const runtime = "nodejs";
export const preferredRegion = "hnd1";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { postFacebook } from "@/lib/facebook";
import { postInstagram } from "@/lib/instagram";
import { sendSlackNotification } from "@/lib/slack";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://reserve.parktec-ej.com";

function isAuthorized(req: Request): boolean {
  const header = req.headers.get("authorization") ?? "";
  const expected = process.env.CRON_SECRET;
  if (!expected) return true;
  return header === `Bearer ${expected}`;
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date();

    const pendingPosts = await prisma.snsPost.findMany({
      where: {
        status: "draft",
        scheduledAt: { lte: now },
      },
      include: {
        event: { select: { id: true, title: true } },
      },
      take: 10,
    });

    if (pendingPosts.length === 0) {
      return NextResponse.json({ ok: true, message: "no pending posts", processed: 0 });
    }

    const results: { id: string; title: string; success: boolean; error?: string }[] = [];

    for (const post of pendingPosts) {
      try {
        let fbPostId: string | null = null;
        let fbError: string | null = null;
        try {
          const fbResult = await postFacebook({ message: post.postText });
          fbPostId = fbResult.fbPostId;
        } catch (e: any) {
          fbError = e?.message ?? String(e);
        }

        let igPostId: string | null = null;
        let igError: string | null = null;
        if (post.eventId) {
          const imageUrl = `${APP_URL}/api/og/event/${post.eventId}`;
          try {
            igPostId = await postInstagram(post.postText, imageUrl);
          } catch (e: any) {
            igError = e?.message ?? String(e);
          }
        }

        const anySuccess = fbPostId !== null || igPostId !== null;

        await prisma.snsPost.update({
          where: { id: post.id },
          data: {
            ...(fbPostId ? { fbPostId } : {}),
            ...(igPostId ? { igPostId } : {}),
            postedAt: anySuccess ? now : null,
            status: anySuccess ? "posted" : "failed",
          },
        });

        results.push({
          id: post.id,
          title: post.event?.title ?? "(unknown)",
          success: anySuccess,
          error: anySuccess ? undefined : [fbError, igError].filter(Boolean).join(" / "),
        });
      } catch (e: any) {
        await prisma.snsPost.update({
          where: { id: post.id },
          data: { status: "failed" },
        });
        results.push({
          id: post.id,
          title: post.event?.title ?? "(unknown)",
          success: false,
          error: e?.message ?? String(e),
        });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;
    const lines = [
      `🤖 [SNS Scheduler] ${results.length}件処理 (成功${successCount} / 失敗${failCount})`,
      ...results.map((r) =>
        r.success
          ? `  ✅ ${r.title}`
          : `  ❌ ${r.title}: ${r.error}`
      ),
    ];
    await sendSlackNotification(lines.join("\n"));

    return NextResponse.json({ ok: true, processed: results.length, results });
  } catch (e: any) {
    console.error("[cron/sns-scheduler] error:", e);
    return NextResponse.json(
      { ok: false, error: "server_error", message: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
