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
  if (!input) return input;
  const m = input.match(/^S(\d{1,2})$/i);
  if (!m) return input;
  return `S${String(Number(m[1])).padStart(2, "0")}`;
}

function jsonError(message: string, status = 400, extra?: any) {
  return NextResponse.json(
    { ok: false, error: message, ...(extra ? { extra } : {}) },
    { status }
  );
}

// 出庫処理
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) return jsonError("JSONが壊れてます", 400);

    const date = normalizeDate(String(body.date ?? ymdTodayJst()));
    const slot = normalizeSlot(String(body.slot ?? ""));
    if (!slot) return jsonError("slot は必須です", 400);

    const r = await prisma.reservation.findFirst({
      where: { date, slot },
      select: {
        id: true,
        checkedIn: true,
        checkedInAt: true,
        checkedOutAt: true,
        paid: true,
      },
    });

    // 予約なし → 精算導線へ
    if (!r) {
      return NextResponse.json(
        {
          ok: false,
          error: "no_reservation",
          message: "予約がありません。精算（現地決済）へ進んでください。",
          date,
          slot,
        },
        { status: 404 }
      );
    }

    // まだチェックインしてない場合（運用により許可/禁止選べる）
    if (!r.checkedIn) {
      return NextResponse.json(
        {
          ok: false,
          error: "not_checked_in",
          message: "チェックインが完了していません。",
          date,
          slot,
        },
        { status: 409 }
      );
    }

    // すでに出庫済み
    if (r.checkedOutAt) {
      return NextResponse.json({
        ok: true,
        status: "already_checked_out",
        reservationId: r.id,
        checkedOutAt: r.checkedOutAt,
        date,
        slot,
      });
    }

    const updated = await prisma.reservation.update({
      where: { id: r.id },
      data: { checkedOutAt: new Date() },
      select: { id: true, checkedOutAt: true },
    });

    return NextResponse.json({
      ok: true,
      status: "checked_out",
      reservationId: updated.id,
      checkedOutAt: updated.checkedOutAt,
      date,
      slot,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "server_error", message: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}

// 疎通確認
export async function GET(req: Request) {
  const url = new URL(req.url);
  return NextResponse.json({
    ok: true,
    hint: 'POST {"slot":"S01","date":"YYYY-MM-DD"}',
    receivedUrl: url.toString(),
  });
}