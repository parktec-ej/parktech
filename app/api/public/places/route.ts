export const runtime = "nodejs";
export const preferredRegion = "hnd1";
export const revalidate = 60;

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// PricingRule 未設定時のフォールバック（pricing-core.ts と同値）
const DEFAULT_RESERVATION_FEE_YEN = 3000;
const DEFAULT_HOURLY_YEN = 500;

export async function GET() {
  const startedAt = Date.now();
  console.log("[public/places] start");
  try {
    const hiddenSlugs = [process.env.PARTNER_BUS_PLACE_SLUG]
      .map((s) => (typeof s === "string" ? s.trim() : s))
      .filter((s): s is string => typeof s === "string" && s.length > 0);

    const places = await prisma.place.findMany({
      where: {
        isActive: true,
        ...(hiddenSlugs.length > 0
          ? { slug: { notIn: hiddenSlugs } }
          : {}),
      },
      orderBy: [{ createdAt: "asc" }],
      select: {
        id: true,
        slug: true,
        name: true,
        address: true,
        operationMode: true,
      },
    });

    // 各拠点の「通常料金」を PricingRule から一括取得。
    // イベント日 override は載せない基準価格（HP一覧は通常料金を表示するため）。
    const placeIds = places.map((p) => p.id);
    const rules = placeIds.length
      ? await prisma.pricingRule.findMany({
          where: { placeId: { in: placeIds }, isActive: true },
          orderBy: { createdAt: "desc" },
          select: {
            placeId: true,
            pricingType: true,
            fixedYen: true,
            hourlyYen: true,
            dailyYen: true,
          },
        })
      : [];

    // createdAt desc 済みなので、最初に見つかった行が最新
    // （pricing-core の getReservationFixedPrice / getHourlyRate と同じ選び方）
    const withPricing = places.map((p) => {
      const fixedRule = rules.find(
        (r) => r.placeId === p.id && r.pricingType === "RESERVATION_FIXED"
      );
      const hourlyRule = rules.find(
        (r) => r.placeId === p.id && r.pricingType === "HOURLY"
      );
      return {
        ...p,
        reservationFeeYen:
          fixedRule?.fixedYen ?? DEFAULT_RESERVATION_FEE_YEN,
        hourlyYen: hourlyRule?.hourlyYen ?? DEFAULT_HOURLY_YEN,
        dailyYen: hourlyRule?.dailyYen ?? null,
      };
    });

    return NextResponse.json({
      ok: true,
      places: withPricing,
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        error: "internal_error",
        message: String(e?.message ?? e),
      },
      { status: 500 }
    );
  } finally {
    console.log("[public/places] done", { ms: Date.now() - startedAt });
  }
}
