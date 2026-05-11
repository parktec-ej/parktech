export const runtime = "nodejs";
export const preferredRegion = "hnd1";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminSession } from "@/lib/admin-auth";

const LIMIT = 20;

export async function GET(req: Request) {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 }
    );
  }

  try {
    const url = new URL(req.url);
    const q = (url.searchParams.get("q") ?? "").trim();

    if (!q) {
      return NextResponse.json({
        ok: true,
        q: "",
        reservations: [],
        parkingSessions: [],
        payments: [],
      });
    }

    const insensitive = { mode: "insensitive" as const };

    const [reservations, parkingSessions, payments] = await Promise.all([
      prisma.reservation.findMany({
        where: {
          OR: [
            { name: { contains: q, ...insensitive } },
            { plate: { contains: q, ...insensitive } },
            { email: { contains: q, ...insensitive } },
            { phone: { contains: q } },
            { pin: { contains: q } },
            { slot: { contains: q, ...insensitive } },
            { paymentRef: { contains: q } },
            { place: { slug: { contains: q, ...insensitive } } },
            { place: { name: { contains: q, ...insensitive } } },
          ],
        },
        take: LIMIT,
        orderBy: { createdAt: "desc" },
        include: {
          place: { select: { id: true, slug: true, name: true } },
          spot: { select: { id: true, code: true, label: true } },
          sessions: {
            where: { status: "IN", checkOutAt: null },
            orderBy: { checkInAt: "desc" },
            take: 1,
            select: { id: true },
          },
        },
      }),
      prisma.parkingSession.findMany({
        where: {
          OR: [
            { customerName: { contains: q, ...insensitive } },
            { plate: { contains: q, ...insensitive } },
            { phone: { contains: q } },
            { paymentRef: { contains: q } },
            { place: { slug: { contains: q, ...insensitive } } },
            { place: { name: { contains: q, ...insensitive } } },
            { spot: { code: { contains: q, ...insensitive } } },
            { spot: { label: { contains: q, ...insensitive } } },
          ],
        },
        take: LIMIT,
        orderBy: { checkInAt: "desc" },
        include: {
          place: { select: { id: true, slug: true, name: true } },
          spot: { select: { id: true, code: true, label: true } },
          reservation: {
            select: { id: true, name: true, email: true, phone: true, pin: true },
          },
        },
      }),
      prisma.payment.findMany({
        where: {
          OR: [
            { customerNameSnapshot: { contains: q, ...insensitive } },
            { plateSnapshot: { contains: q, ...insensitive } },
            { paymentRef: { contains: q } },
            { paymentIntentId: { contains: q } },
            { placeNameSnapshot: { contains: q, ...insensitive } },
          ],
        },
        take: LIMIT,
        orderBy: { recognizedDate: "desc" },
        select: {
          id: true,
          paymentRef: true,
          paymentIntentId: true,
          kind: true,
          status: true,
          refunded: true,
          recognizedDate: true,
          serviceDate: true,
          placeNameSnapshot: true,
          spotLabelSnapshot: true,
          spotCodeSnapshot: true,
          customerNameSnapshot: true,
          plateSnapshot: true,
          grossAmount: true,
          reservationId: true,
          parkingSessionId: true,
        },
      }),
    ]);

    return NextResponse.json({
      ok: true,
      q,
      reservations: reservations.map((r) => ({
        id: r.id,
        date: r.date,
        slot: r.slot,
        name: r.name,
        plate: r.plate,
        email: r.email,
        phone: r.phone,
        pin: r.pin,
        paid: r.paid,
        checkedIn: r.checkedIn,
        checkedInAt: r.checkedInAt,
        checkedOutAt: r.checkedOutAt,
        status: r.status,
        paymentRef: r.paymentRef,
        place: r.place,
        spot: r.spot,
        activeSession: r.sessions[0]
          ? { id: r.sessions[0].id }
          : null,
      })),
      parkingSessions: parkingSessions.map((s) => ({
        id: s.id,
        sessionType: s.sessionType,
        status: s.status,
        plate: s.plate,
        phone: s.phone,
        customerName: s.customerName,
        checkInAt: s.checkInAt,
        checkOutAt: s.checkOutAt,
        totalMinutes: s.totalMinutes,
        totalYen: s.totalYen,
        paid: s.paid,
        paymentRef: s.paymentRef,
        place: s.place,
        spot: s.spot,
        reservation: s.reservation,
      })),
      payments,
    });
  } catch (error) {
    console.error("[admin/emergency/search] error:", error);
    return NextResponse.json(
      {
        ok: false,
        error: "server_error",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
