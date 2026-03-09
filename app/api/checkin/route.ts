import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

function ymdTodayJst() {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}

function normalizeDate(input: string): string {
  if (!input) return input;
  if (/^\d{8}$/.test(input)) {
    return `${input.slice(0, 4)}-${input.slice(4, 6)}-${input.slice(6, 8)}`;
  }
  return input;
}

function normalizeSlot(input: string): string {
  if (!input) return input.trim();

  const v = input.trim().toUpperCase();

  // 旧形式 S1 -> S01
  const s = v.match(/^S(\d{1,2})$/i);
  if (s) {
    return `S${String(Number(s[1])).padStart(2, "0")}`;
  }

  // 新形式 A1 / A01 / A-1 -> A-01
  const a = v.match(/^([A-Z])[- ]?(\d{1,2})$/i);
  if (a) {
    return `${a[1].toUpperCase()}-${String(Number(a[2])).padStart(2, "0")}`;
  }

  return v;
}

function jsonError(message: string, status = 400, extra?: any) {
  return NextResponse.json(
    { ok: false, error: message, ...(extra ? { extra } : {}) },
    { status }
  );
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) return jsonError("JSONが壊れてます", 400);

    const date = normalizeDate(String(body.date ?? ymdTodayJst()));
    const slot = normalizeSlot(String(body.slot ?? ""));
    const pin = String(body.pin ?? "").trim();

    if (!slot) return jsonError("slot は必須です", 400);

    const r = await prisma.reservation.findFirst({
      where: { date, slot },
      select: {
        id: true,
        pin: true,
        paid: true,
        checkedIn: true,
        checkedInAt: true,
        placeId: true,
        spotId: true,
      },
    });

    if (!r) {
      return NextResponse.json(
        {
          ok: false,
          error: "no_reservation",
          message: "予約がありません。支払い入庫へ進んでください。",
          date,
          slot,
        },
        { status: 404 }
      );
    }

    if (!r.paid) {
      return NextResponse.json(
        {
          ok: false,
          error: "unpaid",
          message: "未決済です。支払いを完了してください。",
          date,
          slot,
        },
        { status: 402 }
      );
    }

    if (r.checkedIn) {
      return NextResponse.json({
        ok: true,
        status: "already_checked_in",
        reservationId: r.id,
        checkedInAt: r.checkedInAt,
        date,
        slot,
        placeId: r.placeId,
        spotId: r.spotId,
      });
    }

    if (!pin) return jsonError("PIN（4桁コード）を入力してください", 400);

    if (pin !== r.pin) {
      return NextResponse.json(
        {
          ok: false,
          error: "invalid_pin",
          message: "コードが違います",
          date,
          slot,
        },
        { status: 401 }
      );
    }

    const now = new Date();

    const updated = await prisma.reservation.update({
      where: { id: r.id },
      data: { checkedIn: true, checkedInAt: now },
      select: {
        id: true,
        checkedInAt: true,
        placeId: true,
        spotId: true,
      },
    });

    if (updated.placeId && updated.spotId) {
      await prisma.parkingSession.create({
        data: {
          placeId: updated.placeId,
          spotId: updated.spotId,
          reservationId: updated.id,
          sessionType: "RESERVATION",
          checkInAt: now,
          status: "IN",
        },
      });
    }

    return NextResponse.json({
      ok: true,
      status: "checked_in",
      reservationId: updated.id,
      checkedInAt: updated.checkedInAt,
      date,
      slot,
      placeId: updated.placeId,
      spotId: updated.spotId,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "server_error", message: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  return NextResponse.json({
    ok: true,
    hint: 'POST {"slot":"A-01","date":"YYYY-MM-DD","pin":"1234"}',
    receivedUrl: url.toString(),
  });
}