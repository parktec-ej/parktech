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
      { ok: false, error: "session_id_missing", message: "session_id がありません" },
      { status: 400 }
    );
  }

  try {
    const checkoutSession = await stripe.checkout.sessions.retrieve(sessionId);

    // 入庫（hourly_prepaid）と延長（hourly_extend）の両方を受け付ける。
    // どちらも success_url がこのページを指しているため、片方だけ通すと
    // 延長後にポーリングが空回りして画面が壊れる。
    const flow = checkoutSession.metadata?.flow;
    if (flow !== "hourly_prepaid" && flow !== "hourly_extend") {
      return NextResponse.json(
        {
          ok: false,
          error: "invalid_flow",
          message: "時間貸しのセッションではありません",
        },
        { status: 400 }
      );
    }

    if (checkoutSession.payment_status !== "paid") {
      return NextResponse.json(
        { ok: false, error: "not_paid", message: "決済が完了していません" },
        { status: 402 }
      );
    }

    const parkingSessionId = String(
      checkoutSession.metadata?.parkingSessionId ?? ""
    ).trim();

    if (!parkingSessionId) {
      return NextResponse.json(
        {
          ok: false,
          error: "parking_session_not_found",
          message: "入庫情報が見つかりません",
        },
        { status: 404 }
      );
    }

    const parkingSession = await prisma.parkingSession.findUnique({
      where: { id: parkingSessionId },
      select: {
        id: true,
        status: true,
        paid: true,
        checkInAt: true,
        scheduledEndAt: true,
        prepaidYen: true,
        plate: true,
        spot: { select: { code: true, label: true } },
        place: { select: { slug: true, name: true } },
      },
    });

    if (!parkingSession) {
      return NextResponse.json(
        {
          ok: false,
          error: "parking_session_not_found",
          message: "入庫情報が見つかりません",
        },
        { status: 404 }
      );
    }

    // webhook がまだ処理していない場合は status: "PENDING" のまま返る。
    // 画面側でポーリングして IN になるのを待つ。
    // 延長の場合は既に IN なので、期限が延びたかを画面側で判断する。
    return NextResponse.json({
      ok: true,
      flow,
      expectedEndAt: checkoutSession.metadata?.newScheduledEndAt ?? null,
      parkingSession,
    });
  } catch (e: unknown) {
    return NextResponse.json(
      {
        ok: false,
        error: "server_error",
        message: e instanceof Error ? e.message : String(e),
      },
      { status: 500 }
    );
  }
}
