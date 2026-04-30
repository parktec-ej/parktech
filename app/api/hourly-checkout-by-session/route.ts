export const runtime = "nodejs";
export const preferredRegion = "hnd1";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { stripe } from "@/lib/stripe";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("session_id");

  if (!sessionId) {
    return NextResponse.json(
      {
        ok: false,
        error: "session_id_missing",
        message: "session_id がありません",
      },
      { status: 400 }
    );
  }

  try {
    const checkoutSession = await stripe.checkout.sessions.retrieve(sessionId);

    if (checkoutSession.payment_status !== "paid") {
      return NextResponse.json(
        {
          ok: false,
          error: "not_paid",
          message: "決済が完了していません",
        },
        { status: 402 }
      );
    }

    if (checkoutSession.metadata?.flow !== "hourly_checkout") {
      return NextResponse.json(
        {
          ok: false,
          error: "invalid_flow",
          message: "時間貸し決済のセッションではありません",
        },
        { status: 400 }
      );
    }

    const paymentIntentId =
      typeof checkoutSession.payment_intent === "string"
        ? checkoutSession.payment_intent
        : null;

    const parkingSessionId = String(
      checkoutSession.metadata?.parkingSessionId ?? ""
    ).trim();

    let parkingSession = await prisma.parkingSession.findFirst({
      where: {
        OR: [
          { paymentRef: paymentIntentId ?? "" },
          { paymentRef: checkoutSession.id },
        ],
      },
      orderBy: {
        createdAt: "desc",
      },
      select: {
        id: true,
        placeId: true,
        spotId: true,
        totalMinutes: true,
        totalYen: true,
        paid: true,
        paidAt: true,
        paymentRef: true,
        checkOutAt: true,
        status: true,
        spot: {
          select: {
            code: true,
            label: true,
          },
        },
        place: {
          select: {
            slug: true,
            name: true,
          },
        },
      },
    });

    if (!parkingSession && parkingSessionId) {
      parkingSession = await prisma.parkingSession.findUnique({
        where: {
          id: parkingSessionId,
        },
        select: {
          id: true,
          placeId: true,
          spotId: true,
          totalMinutes: true,
          totalYen: true,
          paid: true,
          paidAt: true,
          paymentRef: true,
          checkOutAt: true,
          status: true,
          spot: {
            select: {
              code: true,
              label: true,
            },
          },
          place: {
            select: {
              slug: true,
              name: true,
            },
          },
        },
      });
    }

    if (!parkingSession) {
      return NextResponse.json(
        {
          ok: false,
          error: "parking_session_not_found",
          message: "時間貸しセッションが見つかりません",
          debug: {
            sessionId,
            paymentIntentId,
            parkingSessionId,
          },
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      parkingSession,
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        error: "server_error",
        message: String(e?.message ?? e),
      },
      { status: 500 }
    );
  }
}