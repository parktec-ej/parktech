export const runtime = "nodejs";
export const preferredRegion = "hnd1";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminSession } from "@/lib/admin-auth";
import { MONTHLY_EVENT_OFFER_DEADLINE_DAYS } from "@/lib/monthly-config";

function ymdTodayJst() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}

function isYmd(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

// YYYY-MM-DD を UTC 0時の Date に。日付演算用（TZ非依存）。
function ymdToUtc(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
function ymdPlusDays(ymd: string, days: number) {
  const d = ymdToUtc(ymd);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Stripe Checkout Session のデフォルト有効期限は 24 時間。
// EventMonthlyOffer に決済リンクの明示的な失効時刻を保持していないため、
// RELEASED になった時刻（updatedAt）+ 24h をリンク失効の「推定値」として算出する。
const LINK_TTL_MS = 24 * 60 * 60 * 1000;

export async function GET(req: Request) {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(req.url);
    const placeId = String(url.searchParams.get("placeId") ?? "").trim();
    if (!placeId) {
      return NextResponse.json(
        { ok: false, error: "place_id_required" },
        { status: 400 }
      );
    }

    const today = ymdTodayJst();
    const fromRaw = String(url.searchParams.get("from") ?? "").trim();
    const toRaw = String(url.searchParams.get("to") ?? "").trim();
    const from = isYmd(fromRaw) ? fromRaw : today;
    const to = isYmd(toRaw) ? toRaw : ymdPlusDays(today, 90);
    const status = String(url.searchParams.get("status") ?? "").trim();

    const place = await prisma.place.findUnique({
      where: { id: placeId },
      select: { id: true, slug: true, name: true },
    });
    if (!place) {
      return NextResponse.json(
        { ok: false, error: "place_not_found" },
        { status: 404 }
      );
    }

    const offers = await prisma.eventMonthlyOffer.findMany({
      where: {
        placeId,
        date: { gte: from, lte: to },
        ...(status ? { status: status as never } : {}),
      },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        date: true,
        spotId: true,
        contractId: true,
        status: true,
        applicantName: true,
        applicantEmail: true,
        applicantPhone: true,
        applicantPlate: true,
        applicantCheckoutSession: true,
        applicantReservationId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // --- 結合用データを一括取得（日付ループ内でDBを叩かない）---
    const spotIds = [...new Set(offers.map((o) => o.spotId))];
    const contractIds = [...new Set(offers.map((o) => o.contractId))];
    const reservationIds = [
      ...new Set(offers.map((o) => o.applicantReservationId).filter(Boolean) as string[]),
    ];
    const dates = [...new Set(offers.map((o) => o.date))];

    const [spots, contracts, responses, reservations] = await Promise.all([
      spotIds.length
        ? prisma.spot.findMany({
            where: { id: { in: spotIds } },
            select: { id: true, code: true, label: true },
          })
        : Promise.resolve([]),
      // 契約は必ず offer.contractId で結合する（spotId で引くと解約済み契約が混ざる）。
      contractIds.length
        ? prisma.monthlyContract.findMany({
            where: { id: { in: contractIds } },
            select: {
              id: true,
              status: true,
              tenant: { select: { name: true, email: true } },
            },
          })
        : Promise.resolve([]),
      // 月極の回答は (contractId, date) で一意。範囲取得してキーで引く。
      contractIds.length && dates.length
        ? prisma.monthlyEventResponse.findMany({
            where: { contractId: { in: contractIds }, date: { in: dates } },
            select: { contractId: true, date: true, status: true, respondedAt: true },
          })
        : Promise.resolve([]),
      reservationIds.length
        ? prisma.reservation.findMany({
            where: { id: { in: reservationIds } },
            select: { id: true, slot: true, paid: true, status: true },
          })
        : Promise.resolve([]),
    ]);

    const spotById = new Map(spots.map((s) => [s.id, s]));
    const contractById = new Map(contracts.map((c) => [c.id, c]));
    const responseByKey = new Map(
      responses.map((r) => [`${r.contractId}|${r.date}`, r])
    );
    const reservationById = new Map(reservations.map((r) => [r.id, r]));

    const now = Date.now();

    const items = offers.map((o) => {
      const spot = spotById.get(o.spotId) ?? null;
      const contract = contractById.get(o.contractId) ?? null;
      const response = responseByKey.get(`${o.contractId}|${o.date}`) ?? null;
      const reservation = o.applicantReservationId
        ? reservationById.get(o.applicantReservationId) ?? null
        : null;

      const deadline = ymdPlusDays(o.date, -MONTHLY_EVENT_OFFER_DEADLINE_DAYS);

      // RELEASED かつ Checkout セッションがあるときのみ、リンク失効を推定する。
      let linkExpiresAt: string | null = null;
      let linkExpired = false;
      if (o.status === "RELEASED" && o.applicantCheckoutSession) {
        const exp = new Date(o.updatedAt).getTime() + LINK_TTL_MS;
        linkExpiresAt = new Date(exp).toISOString();
        linkExpired = now > exp;
      }

      const needsAction =
        o.status === "RELEASED" && o.applicantReservationId == null;

      return {
        id: o.id,
        date: o.date,
        deadline,
        status: o.status,
        spot: spot
          ? { id: spot.id, code: spot.code, label: spot.label }
          : null,
        contract: contract
          ? {
              id: contract.id,
              status: contract.status,
              tenantName: contract.tenant?.name ?? null,
              tenantEmail: contract.tenant?.email ?? null,
            }
          : null,
        monthlyResponse: response
          ? { status: response.status, respondedAt: response.respondedAt }
          : null,
        applicantName: o.applicantName,
        applicantEmail: o.applicantEmail,
        applicantPhone: o.applicantPhone,
        applicantPlate: o.applicantPlate,
        applicantCheckoutSession: o.applicantCheckoutSession,
        reservation: reservation
          ? {
              id: reservation.id,
              slot: reservation.slot,
              paid: reservation.paid,
              status: reservation.status,
            }
          : null,
        linkExpiresAt,
        linkExpired,
        needsAction,
        createdAt: o.createdAt,
        updatedAt: o.updatedAt,
      };
    });

    const byStatus: Record<string, number> = {};
    for (const it of items) {
      byStatus[it.status] = (byStatus[it.status] ?? 0) + 1;
    }

    return NextResponse.json({
      ok: true,
      place,
      range: { from, to },
      filters: { status: status || "ALL" },
      summary: {
        total: items.length,
        byStatus,
        needsAction: items.filter((x) => x.needsAction).length,
        linkExpired: items.filter((x) => x.linkExpired).length,
      },
      offers: items,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, error: "server_error", message },
      { status: 500 }
    );
  }
}
