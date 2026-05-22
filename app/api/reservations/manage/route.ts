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

    const canCancel =
      reservation.status === "CONFIRMED" &&
      reservation.paid === true &&
      reservation.checkedIn === false &&
      reservation.canceledAt == null;

    const policy = calcCancellationPolicy(
      reservation.price,
      reservation.date,
      undefined,
      reservation.paidAt
    );

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
