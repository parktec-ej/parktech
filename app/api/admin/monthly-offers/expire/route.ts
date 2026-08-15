export const runtime = "nodejs";
export const preferredRegion = "hnd1";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { stripe } from "@/lib/stripe";
import { getAdminSession } from "@/lib/admin-auth";
import { sendSlackNotification } from "@/lib/slack";
import { sendOfferApplicantUnavailableMail } from "@/lib/mail";

export async function POST(req: Request) {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const offerId = String(body?.offerId ?? "").trim();
    const reason = String(body?.reason ?? "").trim();
    if (!offerId) {
      return NextResponse.json(
        { ok: false, error: "offer_id_required" },
        { status: 400 }
      );
    }

    const offer = await prisma.eventMonthlyOffer.findUnique({
      where: { id: offerId },
      select: {
        id: true,
        status: true,
        applicantReservationId: true,
        applicantCheckoutSession: true,
        applicantName: true,
        applicantEmail: true,
        placeId: true,
        spotId: true,
        date: true,
      },
    });
    if (!offer) {
      return NextResponse.json({ ok: false, error: "offer_not_found" }, { status: 404 });
    }
    if (offer.status !== "RELEASED" && offer.status !== "WAITING") {
      return NextResponse.json({ ok: false, error: "not_expirable" }, { status: 409 });
    }
    if (offer.applicantReservationId != null) {
      return NextResponse.json({ ok: false, error: "already_reserved" }, { status: 409 });
    }

    // 決済リンク（Checkout）があれば明示的に失効。既に失効/完了でも握りつぶす。
    if (offer.applicantCheckoutSession) {
      try {
        await stripe.checkout.sessions.expire(offer.applicantCheckoutSession);
      } catch (e) {
        console.error(
          "[monthly-offers/expire] expire checkout session failed (ignored):",
          e
        );
      }
    }

    // EXPIRED へ更新。linkExpiresAt を現在時刻にして失効済みを明示する。
    // expiresAt（申請の受付締切）には触れない。operationMode（Place/Spot）も一切変更しない。
    await prisma.eventMonthlyOffer.update({
      where: { id: offer.id },
      data: {
        status: "EXPIRED",
        linkExpiresAt: new Date(),
      },
    });

    // 申請者へお詫びメール（applicantEmail がある場合のみ）
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
    if (offer.applicantEmail) {
      try {
        await sendOfferApplicantUnavailableMail({
          to: offer.applicantEmail,
          name: offer.applicantName ?? "",
          placeName: place?.name ?? "",
          date: offer.date,
        });
      } catch (e) {
        console.error("[monthly-offers/expire] applicant mail failed:", e);
      }
    }

    await sendSlackNotification(
      `【管理・予約開放】${place?.name ?? offer.placeId} ${spotLabel} / ${offer.date} のオファーを EXPIRED にしました（申請者: ${offer.applicantEmail ?? "-"}）。${reason ? `理由: ${reason}` : ""}`
    ).catch(() => {});

    return NextResponse.json({ ok: true, offerId });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[monthly-offers/expire] error:", e);
    return NextResponse.json(
      { ok: false, error: "server_error", message },
      { status: 500 }
    );
  }
}
