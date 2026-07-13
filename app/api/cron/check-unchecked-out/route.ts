export const runtime = "nodejs";
export const preferredRegion = "hnd1";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendSlackAlert, sendSlackNotification } from "@/lib/slack";
import { sendUnexitNoticeMail } from "@/lib/mail";
import { signUnexitToken } from "@/lib/unexit-token";

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").trim();

// 通常メールは予約終了から48時間以内のみ（古い未出庫への遡及送信を防止）
const MAX_NOTICE_AGE_MS = 48 * 60 * 60 * 1000;
// 緊急判定は予約終了から72時間以内のみ
const EMERGENCY_MAX_AGE_MS = 72 * 60 * 60 * 1000;
// 緊急アラートを発火するJST時刻（深夜スパム防止）
const EMERGENCY_HOURS = [7, 12, 18];

// 予約終了 = 予約日(YYYY-MM-DD)のJST翌0:00
function endOfReservationDateUtc(ymd: string): Date {
  const startJst = new Date(`${ymd}T00:00:00+09:00`);
  return new Date(startJst.getTime() + 24 * 60 * 60 * 1000);
}
// YYYY-MM-DD に日数を足した YYYY-MM-DD（JST基準）
function addDaysYmd(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00+09:00`);
  d.setUTCDate(d.getUTCDate() + days);
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}
function jstHour(now: Date): number {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).getUTCHours();
}

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.get("authorization") ?? "";
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
  }

  const now = new Date();
  const hour = jstHour(now);

  const candidates = await prisma.reservation.findMany({
    where: { checkedIn: true, checkedOutAt: null, status: "CONFIRMED" },
    select: {
      id: true, date: true, slot: true, name: true, email: true, phone: true,
      spotId: true, unexitNoticeSentAt: true,
      place: { select: { name: true } },
      spot: { select: { label: true, code: true } },
    },
  });

  const result = { mailed: 0, slackFallback: 0, emergency: 0, skipped: 0 };

  for (const r of candidates) {
    const reservationEndUtc = endOfReservationDateUtc(r.date);
    const elapsedMs = now.getTime() - reservationEndUtc.getTime();
    if (elapsedMs < 0) { result.skipped++; continue; } // 予約終了前

    const placeName = r.place?.name ?? "-";
    const spotLabel = r.spot?.label ?? r.spot?.code ?? r.slot;

    // ---- 緊急: 同スポットが予約日+2日以内に別のCONFIRMED予約で埋まっている（直近72h以内の未出庫のみ）----
    if (r.spotId && elapsedMs <= EMERGENCY_MAX_AGE_MS) {
      const conflict = await prisma.reservation.findFirst({
        where: {
          spotId: r.spotId, status: "CONFIRMED", id: { not: r.id },
          date: { gt: r.date, lte: addDaysYmd(r.date, 2) },
        },
        select: { id: true, date: true }, orderBy: { date: "asc" },
      });
      if (conflict && EMERGENCY_HOURS.includes(hour)) {
        await sendSlackAlert(
          [
            "🚨 未出庫（緊急）: 次のイベント日に同じ区画が予約済み",
            `駐車場：${placeName}`,
            `区画：${spotLabel}`,
            `顧客：${r.name}`,
            `電話：${r.phone ?? "未登録"}`,
            `未出庫の予約日：${r.date}`,
            `次の予約日：${conflict.date}`,
            "→ お客様へ架電のうえ、必要なら強制出庫で対応してください。",
          ].join("\n")
        );
        result.emergency++;
      }
    }

    // ---- 通常: 未通知かつ48h以内なら、確認メール（無ければ静かなSlack）を1回だけ ----
    if (!r.unexitNoticeSentAt && elapsedMs <= MAX_NOTICE_AGE_MS) {
      if (r.email) {
        const leftUrl = `${APP_URL}/api/unexit?t=${signUnexitToken({ r: r.id, a: "left" })}`;
        const parkedUrl = `${APP_URL}/api/unexit?t=${signUnexitToken({ r: r.id, a: "parked" })}`;
        try {
          await sendUnexitNoticeMail({ to: r.email, placeName, spotLabel, useDate: r.date, leftUrl, parkedUrl });
          await prisma.reservation.update({ where: { id: r.id }, data: { unexitNoticeSentAt: now } });
          result.mailed++;
        } catch (e) {
          console.error("unexit mail failed", r.id, e);
        }
      } else {
        await sendSlackNotification(
          [
            "ℹ️ 未出庫（メール未登録のため管理者通知）",
            `駐車場：${placeName}`,
            `区画：${spotLabel}`,
            `顧客：${r.name}`,
            `電話：${r.phone ?? "未登録"}`,
            `予約日：${r.date}`,
          ].join("\n")
        );
        await prisma.reservation.update({ where: { id: r.id }, data: { unexitNoticeSentAt: now } });
        result.slackFallback++;
      }
    }
  }

  return NextResponse.json({ ok: true, checked: candidates.length, ...result });
}
