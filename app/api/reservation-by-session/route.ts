export const runtime = "nodejs";
export const preferredRegion = "hnd1";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { stripe } from "@/lib/stripe";

function normalizeSlot(input: string): string {
  if (!input) return "";

  const v = input.trim().toUpperCase();

  const s = v.match(/^S(\d{1,2})$/i);
  if (s) return `S${String(Number(s[1])).padStart(2, "0")}`;

  const a = v.match(/^([A-Z])[- ]?(\d{1,2})$/i);
  if (a) return `${a[1].toUpperCase()}-${String(Number(a[2])).padStart(2, "0")}`;

  return v;
}

// 通常予約・バス予約 success が共用する返却フィールド。
// price とバス予約用カラムを含む（追加のみ。通常予約ページは未使用分を無視）。
const reservationSelect = {
  id: true,
  placeId: true,
  spotId: true,
  date: true,
  slot: true,
  name: true,
  plate: true,
  email: true,
  pin: true,
  paid: true,
  checkedIn: true,
  checkedInAt: true,
  checkedOutAt: true,
  paymentRef: true,
  price: true,
  reservationType: true,
  vehicleType: true,
  hasExtraCar: true,
  eventName: true,
  arrivalTime: true,
} as const;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("session_id");

  if (!sessionId) {
    return NextResponse.json(
      { ok: false, error: "session_id_missing", message: "session_id missing" },
      { status: 400 }
    );
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== "paid") {
      return NextResponse.json(
        { ok: false, error: "not_paid", message: "payment not completed" },
        { status: 402 }
      );
    }

    const paymentIntentId =
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : null;

    const placeKey = String(session.metadata?.placeId ?? "").trim();
    const spotId = String(session.metadata?.spotId ?? "").trim();
    const date = String(session.metadata?.date ?? "").trim();
    const slot = normalizeSlot(String(session.metadata?.slot ?? "").trim());

    let reservation = await prisma.reservation.findFirst({
      where: {
        paid: true,
        OR: [
          { paymentRef: paymentIntentId ?? "" },
          { paymentRef: session.id },
        ],
      },
      orderBy: {
        createdAt: "desc",
      },
      select: reservationSelect,
    });

    if (!reservation && placeKey) {
      const place = await prisma.place.findFirst({
        where: {
          OR: [{ id: placeKey }, { slug: placeKey }],
        },
        select: {
          id: true,
        },
      });

      if (place) {
        if (spotId && date) {
          reservation = await prisma.reservation.findFirst({
            where: {
              paid: true,
              placeId: place.id,
              spotId,
              date,
            },
            orderBy: {
              createdAt: "desc",
            },
            select: reservationSelect,
          });
        }

        if (!reservation && date && slot) {
          reservation = await prisma.reservation.findFirst({
            where: {
              paid: true,
              placeId: place.id,
              date,
              slot,
            },
            orderBy: {
              createdAt: "desc",
            },
            select: reservationSelect,
          });
        }
      }
    }

    if (!reservation) {
      return NextResponse.json(
        {
          ok: false,
          error: "reservation_not_found",
          message: "reservation not found",
          debug: {
            sessionId,
            paymentIntentId,
            sessionIdAsPaymentRef: session.id,
            placeKey,
            spotId,
            date,
            slot,
          },
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      reservation,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "server_error", message: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}