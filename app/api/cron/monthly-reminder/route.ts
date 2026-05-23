export const runtime = "nodejs";
export const preferredRegion = "hnd1";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendSlackNotification } from "@/lib/slack";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://reserve.parktec-ej.com";

function isAuthorized(req: Request): boolean {
  const header = req.headers.get("authorization") ?? "";
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // dev permissive
  return header === `Bearer ${secret}`;
}

function jstYmdAndDay() {
  const now = new Date();
  const ymd = now.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
  const [y, m, d] = ymd.split("-").map(Number);
  let prevY = y;
  let prevM = m - 1;
  if (prevM === 0) {
    prevM = 12;
    prevY = y - 1;
  }
  const prevMonth = `${prevY}-${String(prevM).padStart(2, "0")}`;
  const prevMonthLabel = `${prevY}年${String(prevM).padStart(2, "0")}月`;
  return { ymd, day: d, prevMonth, prevMonthLabel };
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 }
    );
  }

  try {
    const { day, prevMonth, prevMonthLabel } = jstYmdAndDay();
    const settlements = await prisma.settlement.findMany({
      where: { month: prevMonth },
      select: { id: true, status: true },
    });

    const draftCount = settlements.filter((s) => s.status === "DRAFT").length;
    const approvedCount = settlements.filter(
      (s) => s.status === "APPROVED"
    ).length;
    const lockedCount = settlements.filter((s) => s.status === "LOCKED").length;
    const paidCount = settlements.filter((s) => s.status === "PAID").length;
    const unApproved = draftCount + approvedCount;
    const unpaid = lockedCount;
    const total = settlements.length;

    const settlementsUrl = `${APP_URL}/admin/settlements`;
    let message: string | null = null;

    if (day === 1) {
      message = `📊 ${prevMonthLabel}分の月次精算データを作成してください。\n管理画面: ${settlementsUrl}`;
    } else if (day === 5) {
      if (unApproved > 0) {
        message = `⚠️ ${prevMonthLabel}分の未承認精算が${unApproved}件あります。本日が承認期限です。\n管理画面: ${settlementsUrl}`;
      }
    } else if (day === 10) {
      if (unpaid > 0) {
        message = `💰 ${prevMonthLabel}分の未払い精算が${unpaid}件あります。本日が振込実行日です。\n管理画面: ${settlementsUrl}`;
      }
    } else if (day >= 2 && day <= 4) {
      if (unApproved > 0) {
        message = `📋 ${prevMonthLabel}分の精算${unApproved}件が確認待ちです（承認期限: 5日）\n管理画面: ${settlementsUrl}`;
      }
    } else if (day >= 6 && day <= 9) {
      if (unpaid > 0) {
        message = `📋 ${prevMonthLabel}分の精算${unpaid}件が振込待ちです(振込日: 10日)\n管理画面: ${settlementsUrl}`;
      }
    } else if (day >= 11) {
      const incomplete = unApproved + unpaid;
      if (incomplete > 0) {
        message = `🔴 ${prevMonthLabel}分の精算業務が完了していません。未承認${unApproved}件 / 未払い${unpaid}件\n管理画面: ${settlementsUrl}`;
      }
    }

    if (message) {
      await sendSlackNotification(message);
    }

    return NextResponse.json({
      ok: true,
      day,
      prevMonth,
      counts: {
        total,
        draft: draftCount,
        approved: approvedCount,
        locked: lockedCount,
        paid: paidCount,
      },
      notified: !!message,
      message,
    });
  } catch (e: any) {
    console.error("[cron/monthly-reminder] error:", e);
    return NextResponse.json(
      {
        ok: false,
        error: "server_error",
        message: e?.message ?? String(e),
      },
      { status: 500 }
    );
  }
}
