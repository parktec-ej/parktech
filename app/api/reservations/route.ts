// app/api/reservations/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

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

function ymdToTimestamptz(ymd: string) {
  // PricingCalendar.targetDate（timestamptz）を「その日のJST 00:00」で固定して扱う
  return new Date(`${ymd}T00:00:00+09:00`);
}

async function resolvePriceYen(ymd: string) {
  const target = ymdToTimestamptz(ymd);
  const row = await prisma.pricingCalendar.findUnique({
    where: { targetDate: target },
    select: { priceYen: true },
  });
  return row?.priceYen ?? 3000; // 通常料金（仮）
}

function genPin4() {
  // 0000〜9999（4桁固定）
  return String(Math.floor(Math.random() * 10000)).padStart(4, "0");
}

// =========================
// POST：予約作成
// 仕様：事前支払い前提（今は paid=true 仮運用）
// =========================
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) return jsonError("JSONが壊れてます");

    const date = normalizeDate(String(body.date ?? ""));
    const slot = normalizeSlot(String(body.slot ?? ""));
    const name = String(body.name ?? "").trim();
    const plate = String(body.plate ?? "").trim();
    const email = body.email ? String(body.email).trim() : null;

    if (!date || !slot) return jsonError("date と slot は必須です");
    if (!name || !plate) return jsonError("name と plate は必須です");

    // 価格はサーバで確定（クライアントの price は信用しない）
    const priceYen = await resolvePriceYen(date);

    // pin はDB defaultに頼らず、必ずここで生成して入れる（pin null問題を根絶）
    const pin = genPin4();

    const created = await prisma.reservation.create({
      data: {
        date,
        slot,
        name,
        plate,
        email,
        price: priceYen,
        pin,
        paid: true, // 決済導入までは予約=支払済の仮運用
        paidAt: new Date(),
      },
      select: {
        id: true,
        qrToken: true,
        pin: true, // メール送信用（本番では返さずメールだけにしてもOK）
        price: true,
      },
    });

    return NextResponse.json({ ok: true, ...created });
  } catch (e: any) {
    // date+slot のユニーク違反（=二重予約）
    if (e?.code === "P2002") {
      return jsonError("この区画は予約済みです", 409);
    }
    return NextResponse.json(
      { ok: false, error: "server_error", message: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}

// =========================
// GET：予約済みslot取得
// =========================
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const rawDate = url.searchParams.get("date");

    if (!rawDate) {
      return NextResponse.json({
        ok: true,
        hint: 'add "?date=YYYY-MM-DD"',
        receivedUrl: url.toString(),
      });
    }

    const date = normalizeDate(rawDate);

    const rows = await prisma.reservation.findMany({
      where: { date },
      select: { slot: true },
    });

    return NextResponse.json({
      ok: true,
      date,
      reservedSlots: rows.map((r) => normalizeSlot(r.slot)),
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "server_error", message: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}