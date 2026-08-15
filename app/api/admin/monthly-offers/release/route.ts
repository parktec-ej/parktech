export const runtime = "nodejs";
export const preferredRegion = "hnd1";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminSession } from "@/lib/admin-auth";
import { sendSlackNotification } from "@/lib/slack";
import { sendMonthlyProxyReleasedMail } from "@/lib/mail";
import { releaseOfferToApplicant } from "@/lib/monthly-offer-release";

// releaseOfferToApplicant が返す理由コード → HTTP ステータス（resend と同じ方針）。
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

    // 代理リリース可能な状態か（この2条件のみルート側で確認。本体は共通関数へ委譲）
    const offer = await prisma.eventMonthlyOffer.findUnique({
      where: { id: offerId },
      select: {
        id: true,
        status: true,
        applicantReservationId: true,
        contractId: true,
        placeId: true,
        spotId: true,
        date: true,
      },
    });
    if (!offer) {
      return NextResponse.json({ ok: false, error: "offer_not_found" }, { status: 404 });
    }
    if (offer.status !== "WAITING" && offer.status !== "TENANT_CHARGE_PENDING") {
      return NextResponse.json({ ok: false, error: "not_releasable" }, { status: 409 });
    }
    if (offer.applicantReservationId != null) {
      return NextResponse.json({ ok: false, error: "already_applied" }, { status: 409 });
    }

    // 即座に申請者へ決済リンクを送信（初回送信なので isResend=false）
    const result = await releaseOfferToApplicant(offerId, "ADMIN", false);
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: STATUS_BY_ERROR[result.error] ?? 409 }
      );
    }

    // 月極契約者へ「回答が無かったため一般の方へお譲りしました」通知。
    // 契約者は必ず offer.contractId から引く（spotId で引くと解約済み契約が混ざる）。
    const [contract, place, spot] = await Promise.all([
      prisma.monthlyContract.findUnique({
        where: { id: offer.contractId },
        select: { tenant: { select: { name: true, email: true } } },
      }),
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
    if (contract?.tenant?.email) {
      try {
        await sendMonthlyProxyReleasedMail({
          to: contract.tenant.email,
          tenantName: contract.tenant.name ?? "",
          placeName: place?.name ?? "",
          spotLabel,
          date: offer.date,
        });
      } catch (e) {
        console.error("[monthly-offers/release] tenant notice mail failed:", e);
      }
    }

    await sendSlackNotification(
      `【管理・代理リリース】${place?.name ?? offer.placeId} ${spotLabel} / ${offer.date} を一般の申請者へリリースし決済リンクを送信しました。有効期限: ${new Date(
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
    console.error("[monthly-offers/release] error:", e);
    return NextResponse.json(
      { ok: false, error: "server_error", message },
      { status: 500 }
    );
  }
}
