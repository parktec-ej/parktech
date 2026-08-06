export const runtime = "nodejs";
export const preferredRegion = "hnd1";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendSlackNotification } from "@/lib/slack";

function jsonError(message: string, status = 400, error?: string) {
  return NextResponse.json(
    { ok: false, error: error ?? "bad_request", message },
    { status }
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return jsonError("JSON body が必要です", 400, "invalid_body");
    }

    const sessionId = String(body.sessionId ?? "").trim();
    if (!sessionId) {
      return jsonError("sessionId が必要です", 400, "missing_session_id");
    }

    const session = await prisma.parkingSession.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        status: true,
        paid: true,
        prepaidYen: true,
        scheduledEndAt: true,
        checkInAt: true,
        checkOutAt: true,
        spot: { select: { code: true, label: true } },
        place: { select: { name: true } },
      },
    });

    if (!session) {
      return jsonError("セッションが見つかりません", 404, "session_not_found");
    }

    if (session.status === "OUT" || session.checkOutAt) {
      return NextResponse.json({
        ok: true,
        alreadyCheckedOut: true,
        message: "このご利用はすでに出庫済みです",
      });
    }

    // 事前決済のセッションのみ対象。旧・後払いは従来の精算フローへ。
    if (session.prepaidYen == null) {
      return jsonError(
        "このセッションは精算が必要です",
        409,
        "requires_settlement"
      );
    }

    if (!session.scheduledEndAt) {
      return jsonError(
        "出庫期限が設定されていません",
        500,
        "no_scheduled_end"
      );
    }

    const now = new Date();

    // 期限を過ぎている場合は超過精算が必要。ここでは出庫させない。
    if (now.getTime() > session.scheduledEndAt.getTime()) {
      const overMinutes = Math.ceil(
        (now.getTime() - session.scheduledEndAt.getTime()) / 60000
      );
      return NextResponse.json(
        {
          ok: false,
          error: "overstay",
          message: "出庫期限を過ぎています。超過分の精算が必要です。",
          overstayMinutes: overMinutes,
          scheduledEndAt: session.scheduledEndAt.toISOString(),
        },
        { status: 409 }
      );
    }

    const totalMinutes = Math.max(
      1,
      Math.ceil((now.getTime() - session.checkInAt.getTime()) / 60000)
    );

    await prisma.parkingSession.update({
      where: { id: session.id },
      data: {
        status: "OUT",
        checkOutAt: now,
        totalMinutes,
        totalYen: session.prepaidYen,
      },
    });

    await sendSlackNotification(
      `🚗 時間貸し出庫（事前決済・期限内）: ${session.spot?.code ?? ""} / ` +
        `${totalMinutes}分 / ${session.prepaidYen}円`
    ).catch(() => {});

    return NextResponse.json({
      ok: true,
      checkedOut: true,
      totalMinutes,
      totalYen: session.prepaidYen,
      placeName: session.place?.name ?? "",
      spotLabel: session.spot?.label ?? session.spot?.code ?? "",
    });
  } catch (error) {
    console.error("POST /api/hourly-prepaid/checkout error:", error);
    return jsonError("出庫処理に失敗しました", 500, "internal_error");
  }
}
