import { prisma } from "@/lib/db";
import { ymdTodayJst } from "@/lib/pricing-core";
import {
  OCCUPYING_STATUSES,
  MONTHLY_EVENT_RESPONSE_DEADLINE_DAYS,
  MONTHLY_EVENT_PRE_RESPONSE_START_YMD,
} from "@/lib/monthly-config";

// YMD を UTC 基準で days 日戻した YMD を返す（TZ非依存）。
export function ymdMinusDaysUtc(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - days);
  return dt.toISOString().slice(0, 10);
}

/**
 * 事前回答方式（MonthlyEventResponse）で、月極区画がそのイベント日に
 * 一般向けへ「開放」されているかを判定する唯一の共通関数。
 *
 * GET（app/api/reservations, app/api/public/availability）と
 * POST（app/api/reservations, app/api/stripe/checkout/reservation）の
 * 4箇所すべてがこの関数を共有し、判定ロジックを複製しない。
 *
 * 判定:
 *  - date < MONTHLY_EVENT_PRE_RESPONSE_START_YMD → 常に false
 *    （8月分などの旧フローは維持。既存の契約者専有ガードがそのまま効く）
 *  - 回答は必ず contractId 経由で引く（spotId だと解約済み契約が混ざる）:
 *      DECLINED / EXPIRED → true
 *      RESERVED → 当日その spotId に CONFIRMED 予約が無ければ true（未決済＝先着）
 *      レコード無し / NOTIFIED → 開催 MONTHLY_EVENT_RESPONSE_DEADLINE_DAYS 日前を
 *        過ぎていれば true、それ以前は false
 */
export async function isMonthlySpotReleasedForEvent(
  spotId: string,
  date: string
): Promise<boolean> {
  // 切替日未満は旧フロー維持（常に false＝既存ガードがそのまま効く）。
  if (date < MONTHLY_EVENT_PRE_RESPONSE_START_YMD) return false;

  // 契約は spotId から引くが、回答は必ず contractId 経由で引く。
  const contract = await prisma.monthlyContract.findFirst({
    where: { spotId, status: { in: [...OCCUPYING_STATUSES] } },
    select: { id: true },
  });
  if (!contract) return false;

  const resp = await prisma.monthlyEventResponse.findUnique({
    where: { contractId_date: { contractId: contract.id, date } },
    select: { status: true },
  });
  const status = resp?.status;

  if (status === "DECLINED" || status === "EXPIRED") return true;

  if (status === "RESERVED") {
    // 当日その区画に CONFIRMED 予約が無ければ未決済＝先着で開放。
    const reserved = await prisma.reservation.findFirst({
      where: { spotId, date, status: "CONFIRMED" },
      select: { id: true },
    });
    return !reserved;
  }

  // レコード無し または NOTIFIED → 開催14日前を過ぎていれば開放。
  const deadlineYmd = ymdMinusDaysUtc(date, MONTHLY_EVENT_RESPONSE_DEADLINE_DAYS);
  return ymdTodayJst() > deadlineYmd;
}
