export const runtime = "nodejs";
export const preferredRegion = "hnd1";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const reservationId = (url.searchParams.get("reservationId") ?? "").trim();
  if (!reservationId) {
    return NextResponse.json(
      { ok: false, error: "reservationId_required" },
      { status: 400 }
    );
  }

  // Payment record is the authoritative source (latest by createdAt)
  const payment = await prisma.payment.findFirst({
    where: { reservationId },
    orderBy: { createdAt: "desc" },
    select: { paymentRef: true },
  });
  if (payment?.paymentRef) {
    return NextResponse.json({ ok: true, paymentRef: payment.paymentRef });
  }

  // Fallback: reservation may carry its own paymentRef
  const reservation = await prisma.reservation.findUnique({
    where: { id: reservationId },
    select: { paymentRef: true },
  });
  if (reservation?.paymentRef) {
    return NextResponse.json({ ok: true, paymentRef: reservation.paymentRef });
  }

  return NextResponse.json(
    { ok: false, error: "paymentRef_not_found" },
    { status: 404 }
  );
}
