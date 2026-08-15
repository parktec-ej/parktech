export const runtime = "nodejs";
export const preferredRegion = "hnd1";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminSession } from "@/lib/admin-auth";
import { sendSlackNotification } from "@/lib/slack";
import { releaseOfferToApplicant } from "@/lib/monthly-offer-release";

// releaseOfferToApplicant が返す理由コード → HTTP ステータス。
// （従来の resend ルートと同じ外部挙動を維持する）
const STATUS_BY_ERROR: Record<string, number> = {
  offer_not_found: 404,
  no_applicant_email: 409,
  place_not_found: 404,
  spot_not_found: 409,
  already_reserved: 409,
  past_deadline: 409,
  no_valid_window: 409,
  price_unavailable: 409,
  checkout_create_failed: 502,
};

export async function POST(req: Request) {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const offerId = String(body?.offerId ?? "").trim();
    if (!offerId) {
      return NextResponse.json(
        { ok: false, error: "offer_id_required" },
        { status: 400 }
      );
    }

    // 再送可能な状態か（この2条件のみルート側で確認。本体は共通関数へ委譲）
    const offer = await prisma.eventMonthlyOffer.findUnique({
      where: { id: offerId },
      select: {
        id: true,
        status: true,
        applicantReservationId: true,
        placeId: true,
        spotId: true,
        date: true,
        applicantEmail: true,
      },
    });
    if (!offer) {
      return NextResponse.json({ ok: false, error: "offer_not_found" }, { status: 404 });
    }
    if (offer.status !== "RELEASED") {
      return NextResponse.json({ ok: false, error: "not_released" }, { status: 409 });
    }
    if (offer.applicantReservationId != null) {
      return NextResponse.json({ ok: false, error: "already_applied" }, { status: 409 });
    }

    const result = await releaseOfferToApplicant(offerId, "ADMIN", true);
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: STATUS_BY_ERROR[result.error] ?? 409 }
      );
    }

    // resend 固有の記録（成功時のみ）
    await prisma.eventMonthlyOffer.update({
      where: { id: offerId },
      data: { resendCount: { increment: 1 }, lastResendAt: new Date() },
    });

    // Slack 通知は従来どおりこのルートの責務。
    const [place, spot] = await Promise.all([
      prisma.place.findUnique({
        where: { id: offer.placeId },
        select: { name: true },
      }),
      prisma.spot.findFirst({
        where: { id: offer.spotId },
        select: { code: true, label: true },
      }),
    ]);
    const spotLabel = spot?.label ?? spot?.code ?? offer.spotId;
    await sendSlackNotification(
      `【管理・再送】${place?.name ?? offer.placeId} ${spotLabel} / ${offer.date} の決済リンクを申請者(${offer.applicantEmail})へ再送しました。有効期限: ${new Date(
        result.expiresAt
      ).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}`
    ).catch(() => {});

    return NextResponse.json({
      ok: true,
      offerId,
      checkoutSession: result.checkoutSessionId,
      expiresAt: result.expiresAt,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[monthly-offers/resend] error:", e);
    return NextResponse.json(
      { ok: false, error: "server_error", message },
      { status: 500 }
    );
  }
}
