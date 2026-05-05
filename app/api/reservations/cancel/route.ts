import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import { stripe } from "@/lib/stripe";
import { sendReservationCanceledMail } from "@/lib/mail";
import { sendSlackNotification } from "@/lib/slack";
import { calcCancellationPolicy } from "@/lib/settlement-math";

export const runtime = "nodejs";
export const preferredRegion = "hnd1";

function formatJst(date: Date) {
  return date.toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
  });
}

function calcDeltaAmounts(
  refundAmount: number,
  ownerRateBps: number,
  agentRateBps: number,
  platformRateBps: number
) {
  const ownerDeltaAmount = -Math.round((refundAmount * ownerRateBps) / 10000);
  const agentDeltaAmount = -Math.round((refundAmount * agentRateBps) / 10000);
  const platformDeltaAmount =
    -refundAmount - ownerDeltaAmount - agentDeltaAmount;

  return {
    ownerDeltaAmount,
    agentDeltaAmount,
    platformDeltaAmount,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const token = String(body?.token ?? "").trim();

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
        place: true,
        spot: true,
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

    if (reservation.status === "CANCELED") {
      return NextResponse.json({
        ok: true,
        alreadyCanceled: true,
        message: "すでにキャンセル済みです",
      });
    }

    if (reservation.checkedIn) {
      return NextResponse.json(
        {
          ok: false,
          error: "already_checked_in",
          message: "チェックイン済みのためキャンセル不可",
        },
        { status: 409 }
      );
    }

    const policy = calcCancellationPolicy(reservation.price, reservation.date);
    const canceledAt = new Date();

    const payment = await prisma.payment.findFirst({
      where: {
        reservationId: reservation.id,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    let refundStatus:
      | "NONE"
      | "PENDING"
      | "SUCCEEDED"
      | "FAILED"
      | "NOT_REQUIRED" = "NOT_REQUIRED";

    let stripeRefundId: string | null = null;

    if (policy.refundAmount > 0 && payment?.paymentIntentId) {
      try {
        const refund = await stripe.refunds.create({
          payment_intent: payment.paymentIntentId,
          amount: policy.refundAmount,
          reason: "requested_by_customer",
          metadata: {
            reservationId: reservation.id,
            useDate: reservation.date,
            slot: reservation.slot,
          },
        });

        stripeRefundId = refund.id;
        refundStatus = "SUCCEEDED";
      } catch (e) {
        console.error(e);
        refundStatus = "FAILED";
      }
    }

    await prisma.reservation.update({
      where: {
        id: reservation.id,
      },
      data: {
        status: "CANCELED",
        canceledAt,
        cancelRequestedAt: canceledAt,
        refundStatus,
        refundAmount: policy.refundAmount,
      },
    });

    if (payment?.id && refundStatus === "SUCCEEDED") {
      await prisma.payment.update({
        where: {
          id: payment.id,
        },
        data: {
          refunded: true,
          memo: [
            "AUTO_REFUND",
            `refundAmount=${policy.refundAmount}`,
            stripeRefundId ? `stripeRefundId=${stripeRefundId}` : null,
          ]
            .filter(Boolean)
            .join("\n"),
          updatedAt: canceledAt,
        },
      });

      const { ownerDeltaAmount, agentDeltaAmount, platformDeltaAmount } =
        calcDeltaAmounts(
          policy.refundAmount,
          payment.ownerRateBps,
          payment.agentRateBps,
          payment.platformRateBps
        );

      const recognizedDate = new Date();

      const recognizedMonth = recognizedDate
        .toLocaleDateString("sv-SE", {
          timeZone: "Asia/Tokyo",
        })
        .slice(0, 7);

      await prisma.adjustment.create({
        data: {
          id: crypto.randomUUID(),

          paymentId: payment.id,

          kind:
            policy.refundAmount === payment.grossAmount
              ? "REFUND_FULL"
              : "REFUND_PARTIAL",

          status: "CONFIRMED",

          recognizedDate,
          recognizedMonth,

          grossDeltaAmount: -policy.refundAmount,

          ownerDeltaAmount,
          agentDeltaAmount,
          platformDeltaAmount,

          reason: "customer_cancel",

          note: [
            `reservationId=${reservation.id}`,
            `cancelRule=${policy.rule}`,
            `refundAmount=${policy.refundAmount}`,
          ].join("\n"),

          createdBy: "system",

          createdAt: recognizedDate,
          updatedAt: recognizedDate,
        },
      });
    }

    if (reservation.email) {
      try {
        await sendReservationCanceledMail({
          to: reservation.email,
          placeName: reservation.place?.name ?? "-",
          spotLabel:
            reservation.spot?.label ??
            reservation.spot?.code ??
            reservation.slot,
          date: reservation.date,
          slot: reservation.slot,
          name: reservation.name,
          plate: reservation.plate,
          canceledAt: formatJst(canceledAt),
          refundAmount: policy.refundAmount,
          cancelFee: policy.cancelFee,
          refundFee: policy.refundFee,
        });
      } catch (e) {
        console.error(e);
      }
    }

    await sendSlackNotification(
      [
        "❌ キャンセル",
        `駐車場：${reservation.place?.name ?? "-"}`,
        `スポット：${
          reservation.spot?.label ?? reservation.spot?.code ?? reservation.slot
        }`,
        `顧客：${reservation.name}`,
        `返金額：¥${policy.refundAmount.toLocaleString("ja-JP")}`,
      ].join("\n")
    );

    return NextResponse.json({
      ok: true,
      message: "キャンセル完了",
      refundStatus,
      refundAmount: policy.refundAmount,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        ok: false,
        error: "server_error",
      },
      { status: 500 }
    );
  }
}
