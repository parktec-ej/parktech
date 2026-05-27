import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { calcCancellationPolicy, calcDateChangePolicy } from "@/lib/settlement-math";

export const runtime = "nodejs";
export const preferredRegion = "hnd1";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const token = String(url.searchParams.get("token") ?? "").trim();

    if (!token) {
      return NextResponse.json(
        {
          ok: false,
          error: "missing_token",
          message: "token が必要です",
        },
        { status: 400 }
      );
    }

    const reservation = await prisma.reservation.findFirst({
      where: {
        cancelToken: token,
      },
      include: {
        place: {
          select: {
            id: true,
            name: true,
          },
        },
        spot: {
          select: {
            id: true,
            code: true,
            label: true,
          },
        },
        changeLogs: {
          select: { id: true },
        },
      },
    });

    if (!reservation) {
      return NextResponse.json(
        {
          ok: false,
          error: "not_found",
          message: "予約が見つかりません",
        },
        { status: 404 }
      );
    }

    const policy = calcCancellationPolicy(
      reservation.price,
      reservation.date
    );

    const canCancel =
      policy.canCancel &&
      reservation.status === "CONFIRMED" &&
      reservation.paid === true &&
      reservation.checkedIn === false &&
      reservation.canceledAt == null;

    const dateChangeCount = reservation.changeLogs.length;
    const dateChangePolicy =
      reservation.paidAt &&
      reservation.status === "CONFIRMED" &&
      reservation.checkedIn === false &&
      reservation.canceledAt == null
        ? calcDateChangePolicy(reservation.paidAt, dateChangeCount)
        : { rule: "too_late" as const, canChange: false, deadline: new Date() };

    return NextResponse.json({
      ok: true,
      reservation: {
        id: reservation.id,
        date: reservation.date,
        slot: reservation.slot,
        name: reservation.name,
        plate: reservation.plate,
        email: reservation.email,
        price: reservation.price,
        status: reservation.status,
        pin: reservation.pin ?? null,
        checkedIn: reservation.checkedIn,
        checkedInAt: reservation.checkedInAt,
        checkedOutAt: reservation.checkedOutAt,
        canceledAt: reservation.canceledAt,
        refundStatus: reservation.refundStatus,
        refundAmount: reservation.refundAmount,
        placeName: reservation.place?.name ?? reservation.placeId,
        spotLabel:
          reservation.spot?.label ??
          reservation.spot?.code ??
          reservation.slot,
      },
      canCancel,
      policy: {
        rule: policy.rule,
        canCancel: policy.canCancel,
        cancelFee: canCancel ? policy.cancelFee : 0,
        refundAmount: canCancel ? policy.refundAmount : 0,
      },
      dateChange: {
        canChange: dateChangePolicy.canChange,
        rule: dateChangePolicy.rule,
        dateChangeCount,
      },
      message: canCancel
        ? "キャンセル可能です"
        : reservation.checkedIn
        ? "チェックイン済みのためキャンセルできません"
        : reservation.status === "CANCELED"
        ? "すでにキャンセル済みです"
        : "キャンセルできません",
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      {
        ok: false,
        error: "server_error",
        message: "予約情報の取得に失敗しました",
      },
      { status: 500 }
    );
  }
}
