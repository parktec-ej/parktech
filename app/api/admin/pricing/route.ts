export const runtime = "nodejs";
export const preferredRegion = "hnd1";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";

function jsonError(
  message: string,
  status = 400,
  error?: string,
  detail?: unknown
) {
  return NextResponse.json(
    {
      ok: false,
      error: error ?? "bad_request",
      message,
      ...(detail !== undefined ? { detail } : {}),
    },
    { status }
  );
}

function toInt(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function toNullableInt(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function normalizeYmd(input: string) {
  const value = String(input ?? "").trim();
  if (!value) return "";

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

  if (/^\d{8}$/.test(value)) {
    return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  }

  return value;
}

function ymdToUtcDate(ymd: string) {
  return new Date(`${ymd}T00:00:00.000Z`);
}

// JST の「今日」0時を UTC 表現で返す（料金設定の一覧を未来日に絞るため）
function todayJstUtcDate() {
  const ymd = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
  return ymdToUtcDate(ymd);
}

function isAllowedOpenDays(value: number) {
  return [0, 7, 14, 30, 60].includes(value);
}

type EventDayInput = {
  id?: string;
  date: string;
  fixedYenOverride?: number | string | null;
  hourlyYenOverride?: number | string | null;
  dailyYenOverride?: number | string | null;
  busFixedYen?: number | string | null;
  reservationOpenDaysBefore?: number | string | null;
  label?: string | null;
};

type EventDayRow = {
  id: string;
  date: Date;
  label: string | null;
  fixedYenOverride: number | null;
  hourlyYenOverride: number | null;
  dailyYenOverride: number | null;
  busFixedYen: number | null;
  reservationOpenDaysBefore: number | null;
};

type NormalizedEventDay = {
  id: string;
  date: string;
  label: string | null;
  fixedYenOverride: number | null;
  hourlyYenOverride: number | null;
  dailyYenOverride: number | null;
  busFixedYen: number | null;
  reservationOpenDaysBefore: number;
};

export async function GET(req: NextRequest) {
  await requireAdmin();

  try {
    const url = new URL(req.url);
    const placeId = String(url.searchParams.get("placeId") ?? "").trim();

    if (!placeId) {
      return jsonError("placeId が必要です", 400, "missing_place_id");
    }

    const place = await prisma.place.findUnique({
      where: { id: placeId },
      select: {
        id: true,
        slug: true,
        name: true,
      },
    });

    if (!place) {
      return jsonError("place が見つかりません", 404, "place_not_found");
    }

    const [reservationRule, hourlyRule, eventDays] = await Promise.all([
      prisma.pricingRule.findFirst({
        where: {
          placeId,
          pricingType: "RESERVATION_FIXED",
          isActive: true,
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          fixedYen: true,
          createdAt: true,
        },
      }),
      prisma.pricingRule.findFirst({
        where: {
          placeId,
          pricingType: "HOURLY",
          isActive: true,
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          hourlyYen: true,
          dailyYen: true,
          createdAt: true,
        },
      }),
      prisma.eventDay.findMany({
        where: {
          placeId,
          date: { gte: todayJstUtcDate() },
        },
        orderBy: { date: "asc" },
        select: {
          id: true,
          date: true,
          label: true,
          fixedYenOverride: true,
          hourlyYenOverride: true,
          dailyYenOverride: true,
          busFixedYen: true,
          reservationOpenDaysBefore: true,
        },
      }),
    ]);

    const eventDayRows = eventDays as EventDayRow[];

    return NextResponse.json({
      ok: true,
      place,
      reservationFixedYen: reservationRule?.fixedYen ?? 3000,
      hourlyYen: hourlyRule?.hourlyYen ?? 500,
      dailyYen: hourlyRule?.dailyYen ?? null,
      eventDays: eventDayRows.map((d: EventDayRow) => ({
        id: d.id,
        date: d.date.toISOString().slice(0, 10),
        label: d.label ?? "",
        fixedYenOverride: d.fixedYenOverride,
        hourlyYenOverride: d.hourlyYenOverride,
        dailyYenOverride: d.dailyYenOverride,
        busFixedYen: d.busFixedYen,
        reservationOpenDaysBefore: d.reservationOpenDaysBefore ?? 0,
      })),
    });
  } catch (error) {
    console.error("GET /api/admin/pricing error:", error);

    return jsonError(
      "料金設定の取得に失敗しました",
      500,
      "internal_error",
      error instanceof Error ? error.message : String(error)
    );
  }
}

export async function POST(req: NextRequest) {
  await requireAdmin();

  try {
    console.log("ADMIN PRICING POST START");

    const body = await req.json().catch(() => null);
    console.log("ADMIN PRICING BODY:", body);

    if (!body || typeof body !== "object") {
      return jsonError("JSON body が必要です", 400, "invalid_body");
    }

    const bodyObj = body as {
      placeId?: unknown;
      reservationFixedYen?: unknown;
      hourlyYen?: unknown;
      dailyYen?: unknown;
      eventDays?: unknown;
    };

    const placeId = String(bodyObj.placeId ?? "").trim();
    const reservationFixedYen = toInt(bodyObj.reservationFixedYen, 3000);
    const hourlyYen = toInt(bodyObj.hourlyYen, 500);
    const dailyYen = toNullableInt(bodyObj.dailyYen);

    const rawEventDays: EventDayInput[] = Array.isArray(bodyObj.eventDays)
      ? (bodyObj.eventDays as EventDayInput[])
      : [];

    console.log("ADMIN PRICING placeId:", placeId);
    console.log("ADMIN PRICING values:", {
      reservationFixedYen,
      hourlyYen,
      dailyYen,
      rawEventDays,
    });

    if (!placeId) {
      return jsonError("placeId が必要です", 400, "missing_place_id");
    }

    const place = await prisma.place.findUnique({
      where: { id: placeId },
      select: {
        id: true,
        slug: true,
        name: true,
      },
    });

    if (!place) {
      return jsonError("place が見つかりません", 404, "place_not_found");
    }

    const normalizedEventDays: NormalizedEventDay[] = rawEventDays
      .map((row: EventDayInput): NormalizedEventDay | null => {
        const ymd = normalizeYmd(String(row?.date ?? ""));

        if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
          return null;
        }

        const reservationOpenDaysBefore = toInt(
          row?.reservationOpenDaysBefore,
          0
        );

        if (!isAllowedOpenDays(reservationOpenDaysBefore)) {
          return null;
        }

        return {
          id: row?.id ? String(row.id) : "",
          date: ymd,
          label: String(row?.label ?? "").trim() || null,
          fixedYenOverride: toNullableInt(row?.fixedYenOverride),
          hourlyYenOverride: toNullableInt(row?.hourlyYenOverride),
          dailyYenOverride: toNullableInt(row?.dailyYenOverride),
          busFixedYen: toNullableInt(row?.busFixedYen),
          reservationOpenDaysBefore,
        };
      })
      .filter((v: NormalizedEventDay | null): v is NormalizedEventDay => {
        return v !== null;
      });

    console.log("ADMIN PRICING normalizedEventDays:", normalizedEventDays);

    // NOTE: Supabase Pooler(transaction mode) では interactive transaction
    // (prisma.$transaction(async ...)) が「Transaction not found」で落ちるため、
    // トランザクションを張らず単発文を順次実行する（event-day-sync と同じ方針）。

    // ── 料金ルール(RESERVATION_FIXED) ──
    const reservationRule = await prisma.pricingRule.findFirst({
      where: { placeId, pricingType: "RESERVATION_FIXED" },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });

    let reservationRuleId: string;

    if (reservationRule) {
      const updated = await prisma.pricingRule.update({
        where: { id: reservationRule.id },
        data: { fixedYen: reservationFixedYen, isActive: true },
        select: { id: true },
      });
      reservationRuleId = updated.id;
    } else {
      const created = await prisma.pricingRule.create({
        data: {
          placeId,
          pricingType: "RESERVATION_FIXED",
          fixedYen: reservationFixedYen,
          isActive: true,
        },
        select: { id: true },
      });
      reservationRuleId = created.id;
    }

    // ── 料金ルール(HOURLY) ──
    const hourlyRule = await prisma.pricingRule.findFirst({
      where: { placeId, pricingType: "HOURLY" },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });

    let hourlyRuleId: string;

    if (hourlyRule) {
      const updated = await prisma.pricingRule.update({
        where: { id: hourlyRule.id },
        data: { hourlyYen, dailyYen, isActive: true },
        select: { id: true },
      });
      hourlyRuleId = updated.id;
    } else {
      const created = await prisma.pricingRule.create({
        data: {
          placeId,
          pricingType: "HOURLY",
          hourlyYen,
          dailyYen,
          isActive: true,
        },
        select: { id: true },
      });
      hourlyRuleId = created.id;
    }

    // ── EventDay 同期 ──
    // 【一本化】予約の開閉(isActive)は Event の publish 状態(event-day-sync)に一元化する。
    // 料金設定は「金額・予約開放日・ラベル」だけを更新し、isActive は書かない。
    //   - 既存日: isActive を触らない（publish 済み=開いたまま / 未publish=閉じたまま）
    //   - 新規日: isActive:false で作成（予約が開くのは Event を publish したときだけ）
    const eventDayIds: string[] = [];

    for (const row of normalizedEventDays) {
      const date = ymdToUtcDate(row.date);

      const saved = await prisma.eventDay.upsert({
        where: { placeId_date: { placeId, date } },
        update: {
          label: row.label,
          fixedYenOverride: row.fixedYenOverride,
          hourlyYenOverride: row.hourlyYenOverride,
          dailyYenOverride: row.dailyYenOverride,
          busFixedYen: row.busFixedYen,
          reservationOpenDaysBefore: row.reservationOpenDaysBefore,
          // isActive は触らない（開閉権は publish に一元化）
        },
        create: {
          placeId,
          date,
          label: row.label,
          fixedYenOverride: row.fixedYenOverride,
          hourlyYenOverride: row.hourlyYenOverride,
          dailyYenOverride: row.dailyYenOverride,
          busFixedYen: row.busFixedYen,
          reservationOpenDaysBefore: row.reservationOpenDaysBefore,
          isActive: false, // 新規日は閉じた状態。Event を publish して開く。
        },
        select: { id: true },
      });

      eventDayIds.push(saved.id);
    }

    const txResult = { reservationRuleId, hourlyRuleId, eventDayIds };

    console.log("ADMIN PRICING POST SUCCESS:", txResult);

    return NextResponse.json({
      ok: true,
      message: "料金設定を保存しました",
      data: txResult,
    });
  } catch (error) {
    console.error("POST /api/admin/pricing error:", error);

    return jsonError(
      "料金設定の保存に失敗しました",
      500,
      "internal_error",
      error instanceof Error ? error.message : String(error)
    );
  }
}