export const runtime = "nodejs";
export const preferredRegion = "hnd1";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolveActivePlace } from "@/lib/place-resolver";
import { sendSlackNotification } from "@/lib/slack";
import { sendMonthlyApplicationReceivedMail } from "@/lib/mail";
import { OCCUPYING_STATUSES, getMonthlyFee, monthlySpotWhere } from "@/lib/monthly-config";

const BASE_FEE_YEN = 3300;

// 区画が同時申込で埋まったことを示す内部エラー（→ 409 に変換）
class SlotTakenError extends Error {}

type BillingTerm = "MONTHLY" | "QUARTERLY" | "SEMIANNUAL" | "ANNUAL";
type Plan = "NON_EVENT_ONLY" | "INCLUDES_EVENT";

const TERM_CONFIG: Record<
  BillingTerm,
  { months: number; discountBps: number; label: string }
> = {
  MONTHLY: { months: 1, discountBps: 0, label: "月払い（自動継続）" },
  QUARTERLY: { months: 3, discountBps: 0, label: "3ヶ月一括前払い" },
  SEMIANNUAL: { months: 6, discountBps: 0, label: "半年一括前払い" },
  ANNUAL: { months: 12, discountBps: 1000, label: "1年一括前払い（10%割引）" },
};

const PLAN_LABEL: Record<Plan, string> = {
  NON_EVENT_ONLY: "月極（旧・イベント日不可）",
  INCLUDES_EVENT: "月極（イベント開催日も予約可）",
};

// 同一メールで重複申込とみなす契約ステータス（解約・却下は再申込を許可）
const ACTIVE_ISH_STATUSES = [
  "PENDING",
  "AWAITING_PAYMENT",
  "ACTIVE",
  "PAST_DUE",
] as const;

function computeTotalFeeYen(term: BillingTerm, baseFee: number): number {
  const c = TERM_CONFIG[term];
  const gross = baseFee * c.months;
  return Math.round(gross * (1 - c.discountBps / 10000));
}

function jsonError(message: string, status = 400, error?: string) {
  return NextResponse.json(
    { ok: false, error: error ?? "bad_request", message },
    { status }
  );
}

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  console.log("[monthly/apply] start POST");
  try {
    const body = await req.json().catch(() => ({}));

    const placeId = String(body.placeId ?? "").trim();
    const placeSlug = String(body.placeSlug ?? "").trim();
    const name = String(body.name ?? "").trim();
    const email = String(body.email ?? "").trim().toLowerCase();
    const phone = String(body.phone ?? "").trim();
    const postalCode = String(body.postalCode ?? "").trim();
    const address = String(body.address ?? "").trim();
    const vehicleType = String(body.vehicleType ?? "").trim();
    const plate = String(body.plate ?? "").trim();
    const spotId = String(body.spotId ?? "").trim();
    // プラン統合: 申込は常に「イベント開催日も予約可」(旧プラン2相当)で作成。
    const plan: Plan = "INCLUDES_EVENT";
    // サブスク一本化: リクエストの billingTerm は無視し、常に MONTHLY（月額¥3,300）で作成する。
    const billingTerm = "MONTHLY" as BillingTerm;
    const importantTermsAgreed = body.importantTermsAgreed === true;

    if (!name) return jsonError("氏名を入力してください", 400, "missing_name");
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return jsonError("メールアドレスの形式が正しくありません", 400, "invalid_email");
    }
    if (!phone || !/^[0-9\-\s\+\(\)]+$/.test(phone)) {
      return jsonError("電話番号を正しく入力してください", 400, "invalid_phone");
    }
    if (!address) return jsonError("住所を入力してください", 400, "missing_address");
    if (!vehicleType) return jsonError("車種を入力してください", 400, "missing_vehicle_type");
    if (!plate) return jsonError("車のナンバーを入力してください", 400, "missing_plate");
    if (!(plan in PLAN_LABEL)) return jsonError("プランの選択が不正です", 400, "invalid_plan");
    if (!(billingTerm in TERM_CONFIG)) {
      return jsonError("お支払いプランの選択が不正です", 400, "invalid_billing_term");
    }
    if (!importantTermsAgreed) {
      return jsonError("重要事項にご同意ください", 400, "terms_not_agreed");
    }

    const place = await resolveActivePlace({ placeId, placeSlug });
    if (!place) {
      return jsonError("駐車場が見つかりません", 404, "place_not_found");
    }
    const feeYen = getMonthlyFee(place.slug);
    if (feeYen == null) {
      return jsonError("この駐車場は月極のお申し込みに対応していません", 400, "not_monthly_place");
    }

    // 月極スロット専有: 4区画(A-17〜A-20)から1つ選択必須。
    if (!spotId) {
      return jsonError("駐車区画を選択してください", 400, "missing_spot");
    }
    const selectedSpot = await prisma.spot.findFirst({
      where: {
        id: spotId,
        placeId: place.id,
        isActive: true,
        ...monthlySpotWhere(place.slug),
      },
      select: { id: true, code: true },
    });
    if (!selectedSpot) {
      return jsonError("選択された駐車区画が不正です", 400, "invalid_spot");
    }
    const slotCode = selectedSpot.code;

    // 重複防止: 同一メールで「有効な」契約が既にあれば 409
    const existingTenant = await prisma.tenant.findUnique({
      where: { email },
      include: {
        contracts: {
          where: { status: { in: [...ACTIVE_ISH_STATUSES] } },
          select: { id: true },
        },
      },
    });

    if (existingTenant && existingTenant.contracts.length > 0) {
      return jsonError(
        "このメールアドレスではすでに申込・契約が存在します。お問い合わせください。",
        409,
        "already_applied"
      );
    }

    const cfg = TERM_CONFIG[billingTerm];
    const totalFeeYen = computeTotalFeeYen(billingTerm, feeYen);

    const { contract } = await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.upsert({
        where: { email },
        update: { name, phone, postalCode: postalCode || null, address },
        create: {
          email,
          name,
          phone,
          postalCode: postalCode || null,
          address,
          status: "ACTIVE",
        },
      });

      // 同一区画への同時申込を直列化するため対象 Spot 行を行ロックし、
      // ロック保持中に進行中契約の有無を再チェックしてから作成（競合防止）。
      await tx.$queryRaw`SELECT id FROM "Spot" WHERE id = ${selectedSpot.id} FOR UPDATE`;

      const conflict = await tx.monthlyContract.count({
        where: {
          placeId: place.id,
          spotId: selectedSpot.id,
          status: { in: [...OCCUPYING_STATUSES] },
        },
      });
      if (conflict > 0) {
        throw new SlotTakenError();
      }

      const contract = await tx.monthlyContract.create({
        data: {
          tenantId: tenant.id,
          placeId: place.id,
          spotId: selectedSpot.id,
          plan,
          billingTerm,
          baseFeeYen: feeYen,
          prepaidMonths: cfg.months,
          discountBps: cfg.discountBps,
          totalFeeYen,
          vehicleType,
          plate,
          importantTermsAgreedAt: new Date(),
          status: "PENDING",
        },
      });

      return { tenant, contract };
    });

    // 受付メール & Slack 通知はベストエフォート（失敗しても申込自体は成立）
    try {
      await sendMonthlyApplicationReceivedMail({
        to: email,
        name,
        placeName: place.name,
        planLabel: PLAN_LABEL[plan],
        billingTermLabel: cfg.label,
        totalFeeYen,
      });
    } catch (e) {
      console.warn("[monthly/apply] mail failed:", e);
    }

    try {
      await sendSlackNotification(
        [
          "🏠 月極駐車場 新規申込",
          `駐車場: ${place.name}`,
          `駐車区画: ${slotCode}`,
          `申込者: ${name}（${email} / ${phone}）`,
          `住所: ${postalCode ? `〒${postalCode} ` : ""}${address}`,
          `プラン: ${PLAN_LABEL[plan]}`,
          `支払: ${cfg.label}`,
          `金額: ¥${totalFeeYen.toLocaleString("ja-JP")}（税込）`,
          `車両: ${vehicleType} / ${plate}`,
          `状態: PENDING（承認待ち）`,
        ].join("\n")
      );
    } catch (e) {
      console.warn("[monthly/apply] slack failed:", e);
    }

    return NextResponse.json({
      ok: true,
      contractId: contract.id,
      totalFeeYen,
    });
  } catch (error: unknown) {
    if (error instanceof SlotTakenError) {
      return jsonError(
        "選択された駐車区画は、ちょうど他の方のお申し込みで埋まりました。別の区画をお選びください。",
        409,
        "spot_taken"
      );
    }
    console.error(error);
    return jsonError("申込の処理に失敗しました", 500, "server_error");
  } finally {
    console.log("[monthly/apply] done POST", { ms: Date.now() - startedAt });
  }
}
