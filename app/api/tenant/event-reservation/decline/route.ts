export const runtime = "nodejs";
export const preferredRegion = "hnd1";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendSlackNotification } from "@/lib/slack";
import { getTenantSession } from "@/lib/tenant-auth";
import { ymdToUtcDate } from "@/lib/pricing-core";

function jsonError(message: string, status = 400, error?: string) {
  return NextResponse.json(
    { ok: false, error: error ?? "bad_request", message },
    { status }
  );
}
function normalizeDate(input: string) {
  const v = String(input ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  if (/^\d{8}$/.test(v)) return `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`;
  return v;
}

export async function POST(req: NextRequest) {
  const session = await getTenantSession();
  if (!session) return jsonError("ログインが必要です", 401, "unauthorized");

  try {
    const body = await req.json().catch(() => ({}));
    const date = normalizeDate(body?.date ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return jsonError("date は YYYY-MM-DD 形式で指定してください", 400, "invalid_date");
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: session.tenantId },
      include: {
        contracts: { include: { place: true }, orderBy: { createdAt: "desc" } },
      },
    });
    if (!tenant) return jsonError("契約者が見つかりません", 404, "tenant_not_found");

    const contract = tenant.contracts.find((c) => c.status === "ACTIVE") ?? null;
    if (!contract || !contract.spotId || !contract.place) {
      return jsonError("有効な契約がありません", 403, "no_active_contract");
    }
    const place = contract.place;

    const eventDay = await prisma.eventDay.findFirst({
      where: { placeId: place.id, date: ymdToUtcDate(date), isActive: true },
      select: { id: true },
    });
    if (!eventDay) {
      return jsonError("指定日はイベント開催日ではありません", 409, "not_event_day");
    }

    const reserved = await prisma.reservation.findFirst({
      where: { spotId: contract.spotId, date, status: "CONFIRMED" },
      select: { id: true },
    });
    if (reserved) {
      return jsonError("この日は予約済みのため、利用しない手続きはできません", 409, "already_reserved");
    }

    await prisma.monthlyEventResponse.upsert({
      where: { contractId_date: { contractId: contract.id, date } },
      update: { status: "DECLINED", respondedAt: new Date() },
      create: {
        contractId: contract.id,
        placeId: place.id,
        spotId: contract.spotId,
        date,
        status: "DECLINED",
        respondedAt: new Date(),
      },
    });

    await prisma.spotModeCalendar.upsert({
      where: { spotId_date: { spotId: contract.spotId, date } },
      update: { operationMode: "RESERVATION_ONLY" },
      create: {
        placeId: place.id,
        spotId: contract.spotId,
        date,
        operationMode: "RESERVATION_ONLY",
      },
    });

    await sendSlackNotification(
      `【月極・利用しない】${tenant.name} さんが ${date} のイベント日を「利用しない」と回答（契約者ページ）。区画を一般開放しました。`
    ).catch(() => {});

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[tenant/event-reservation/decline] error:", error);
    return jsonError("処理に失敗しました", 500, "server_error");
  }
}
