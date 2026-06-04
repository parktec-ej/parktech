import { prisma } from "@/lib/db";
import { ymdToUtcDate } from "@/lib/pricing-core";

function jstYmd(d: Date): string {
  return d.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}

/**
 * イベントの対象 place を解決する。
 * - placeId 直結ならそれを使う
 * - 無ければ VenueGroup の parkings(parkingSlug, showOnHp=true) → Place.id を解決
 */
async function resolveEventPlaceIds(
  placeId: string | null,
  venueGroupId: string | null
): Promise<string[]> {
  if (placeId) return [placeId];
  if (!venueGroupId) return [];

  const parkings = await prisma.venueGroupParking.findMany({
    where: { venueGroupId, showOnHp: true },
    select: { parkingSlug: true },
  });
  const slugs = parkings.map((p) => p.parkingSlug).filter(Boolean);
  if (slugs.length === 0) return [];

  const places = await prisma.place.findMany({
    where: { slug: { in: slugs }, isActive: true },
    select: { id: true },
  });
  return places.map((p) => p.id);
}

/**
 * イベント内容から EventDay を自動同期する。
 * - status === "published" のときのみ isActive: true（予約解放）
 * - それ以外（approved / draft / archived）は isActive: false（予約クローズ）
 * - 予約開始タイミング(bookingStartDays)・当日料金(ourPrice) も反映する
 * place が解決できないイベントは何もしない。
 */
export async function syncEventDayFromEvent(eventId: string): Promise<void> {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: {
      placeId: true,
      venueGroupId: true,
      title: true,
      startAt: true,
      status: true,
      bookingStartDays: true,
      ourPrice: true,
    },
  });
  if (!event) return;

  const placeIds = await resolveEventPlaceIds(event.placeId, event.venueGroupId);
  if (placeIds.length === 0) return;

  const ymd = jstYmd(event.startAt);
  const date = ymdToUtcDate(ymd);
  const active = event.status === "published";
  const openDaysBefore = event.bookingStartDays ?? 0;

  for (const placeId of placeIds) {
    await prisma.eventDay.upsert({
      where: { placeId_date: { placeId, date } },
      update: {
        isActive: active,
        reservationOpenDaysBefore: openDaysBefore,
        label: event.title,
        // ourPrice が入っているときだけ価格を上書き（手動設定を消さない）
        ...(event.ourPrice != null ? { fixedYenOverride: event.ourPrice } : {}),
      },
      create: {
        placeId,
        date,
        label: event.title,
        isActive: active,
        reservationOpenDaysBefore: openDaysBefore,
        fixedYenOverride: event.ourPrice ?? null,
      },
    });
  }
}

/**
 * イベント日が変わったとき、旧日付の EventDay を閉じる。
 */
export async function deactivateStaleEventDay(
  placeId: string | null,
  venueGroupId: string | null,
  oldStartAt: Date,
  newStartAt: Date
): Promise<void> {
  const oldYmd = jstYmd(oldStartAt);
  const newYmd = jstYmd(newStartAt);
  if (oldYmd === newYmd) return;

  const placeIds = await resolveEventPlaceIds(placeId, venueGroupId);
  if (placeIds.length === 0) return;

  await prisma.eventDay.updateMany({
    where: { placeId: { in: placeIds }, date: ymdToUtcDate(oldYmd) },
    data: { isActive: false },
  });
}
