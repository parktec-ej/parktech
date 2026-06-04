import { prisma } from "@/lib/db";
import { ymdToUtcDate } from "@/lib/pricing-core";

function jstYmd(d: Date): string {
  return d.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}

/**
 * イベント内容から EventDay を自動同期する。
 * - status === "published" のときのみ isActive: true（予約解放）
 * - それ以外（approved / draft / archived）は isActive: false（予約クローズ）
 * - 予約開始タイミング(bookingStartDays)・当日料金(ourPrice) も反映する
 * place が無いイベントは何もしない。
 */
export async function syncEventDayFromEvent(eventId: string): Promise<void> {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: {
      placeId: true,
      title: true,
      startAt: true,
      status: true,
      bookingStartDays: true,
      ourPrice: true,
    },
  });
  if (!event || !event.placeId) return;

  const ymd = jstYmd(event.startAt);
  const date = ymdToUtcDate(ymd);
  const active = event.status === "published";
  const openDaysBefore = event.bookingStartDays ?? 0;

  await prisma.eventDay.upsert({
    where: { placeId_date: { placeId: event.placeId, date } },
    update: {
      isActive: active,
      reservationOpenDaysBefore: openDaysBefore,
      label: event.title,
      // ourPrice が入っているときだけ価格を上書き（手動設定を消さない）
      ...(event.ourPrice != null ? { fixedYenOverride: event.ourPrice } : {}),
    },
    create: {
      placeId: event.placeId,
      date,
      label: event.title,
      isActive: active,
      reservationOpenDaysBefore: openDaysBefore,
      fixedYenOverride: event.ourPrice ?? null,
    },
  });
}

/**
 * イベント日が変わったとき、旧日付の EventDay を閉じる。
 */
export async function deactivateStaleEventDay(
  placeId: string | null,
  oldStartAt: Date,
  newStartAt: Date
): Promise<void> {
  if (!placeId) return;
  const oldYmd = jstYmd(oldStartAt);
  const newYmd = jstYmd(newStartAt);
  if (oldYmd === newYmd) return;
  await prisma.eventDay.updateMany({
    where: { placeId, date: ymdToUtcDate(oldYmd) },
    data: { isActive: false },
  });
}
