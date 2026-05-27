import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { calcCancellationPolicy } from "@/lib/settlement-math";

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

    const policy = calcCancellationPolicy(reservation.price, reservation.date);

    const baseEligible =
      reservation.status === "CONFIRMED" &&
      reservation.paid === true &&
      reservation.checkedIn === false &&
      reservation.canceledAt == null;

    const canCancel = baseEligible && policy.canCancel;

    let message: string;
    if (reservation.checkedIn) {
      message = "チェックイン済みのためキャンセルできません";
    } else if (reservation.status === "CANCELED") {
      message = "すでにキャンセル済みです";
    } else if (!policy.canCancel) {
      message = "利用日の48時間前を過ぎているためキャンセルできません";
    } else if (canCancel) {
      message = "キャンセル可能です";
    } else {
      message = "キャンセルできません";
    }

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
        pin: reservation.pin,
        status: reservation.status,
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
      policy:
        reservation.status === "CANCELED"
          ? {
              rule: null,
              canCancel: false,
              cancelFee: Math.max(
                0,
                reservation.price - (reservation.refundAmount ?? 0)
              ),
              refundFee: 0,
              refundAmount: reservation.refundAmount ?? 0,
            }
          : policy,
      message,
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
