// 判定ロジックは app/api/reservations/route.ts の GET と同一定義の複製です。
// 在庫判定の中核をリファクタするリスクを避けるため意図的に複製しています。
// 満車判定の条件を変更する場合は両方を必ず同時に修正してください。

export const runtime = "nodejs";
export const preferredRegion = "hnd1";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  ymdToUtcDate,
  ymdTodayJst,
  getReservationOpenAtJst,
} from "@/lib/pricing-core";
import {
  MONTHLY_PLACE_SLUG,
  MONTHLY_SLOT_CODES,
  OCCUPYING_STATUSES,
} from "@/lib/monthly-config";

const DEFAULT_DAYS = 90;
const MAX_DAYS = 180;

// ---- CORS（app/api/public/events/route.ts と同一方式・同一許可オリジン）----
const ALLOW_ORIGINS = ["https://parktec-ej.com", "https://www.parktec-ej.com"];

function corsHeaders(origin: string | null) {
  const allowed =
    origin && ALLOW_ORIGINS.includes(origin) ? origin : ALLOW_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    // オリジンごとに ACAO が変わるため、CDN キャッシュの取り違えを防ぐ
    Vary: "Origin",
    // 満車表示の鮮度を優先し events(60秒)より短くする
    "Cache-Control":
      "public, max-age=30, s-maxage=30, stale-while-revalidate=60",
  };
}

// ---- 以下は app/api/reservations/route.ts の GET と同一定義の複製 ----
type OperationMode =
  | "RESERVATION_ONLY"
  | "HOURLY_ONLY"
  | "RESERVATION_THEN_HOURLY"
  | "EVENT_ONLY"
  | "CLOSED"
  | "MONTHLY";

type EventDayLite = {
  id: string;
  reservationOpenDaysBefore: number | null;
};

function computeReservationOpen(
  eventDay: EventDayLite | null,
  ymd: string
): {
  ok: boolean;
  openDaysBefore: number;
  openAt: Date | null;
  eventDay: EventDayLite | null;
} {
  if (!eventDay) {
    return { ok: true, openDaysBefore: 0, openAt: null, eventDay: null };
  }

  const openDaysBefore = Number(eventDay.reservationOpenDaysBefore ?? 0);

  if (openDaysBefore <= 0) {
    return { ok: true, openDaysBefore: 0, openAt: null, eventDay };
  }

  const openAt = getReservationOpenAtJst(ymd, openDaysBefore);
  return {
    ok: new Date() >= openAt,
    openDaysBefore,
    openAt,
    eventDay,
  };
}

function normalizeSlot(input: string) {
  const value = String(input ?? "").trim().toUpperCase();

  if (!value) return "";

  const s = value.match(/^S(\d{1,2})$/i);
  if (s) {
    return `S${String(Number(s[1])).padStart(2, "0")}`;
  }

  const a = value.match(/^([A-Z])[- ]?(\d{1,2})$/i);
  if (a) {
    return `${a[1].toUpperCase()}-${String(Number(a[2])).padStart(2, "0")}`;
  }

  return value;
}

function canReserve(mode: string | null | undefined, eventDayActive: boolean) {
  if (mode === "RESERVATION_ONLY") return true;
  if (mode === "RESERVATION_THEN_HOURLY") return true;
  if (mode === "EVENT_ONLY") return eventDayActive;
  return false;
}
// ---- 複製ここまで ----

export async function OPTIONS(req: Request) {
  const origin = req.headers.get("origin");
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}

export async function GET(req: Request) {
  const origin = req.headers.get("origin");

  try {
    const url = new URL(req.url);
    const placeSlug = String(url.searchParams.get("placeSlug") ?? "").trim();
    if (!placeSlug) {
      return NextResponse.json(
        { ok: false, error: "missing_place_slug", message: "placeSlug は必須です" },
        { status: 400, headers: corsHeaders(origin) }
      );
    }

    const daysRaw = Number(url.searchParams.get("days"));
    const days = Number.isFinite(daysRaw)
      ? Math.min(MAX_DAYS, Math.max(1, Math.floor(daysRaw)))
      : DEFAULT_DAYS;

    // 1. place を1回取得
    const place = await prisma.place.findFirst({
      where: { slug: placeSlug, isActive: true },
      select: { id: true, slug: true, operationMode: true },
    });
    if (!place) {
      return NextResponse.json(
        { ok: false, error: "place_not_found", message: "place が見つかりません" },
        { status: 404, headers: corsHeaders(origin) }
      );
    }

    // 本日(JST)から days 日分の日付文字列
    const startYmd = ymdTodayJst();
    const startUtc = ymdToUtcDate(startYmd);
    const dates: string[] = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(startUtc);
      d.setUTCDate(d.getUTCDate() + i);
      dates.push(d.toISOString().slice(0, 10));
    }
    const firstUtc = ymdToUtcDate(dates[0]);
    const lastUtc = ymdToUtcDate(dates[dates.length - 1]);

    // 2. spot を1回取得
    const spots = await prisma.spot.findMany({
      where: { placeId: place.id, isActive: true },
      orderBy: { code: "asc" },
      select: { id: true, code: true, operationModeOverride: true },
    });

    // 3. eventDay を範囲取得（date は DateTime）
    const eventDaysRaw = await prisma.eventDay.findMany({
      where: {
        placeId: place.id,
        isActive: true,
        date: { gte: firstUtc, lte: lastUtc },
      },
      select: { id: true, date: true, reservationOpenDaysBefore: true },
    });
    const eventDayByYmd = new Map<string, EventDayLite>(
      eventDaysRaw.map((e) => [
        e.date.toISOString().slice(0, 10),
        { id: e.id, reservationOpenDaysBefore: e.reservationOpenDaysBefore },
      ])
    );

    // 4. reservation を範囲取得（date は String / 個人情報は取得しない）
    const reservationsRaw = await prisma.reservation.findMany({
      where: {
        placeId: place.id,
        date: { in: dates },
        status: "CONFIRMED",
      },
      select: { date: true, spotId: true, slot: true },
    });
    // date -> { spotIds, slots }
    const reservedByDate = new Map<
      string,
      { spotIds: Set<string>; slots: Set<string> }
    >();
    for (const r of reservationsRaw) {
      let bucket = reservedByDate.get(r.date);
      if (!bucket) {
        bucket = { spotIds: new Set<string>(), slots: new Set<string>() };
        reservedByDate.set(r.date, bucket);
      }
      if (r.spotId) bucket.spotIds.add(r.spotId);
      const ns = normalizeSlot(r.slot);
      if (ns) bucket.slots.add(ns);
    }

    // 5. spotModeCalendar を範囲取得（date は String）
    const dayModesRaw = await prisma.spotModeCalendar.findMany({
      where: {
        placeId: place.id,
        date: { in: dates },
      },
      select: { date: true, spotId: true, operationMode: true },
    });
    // date -> (spotId -> mode)
    const dayModeByDate = new Map<string, Map<string, OperationMode>>();
    for (const d of dayModesRaw) {
      let m = dayModeByDate.get(d.date);
      if (!m) {
        m = new Map<string, OperationMode>();
        dayModeByDate.set(d.date, m);
      }
      m.set(d.spotId, d.operationMode as OperationMode);
    }

    // 6. monthlyContract は日付非依存なので1回だけ取得
    const monthlyCodeSpotIds =
      place.slug === MONTHLY_PLACE_SLUG
        ? spots
            .filter((s) =>
              (MONTHLY_SLOT_CODES as readonly string[]).includes(s.code)
            )
            .map((s) => s.id)
        : [];
    const occupyingContracts = monthlyCodeSpotIds.length
      ? await prisma.monthlyContract.findMany({
          where: {
            spotId: { in: monthlyCodeSpotIds },
            status: { in: [...OCCUPYING_STATUSES] },
          },
          select: { id: true, spotId: true },
        })
      : [];
    const contractSpotIds = new Set<string>(
      occupyingContracts
        .filter((c) => Boolean(c.spotId))
        .map((c) => c.spotId as string)
    );

    // 7. 各日付をメモリ上で判定
    const soldOut: Record<string, boolean> = {};
    for (const ymd of dates) {
      const eventDay = eventDayByYmd.get(ymd) ?? null;
      const eventDayActive = Boolean(eventDay);
      const reservationOpen = computeReservationOpen(eventDay, ymd);

      const dayModeMap = dayModeByDate.get(ymd) ?? null;
      const reserved = reservedByDate.get(ymd) ?? null;

      // 一般グリッドへ表示される区画を抽出
      const displayed = spots.filter((s) => {
        const effForFilter =
          dayModeMap?.get(s.id) ?? s.operationModeOverride ?? place.operationMode;
        if (effForFilter === "MONTHLY") return false;

        if (
          place.slug === MONTHLY_PLACE_SLUG &&
          (MONTHLY_SLOT_CODES as readonly string[]).includes(s.code)
        ) {
          return !contractSpotIds.has(s.id);
        }
        return true;
      });

      let allReserved = displayed.length > 0;
      for (const s of displayed) {
        const effectiveMode =
          dayModeMap?.get(s.id) ??
          s.operationModeOverride ??
          place.operationMode ??
          "RESERVATION_ONLY";

        const isReserved =
          (reserved?.spotIds.has(s.id) ?? false) ||
          (reserved?.slots.has(normalizeSlot(s.code)) ?? false);

        const modeAllowsReservation = canReserve(effectiveMode, eventDayActive);

        let status:
          | "AVAILABLE"
          | "RESERVED"
          | "NOT_OPEN"
          | "PENDING_EVENT"
          | "CLOSED";
        if (isReserved) {
          status = "RESERVED";
        } else if (!reservationOpen.ok) {
          status = "NOT_OPEN";
        } else if (!modeAllowsReservation) {
          status = effectiveMode === "EVENT_ONLY" ? "PENDING_EVENT" : "CLOSED";
        } else {
          status = "AVAILABLE";
        }

        if (status !== "RESERVED") {
          allReserved = false;
          break;
        }
      }

      soldOut[ymd] = displayed.length > 0 && allReserved;
    }

    return NextResponse.json(
      {
        ok: true,
        placeSlug: place.slug,
        generatedAt: new Date().toISOString(),
        soldOut,
      },
      { headers: corsHeaders(origin) }
    );
  } catch (error) {
    console.error("GET /api/public/availability error:", error);
    return NextResponse.json(
      { ok: false, error: "server_error", message: "取得に失敗しました" },
      { status: 500, headers: corsHeaders(origin) }
    );
  }
}
