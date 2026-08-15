import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  MONTHLY_PLACE_SLUG,
  MONTHLY_SLOT_CODES,
  OCCUPYING_STATUSES,
  MONTHLY_EVENT_OFFER_DEADLINE_DAYS,
} from "@/lib/monthly-config";
import { signEventToken } from "@/lib/event-token";
import { sendMonthlyOfferNoticeMail } from "@/lib/mail";
import { isReservationMaintenance } from "@/lib/maintenance";

export const dynamic = "force-dynamic";

function jsonError(message: string, status = 400, code?: string) {
  return NextResponse.json(
    { ok: false, error: code ?? "error", message },
    { status }
  );
}

function isYmd(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return jsonError("不正なリクエストです");

    const spotId = String(body.spotId ?? "").trim();
    const date = String(body.date ?? "").trim();
    const name = String(body.name ?? "").trim();
    const plate = String(body.plate ?? "").trim();
    const email = String(body.email ?? "").trim();
    const phone = String(body.phone ?? "").trim();

    if (!spotId) return jsonError("区画が指定されていません");
    if (!isYmd(date)) return jsonError("日付が不正です");
    if (!name) return jsonError("氏名を入力してください");
    if (!plate) return jsonError("車両ナンバーを入力してください");
    if (!email) return jsonError("メールアドレスを入力してください");
    if (phone && !/^[0-9\-\s]+$/.test(phone)) {
      return jsonError("電話番号は数字とハイフンのみで入力してください");
    }

    // 対象区画の実在・月極区画・place を確認
    const spot = await prisma.spot.findUnique({
      where: { id: spotId },
      select: {
        id: true,
        code: true,
        placeId: true,
        place: { select: { slug: true } },
      },
    });
    if (!spot) return jsonError("区画が見つかりません", 404, "spot_not_found");
    if (
      spot.place?.slug !== MONTHLY_PLACE_SLUG ||
      !(MONTHLY_SLOT_CODES as readonly string[]).includes(spot.code)
    ) {
      return jsonError("この区画は承認申請の対象ではありません", 400, "not_offerable");
    }

    if (isReservationMaintenance(spot.place?.slug ?? "")) {
      return jsonError(
        "ただいまシステムメンテナンス中のため、新規予約を停止しています。",
        503,
        "maintenance"
      );
    }

    // 「今この区画が要承認で出ているか」は在庫判定(GET ①)を唯一の真実として再確認。
    // GET は 満車・受付窓・保持中・未オファー を全て満たす時だけ REQUIRES_APPROVAL を返す。
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "").trim();
    if (!appUrl) return jsonError("サーバ設定エラー", 500, "app_url_unset");

    const gridRes = await fetch(
      `${appUrl}/api/reservations?placeId=${encodeURIComponent(
        spot.placeId
      )}&date=${encodeURIComponent(date)}`,
      { cache: "no-store" }
    );
    const grid = await gridRes.json().catch(() => null);
    if (!gridRes.ok || !grid?.ok) {
      return jsonError("在庫状況を確認できませんでした", 502, "grid_unavailable");
    }
    const target = Array.isArray(grid.spots)
      ? grid.spots.find((s: { id?: string }) => s?.id === spotId)
      : null;
    if (!target || target.status !== "REQUIRES_APPROVAL") {
      return jsonError(
        "現在この区画は申請を受け付けていません（満車解消・締切超過・他の方が申請中の可能性があります）",
        409,
        "not_open_for_approval"
      );
    }

    // 保持中の月極契約（オファーに紐付ける contractId）
    const contract = await prisma.monthlyContract.findFirst({
      where: { spotId, status: { in: [...OCCUPYING_STATUSES] } },
      select: { id: true },
    });
    if (!contract) {
      return jsonError("対象の月極契約が見つかりません", 409, "no_contract");
    }

    // 受付締切（＝開催 MONTHLY_EVENT_OFFER_DEADLINE_DAYS 日前の 23:59:59 JST）
    const deadline = new Date(`${date}T00:00:00+09:00`);
    deadline.setDate(deadline.getDate() - MONTHLY_EVENT_OFFER_DEADLINE_DAYS);
    const deadlineYmd = deadline.toLocaleDateString("sv-SE", {
      timeZone: "Asia/Tokyo",
    });
    const expiresAt = new Date(`${deadlineYmd}T23:59:59+09:00`);

    // 先着ロック：@@unique([spotId,date]) 違反(P2002)なら「他の方が申請中」。
    // ただし既存が EXPIRED（管理者が予約開放した等・未予約）なら、その行を
    // 新しい申請者で上書きして再受付する。
    let offerId: string;
    try {
      const offer = await prisma.eventMonthlyOffer.create({
        data: {
          placeId: spot.placeId,
          spotId,
          date,
          contractId: contract.id,
          applicantName: name,
          applicantEmail: email,
          applicantPhone: phone || null,
          applicantPlate: plate,
          status: "WAITING",
          expiresAt,
        },
        select: { id: true },
      });
      offerId = offer.id;
    } catch (e) {
      if (
        !(e instanceof Prisma.PrismaClientKnownRequestError) ||
        e.code !== "P2002"
      ) {
        throw e;
      }
      const existing = await prisma.eventMonthlyOffer.findUnique({
        where: { spotId_date: { spotId, date } },
        select: { id: true, status: true, applicantReservationId: true },
      });
      if (
        !existing ||
        existing.status !== "EXPIRED" ||
        existing.applicantReservationId != null
      ) {
        return jsonError("この区画は他の方が申請中です", 409, "already_requested");
      }
      // EXPIRED の行のみを狙って原子的に再受付（前回のリリース情報はリセット）
      const reclaimed = await prisma.eventMonthlyOffer.updateMany({
        where: {
          id: existing.id,
          status: "EXPIRED",
          applicantReservationId: null,
        },
        data: {
          applicantName: name,
          applicantEmail: email,
          applicantPhone: phone || null,
          applicantPlate: plate,
          status: "WAITING",
          expiresAt,
          applicantCheckoutSession: null,
          linkExpiresAt: null,
          releasedBy: null,
          resendCount: 0,
          lastResendAt: null,
        },
      });
      if (reclaimed.count !== 1) {
        return jsonError("この区画は他の方が申請中です", 409, "already_requested");
      }
      offerId = existing.id;
    }

    // ③-2 月極利用者へ「利用する／利用しない」通知メール（送信失敗しても申請は成立）
    try {
      const info = await prisma.monthlyContract.findUnique({
        where: { id: contract.id },
        select: {
          tenant: { select: { email: true, name: true } },
          place: { select: { name: true } },
        },
      });
      if (info?.tenant?.email) {
        const useUrl = `${appUrl}/api/tenant/event-response/offer-use?token=${encodeURIComponent(
          signEventToken({ c: contract.id, d: date, a: "offer_use" })
        )}`;
        const declineUrl = `${appUrl}/api/tenant/event-response/offer-decline?token=${encodeURIComponent(
          signEventToken({ c: contract.id, d: date, a: "offer_decline" })
        )}`;
        await sendMonthlyOfferNoticeMail({
          to: info.tenant.email,
          tenantName: info.tenant.name ?? "",
          placeName: info.place?.name ?? "",
          spotLabel: spot.code,
          date,
          useUrl,
          declineUrl,
          dashboardUrl: `${appUrl}/tenant/dashboard`,
          deadlineNote: `${deadlineYmd}（開催${MONTHLY_EVENT_OFFER_DEADLINE_DAYS}日前）まで`,
        });
      }
    } catch (e) {
      console.error("offer notice mail failed:", e);
    }

    return NextResponse.json({ ok: true, offerId });
  } catch (error) {
    console.error("approval-request error:", error);
    return jsonError("申請処理に失敗しました", 500, "server_error");
  }
}
