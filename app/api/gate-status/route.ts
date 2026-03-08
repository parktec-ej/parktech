import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

function ymdTodayJst() {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}

export async function GET(req: Request) {
  const url = new URL(req.url);

  const slot = url.searchParams.get("slot");
  const date = url.searchParams.get("date") ?? ymdTodayJst();

  if (!slot) {
    return NextResponse.json(
      { ok: false, error: "slot_required" },
      { status: 400 }
    );
  }

  const r = await prisma.reservation.findFirst({
    where: { date, slot },
    select: {
      id: true,
      paid: true,
      checkedIn: true,
      checkedInAt: true,
      checkedOutAt: true,
    },
  });

  if (!r) {
    return NextResponse.json({
      ok: true,
      mode: "no_reservation",
      slot,
      date,
    });
  }

  if (!r.paid) {
    return NextResponse.json({
      ok: true,
      mode: "unpaid",
      slot,
      date,
      reservationId: r.id,
    });
  }

  if (!r.checkedIn) {
    return NextResponse.json({
      ok: true,
      mode: "need_pin_checkin",
      slot,
      date,
      reservationId: r.id,
    });
  }

  if (!r.checkedOutAt) {
    return NextResponse.json({
      ok: true,
      mode: "can_checkout",
      slot,
      date,
      reservationId: r.id,
      checkedInAt: r.checkedInAt,
    });
  }

  return NextResponse.json({
    ok: true,
    mode: "already_checked_out",
    slot,
    date,
    reservationId: r.id,
  });
}