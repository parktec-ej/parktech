import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";

function jsonError(message: string, status = 400, error?: string, detail?: unknown) {
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

function isAllowedOpenDays(value: number) {
  return [0, 7, 14, 30, 60].includes(value);
}

type EventDayInput = {
  id?: string;
  date: string;
  fixedYenOverride?: number | null;
  hourlyYenOverride?: number | null;
  busFixedYen?: number | null;
  reservationOpenDaysBefore?: number | null;
  label?: string | null;
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
          createdAt: true,
        },
      }),
      prisma.eventDay.findMany({
        where: {
          placeId,
          isActive: true,
        },
        orderBy: { date: "asc" },
        select: {
          id: true,
          date: true,
          label: true,
          fixedYenOverride: true,
          hourlyYenOverride: true,
          busFixedYen: true,
          reservationOpenDaysBefore: true,
        },
      }),
    ]);

    return NextResponse.json({
      ok: true,
      place,
      reservationFixedYen: reservationRule?.fixedYen ?? 3000,
      hourlyYen: hourlyRule?.hourlyYen ?? 500,
      eventDays: eventDays.map((d) => ({
        id: d.id,
        date: d.date.toISOString().slice(0, 10),
        label: d.label ?? "",
        fixedYenOverride: d.fixedYenOverride,
        hourlyYenOverride: d.hourlyYenOverride,
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

    const placeId = String(body.placeId ?? "").trim();
    const reservationFixedYen = toInt(body.reservationFixedYen, 3000);
    const hourlyYen = toInt(body.hourlyYen, 500);
    const rawEventDays = Array.isArray(body.eventDays) ? (body.eventDays as EventDayInput[]) : [];

    console.log("ADMIN PRICING placeId:", placeId);
    console.log("ADMIN PRICING values:", {
      reservationFixedYen,
      hourlyYen,
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

    const normalizedEventDays = rawEventDays
      .map((row) => {
        const ymd = normalizeYmd(String(row?.date ?? ""));
        if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;

        const reservationOpenDaysBefore = toInt(row?.reservationOpenDaysBefore, 0);
        if (!isAllowedOpenDays(reservationOpenDaysBefore)) return null;

        return {
          id: row?.id ? String(row.id) : "",
          date: ymd,
          label: String(row?.label ?? "").trim() || null,
          fixedYenOverride: toNullableInt(row?.fixedYenOverride),
          hourlyYenOverride: toNullableInt(row?.hourlyYenOverride),
          busFixedYen: toNullableInt(row?.busFixedYen),
          reservationOpenDaysBefore,
        };
      })
      .filter((v): v is NonNullable<typeof v> => v !== null);

    console.log("ADMIN PRICING normalizedEventDays:", normalizedEventDays);

    const txResult = await prisma.$transaction(async (tx) => {
      const reservationRule = await tx.pricingRule.findFirst({
        where: {
          placeId,
          pricingType: "RESERVATION_FIXED",
        },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });

      let reservationRuleId: string;

      if (reservationRule) {
        const updated = await tx.pricingRule.update({
          where: { id: reservationRule.id },
          data: {
            fixedYen: reservationFixedYen,
            isActive: true,
          },
          select: { id: true },
        });
        reservationRuleId = updated.id;
      } else {
        const created = await tx.pricingRule.create({
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

      const hourlyRule = await tx.pricingRule.findFirst({
        where: {
          placeId,
          pricingType: "HOURLY",
        },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });

      let hourlyRuleId: string;

      if (hourlyRule) {
        const updated = await tx.pricingRule.update({
          where: { id: hourlyRule.id },
          data: {
            hourlyYen,
            isActive: true,
          },
          select: { id: true },
        });
        hourlyRuleId = updated.id;
      } else {
        const created = await tx.pricingRule.create({
          data: {
            placeId,
            pricingType: "HOURLY",
            hourlyYen,
            isActive: true,
          },
          select: { id: true },
        });
        hourlyRuleId = created.id;
      }

      // まず既存イベント日をすべて非アクティブ化
      await tx.eventDay.updateMany({
        where: { placeId },
        data: { isActive: false },
      });

      const eventDayIds: string[] = [];

      for (const row of normalizedEventDays) {
        const date = ymdToUtcDate(row.date);

        const existing = await tx.eventDay.findFirst({
          where: {
            placeId,
            date,
          },
          orderBy: { createdAt: "desc" },
          select: { id: true },
        });

        if (existing) {
          const updated = await tx.eventDay.update({
            where: { id: existing.id },
            data: {
              label: row.label,
              fixedYenOverride: row.fixedYenOverride,
              hourlyYenOverride: row.hourlyYenOverride,
              busFixedYen: row.busFixedYen,
              reservationOpenDaysBefore: row.reservationOpenDaysBefore,
              isActive: true,
            },
            select: { id: true },
          });
          eventDayIds.push(updated.id);
        } else {
          const created = await tx.eventDay.create({
            data: {
              placeId,
              date,
              label: row.label,
              fixedYenOverride: row.fixedYenOverride,
              hourlyYenOverride: row.hourlyYenOverride,
              busFixedYen: row.busFixedYen,
              reservationOpenDaysBefore: row.reservationOpenDaysBefore,
              isActive: true,
            },
            select: { id: true },
          });
          eventDayIds.push(created.id);
        }
      }

      return {
        reservationRuleId,
        hourlyRuleId,
        eventDayIds,
      };
    });

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