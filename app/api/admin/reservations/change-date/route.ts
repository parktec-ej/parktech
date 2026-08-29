export const runtime = "nodejs";
export const preferredRegion = "hnd1";

import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import { getAdminSession } from "@/lib/admin-auth";
import { sendReservationDateChangedMail } from "@/lib/mail";
import { sendSlackAlert, sendSlackNotification } from "@/lib/slack";
import { syncPaymentAfterDateChange } from "@/lib/reservation-date-change";

export async function POST(req: Request) {
  const admin = await getAdminSession();

  if (!admin) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 }
    );
  }

  try {
    const body = await req.json().catch(() => null);

    if (!body) {
      return NextResponse.json(
        { ok: false, error: "invalid_json" },
        { status: 400 }
      );
    }

    const reservationId = String(body.reservationId ?? "").trim();
    const newDate = String(body.newDate ?? "").trim();
    const reason = String(body.reason ?? "管理者による代理変更").trim();

    if (!reservationId) {
      return NextResponse.json(
        {
          ok: false,
          error: "reservation_id_required",
          message: "予約IDが必要です",
        },
        { status: 400 }
      );
    }

    if (!newDate || !/^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
      return NextResponse.json(
        {
          ok: false,
          error: "invalid_date",
          message: "日付をYYYY-MM-DD形式で指定してください",
        },
        { status: 400 }
      );
    }

    const reservation = await prisma.reservation.findUnique({
      where: { id: reservationId },
      include: {
        place: { select: { id: true, name: true, operationMode: true } },
        spot: { select: { id: true, code: true, label: true } },
      },
    });

    if (!reservation) {
      return NextResponse.json(
        { ok: false, error: "not_found", message: "予約が見つかりません" },
        { status: 404 }
      );
    }

    if (reservation.status === "CANCELED") {
      return NextResponse.json(
        { ok: false, error: "canceled", message: "キャンセル済みの予約です" },
        { status: 400 }
      );
    }

    if (reservation.checkedIn) {
      return NextResponse.json(
        {
          ok: false,
          error: "already_checked_in",
          message: "チェックイン済みのため変更できません",
        },
        { status: 409 }
      );
    }

    if (reservation.date === newDate) {
      return NextResponse.json(
        { ok: false, error: "same_date", message: "同じ日付です" },
        { status: 400 }
      );
    }

    if (
      reservation.place?.operationMode === "EVENT_ONLY" &&
      reservation.placeId
    ) {
      const [y, m, d] = newDate.split("-").map(Number);
      const newDateStart = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
      const newDateEnd = new Date(Date.UTC(y, m - 1, d, 23, 59, 59));

      const eventDay = await prisma.eventDay.findFirst({
        where: {
          placeId: reservation.placeId,
          date: { gte: newDateStart, lte: newDateEnd },
          isActive: true,
        },
      });

      if (!eventDay) {
        return NextResponse.json(
          {
            ok: false,
            error: "no_event_day",
            message: "変更先の日付にイベントがありません",
          },
          { status: 400 }
        );
      }
    }

    let finalSpotId = reservation.spotId;
    let finalSpotLabel =
      reservation.spot?.label ?? reservation.spot?.code ?? reservation.slot;

    if (reservation.spotId) {
      const existing = await prisma.reservation.findFirst({
        where: {
          spotId: reservation.spotId,
          date: newDate,
          status: "CONFIRMED",
          id: { not: reservation.id },
        },
      });

      if (existing) {
        const usedSpots = await prisma.reservation.findMany({
          where: {
            placeId: reservation.placeId!,
            date: newDate,
            status: "CONFIRMED",
            id: { not: reservation.id },
          },
          select: { spotId: true },
        });

        const usedIds = usedSpots
          .map((r) => r.spotId)
          .filter(Boolean) as string[];

        const available = await prisma.spot.findFirst({
          where: {
            placeId: reservation.placeId!,
            isActive: true,
            id: { notIn: usedIds.length > 0 ? usedIds : ["__none__"] },
          },
          orderBy: { code: "asc" },
        });

        if (!available) {
          return NextResponse.json(
            {
              ok: false,
              error: "no_availability",
              message: "変更先の日付は満車です",
            },
            { status: 400 }
          );
        }

        finalSpotId = available.id;
        finalSpotLabel = available.label ?? available.code;
      }
    }

    await prisma.reservation.update({
      where: { id: reservation.id },
      data: {
        date: newDate,
        ...(finalSpotId !== reservation.spotId ? { spotId: finalSpotId } : {}),
      },
    });

    // ログが欠けると「日付変更は1回まで」の判定（changeLogs.length）を
    // すり抜けられるため、失敗しても処理は続けつつ検知できるようにする。
    try {
      await prisma.reservationChangeLog.create({
        data: {
          id: crypto.randomUUID(),
          reservationId: reservation.id,
          oldDate: reservation.date,
          newDate,
          changedBy: "admin",
          reason,
        },
      });
    } catch (e) {
      console.error("Reservation change log failed:", e);

      await sendSlackAlert(
        [
          "⚠️ 日付変更ログの記録に失敗（変更回数制限がすり抜ける可能性）",
          `予約ID：${reservation.id}`,
          `旧日付：${reservation.date}`,
          `新日付：${newDate}`,
          "操作者：管理者",
        ].join("\n")
      );
    }

    try {
      await syncPaymentAfterDateChange({
        reservationId: reservation.id,
        oldDate: reservation.date,
        newDate,
        newSpotId: finalSpotId,
      });
    } catch (e) {
      console.error("Payment sync after date change failed:", e);
    }

    if (reservation.email) {
      try {
        await sendReservationDateChangedMail({
          to: reservation.email,
          placeName: reservation.place?.name ?? "-",
          spotLabel: finalSpotLabel,
          oldDate: reservation.date,
          newDate,
          name: reservation.name,
          plate: reservation.plate,
        });
      } catch (e) {
        console.error("Date change mail failed:", e);
      }
    }

    await sendSlackNotification(
      [
        "📅 代理日付変更（管理者）",
        `駐車場：${reservation.place?.name ?? "-"}`,
        `顧客：${reservation.name}`,
        `日付：${reservation.date} → ${newDate}`,
        `区画：${reservation.spot?.label ?? reservation.spot?.code ?? "-"} → ${finalSpotLabel}`,
        `理由：${reason}`,
      ].join("\n")
    );

    return NextResponse.json({
      ok: true,
      message: "日付を変更しました",
      newDate,
      newSpotLabel: finalSpotLabel,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("POST /api/admin/reservations/change-date error:", e);
    return NextResponse.json(
      { ok: false, error: "server_error", message },
      { status: 500 }
    );
  }
}
