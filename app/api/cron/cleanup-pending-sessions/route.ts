export const runtime = "nodejs";
export const preferredRegion = "hnd1";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendSlackNotification } from "@/lib/slack";

// 事前決済の待機（PENDING）を放置とみなすまでの時間。
// 現地でQRを読んで時間を選んで決済するのに30分もかからない想定。
const PENDING_TIMEOUT_MINUTES = 30;

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.get("authorization") ?? "";
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { ok: false, error: "unauthorized" },
        { status: 401 }
      );
    }
  }

  try {
    const cutoff = new Date(
      Date.now() - PENDING_TIMEOUT_MINUTES * 60 * 1000
    );

    // 決済されないまま放置された PENDING を削除して区画を解放する。
    // status が IN に変わったものは決済成立済みなので対象外。
    const stale = await prisma.parkingSession.findMany({
      where: {
        status: "PENDING",
        createdAt: { lt: cutoff },
      },
      select: {
        id: true,
        spotId: true,
        plate: true,
        createdAt: true,
      },
    });

    if (stale.length === 0) {
      return NextResponse.json({ ok: true, deleted: 0 });
    }

    const deleted = await prisma.parkingSession.deleteMany({
      where: {
        id: { in: stale.map((s) => s.id) },
      },
    });

    await sendSlackNotification(
      `【未決済セッション削除】${deleted.count}件を削除し区画を解放しました`
    ).catch(() => {});

    return NextResponse.json({ ok: true, deleted: deleted.count });
  } catch (error) {
    console.error("[cron/cleanup-pending-sessions] error:", error);
    return NextResponse.json(
      { ok: false, error: "server_error", detail: String(error) },
      { status: 500 }
    );
  }
}
