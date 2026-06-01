import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import { calcDateChangePolicy } from "@/lib/settlement-math";
import { sendReservationDateChangedMail } from "@/lib/mail";
import { sendSlackNotification } from "@/lib/slack";

export const runtime = "nodejs";
export const preferredRegion = "hnd1";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const token = String(body?.token ?? "").trim();
    const newDate = String(body?.newDate ?? "").trim();

    if (!token) {
      return NextResponse.json(
        { ok: false, error: "missing_token", message: "token が必要です" },
        { status: 400 }
      );
    }

    if (!newDate || !/^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
      return NextResponse.json(
        {
          ok: false,
          error: "invalid_date",
          message: "新しい日付をYYYY-MM-DD形式で指定してください",
        },
        { status: 400 }
      );
    }

    const reservation = await prisma.reservation.findFirst({
      where: { cancelToken: token },
      include: {
        place: { select: { id: true, name: true, operationMode: true } },
        spot: { select: { id: true, code: true, label: true } },
        changeLogs: { select: { id: true } },
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
        {
          ok: false,
          error: "same_date",
          message: "同じ日付への変更はできません",
        },
        { status: 400 }
      );
    }

    if (!reservation.paidAt) {
      return NextResponse.json(
        {
          ok: false,
          error: "not_paid",
          message: "支払いが完了していないため変更できません",
        },
        { status: 400 }
      );
    }

    // ── バス予約の分岐（24h/1回制限・EVENT_ONLYゲートを適用しない）──
    if (reservation.reservationType === "bus") {
      // 受付窓: 過去日付への変更は不可（JST基準）
      const todayJst = new Date().toLocaleDateString("sv-SE", {
        timeZone: "Asia/Tokyo",
      });
      if (newDate < todayJst) {
        return NextResponse.json(
          {
            ok: false,
            error: "invalid_date",
            message: "過去の日付には変更できません",
          },
          { status: 400 }
        );
      }

      let nextSpotId: string | null = reservation.spotId; // A-20使用時のみ値
      let nextSlot = reservation.slot; // "A-20" or "BUS_LANE"

      // 元予約が A-20 を使っている（hasExtraCar）場合のみ再割当が必要
      if (reservation.spotId) {
        // 1) 変更先日付で A-20 が空いているか
        const a20Taken = await prisma.reservation.findFirst({
          where: {
            spotId: reservation.spotId,
            date: newDate,
            status: { not: "CANCELED" },
            id: { not: reservation.id },
          },
          select: { id: true },
        });

        if (a20Taken) {
          // 2) A-01〜A-19 の空き一般スロットを1つ探す
          const generalCodes = Array.from(
            { length: 19 },
            (_, i) => `A-${String(i + 1).padStart(2, "0")}`
          );

          const candidates = await prisma.spot.findMany({
            where: {
              placeId: reservation.placeId!,
              isActive: true,
              code: { in: generalCodes },
            },
            orderBy: { code: "asc" },
            select: { id: true, code: true },
          });

          const used = await prisma.reservation.findMany({
            where: {
              placeId: reservation.placeId!,
              date: newDate,
              status: { not: "CANCELED" },
              id: { not: reservation.id },
            },
            select: { spotId: true },
          });

          const usedSet = new Set(
            used.map((u) => u.spotId).filter(Boolean) as string[]
          );

          const free = candidates.find((c) => !usedSet.has(c.id));

          if (!free) {
            // 3) A-20も一般空きも無い
            return NextResponse.json(
              {
                ok: false,
                error: "no_availability",
                message: "変更先の日付は満車のため日付変更できません。",
              },
              { status: 409 }
            );
          }

          nextSpotId = free.id;
          nextSlot = free.code; // 例: "A-05"
        }
        // A-20が空いていれば維持（nextSpotId/nextSlot はそのまま）
      }
      // 元が BUS_LANE（spotId=null）→ nextSpotId=null のまま date だけ更新

      await prisma.$transaction([
        prisma.reservation.update({
          where: { id: reservation.id },
          data: { date: newDate, spotId: nextSpotId, slot: nextSlot },
        }),
        prisma.reservationChangeLog.create({
          data: {
            id: crypto.randomUUID(),
            reservationId: reservation.id,
            oldDate: reservation.date,
            newDate,
            changedBy: "customer",
          },
        }),
      ]);

      const busLabel = nextSlot === "BUS_LANE" ? "バス専用レーン" : nextSlot;

      await notifyDateChange(reservation, newDate, busLabel);

      return NextResponse.json({
        ok: true,
        message: "日付を変更しました",
        newDate,
        newSpotLabel: busLabel,
      });
    }

    const dateChangeCount = reservation.changeLogs.length;
    const policy = calcDateChangePolicy(reservation.paidAt, dateChangeCount);

    if (!policy.canChange) {
      const message =
        policy.rule === "already_changed"
          ? "日付変更は1回までです"
          : "日付変更の期限を過ぎています（予約受付から24時間以内）";
      return NextResponse.json(
        { ok: false, error: policy.rule, message },
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
            message:
              "変更先の日付にイベントが登録されていないため予約できません",
          },
          { status: 400 }
        );
      }
    }

    if (reservation.spotId) {
      const existingReservation = await prisma.reservation.findFirst({
        where: {
          spotId: reservation.spotId,
          date: newDate,
          status: "CONFIRMED",
          id: { not: reservation.id },
        },
      });

      if (existingReservation) {
        const usedSpotIds = await prisma.reservation.findMany({
          where: {
            placeId: reservation.placeId!,
            date: newDate,
            status: "CONFIRMED",
            id: { not: reservation.id },
          },
          select: { spotId: true },
        });

        const usedIds = usedSpotIds
          .map((r) => r.spotId)
          .filter(Boolean) as string[];

        const availableSpot = await prisma.spot.findFirst({
          where: {
            placeId: reservation.placeId!,
            isActive: true,
            id: { notIn: usedIds.length > 0 ? usedIds : ["__none__"] },
          },
          orderBy: { code: "asc" },
        });

        if (!availableSpot) {
          return NextResponse.json(
            {
              ok: false,
              error: "no_availability",
              message: "変更先の日付は満車のため予約を変更できません",
            },
            { status: 400 }
          );
        }

        await prisma.$transaction([
          prisma.reservation.update({
            where: { id: reservation.id },
            data: {
              date: newDate,
              spotId: availableSpot.id,
            },
          }),
          prisma.reservationChangeLog.create({
            data: {
              id: crypto.randomUUID(),
              reservationId: reservation.id,
              oldDate: reservation.date,
              newDate,
              changedBy: "customer",
            },
          }),
        ]);

        await notifyDateChange(
          reservation,
          newDate,
          availableSpot.label ?? availableSpot.code
        );

        return NextResponse.json({
          ok: true,
          message: "日付を変更しました",
          newDate,
          newSpotLabel: availableSpot.label ?? availableSpot.code,
        });
      }
    }

    await prisma.$transaction([
      prisma.reservation.update({
        where: { id: reservation.id },
        data: { date: newDate },
      }),
      prisma.reservationChangeLog.create({
        data: {
          id: crypto.randomUUID(),
          reservationId: reservation.id,
          oldDate: reservation.date,
          newDate,
          changedBy: "customer",
        },
      }),
    ]);

    const spotLabel =
      reservation.spot?.label ?? reservation.spot?.code ?? reservation.slot;

    await notifyDateChange(reservation, newDate, spotLabel);

    return NextResponse.json({
      ok: true,
      message: "日付を変更しました",
      newDate,
      newSpotLabel: spotLabel,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { ok: false, error: "server_error", message: "日付変更に失敗しました" },
      { status: 500 }
    );
  }
}

async function notifyDateChange(
  reservation: {
    id: string;
    date: string;
    name: string;
    plate: string;
    email: string | null;
    place?: { name: string } | null;
    spot?: { label: string | null; code: string } | null;
    slot: string;
  },
  newDate: string,
  newSpotLabel: string
) {
  const placeName = reservation.place?.name ?? "-";
  const oldSpotLabel =
    reservation.spot?.label ?? reservation.spot?.code ?? reservation.slot;

  if (reservation.email) {
    try {
      await sendReservationDateChangedMail({
        to: reservation.email,
        placeName,
        spotLabel: newSpotLabel,
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
      "📅 日付変更",
      `駐車場：${placeName}`,
      `スポット：${oldSpotLabel} → ${newSpotLabel}`,
      `顧客：${reservation.name}`,
      `日付：${reservation.date} → ${newDate}`,
    ].join("\n")
  );
}
