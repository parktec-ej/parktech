import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

function parseYmdAsJstDate(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function startOfTodayJst() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function calcCancellationPolicy(price: number, useDate: string) {
  const refundFee = 300;

  const today = startOfTodayJst();
  const useDateObj = parseYmdAsJstDate(useDate);

  const diffMs = useDateObj.getTime() - today.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays >= 2) {
    const cancelFee = Math.floor(price * 0.5);
    const refundAmount = Math.max(0, price - cancelFee - refundFee);

    return {
      rule: "until_2_days_before",
      cancelFee,
      refundFee,
      refundAmount,
    };
  }

  return {
    rule: "day_before_or_same_day",
    cancelFee: price,
    refundFee: 0,
    refundAmount: 0,
  };
}

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

    const canCancel =
      reservation.status === "CONFIRMED" &&
      reservation.paid === true &&
      reservation.checkedIn === false &&
      reservation.canceledAt == null;

    const policy = calcCancellationPolicy(reservation.price, reservation.date);

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
      policy: canCancel
        ? policy
        : {
            rule: null,
            cancelFee:
              reservation.status === "CANCELED"
                ? Math.max(
                    0,
                    reservation.price - (reservation.refundAmount ?? 0)
                  )
                : 0,
            refundFee: 0,
            refundAmount: reservation.refundAmount ?? 0,
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