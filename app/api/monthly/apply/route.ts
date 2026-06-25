export const runtime = "nodejs";
export const preferredRegion = "hnd1";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolveActivePlace } from "@/lib/place-resolver";
import { sendSlackNotification } from "@/lib/slack";
import { sendMonthlyApplicationReceivedMail } from "@/lib/mail";

const BASE_FEE_YEN = 3000;

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
  NON_EVENT_ONLY: "プラン1：非イベント日のみ",
  INCLUDES_EVENT: "プラン2：イベント日も駐車可（都度予約）",
};

// 同一メールで重複申込とみなす契約ステータス（解約・却下は再申込を許可）
const ACTIVE_ISH_STATUSES = [
  "PENDING",
  "AWAITING_PAYMENT",
  "ACTIVE",
  "PAST_DUE",
] as const;

function computeTotalFeeYen(term: BillingTerm): number {
  const c = TERM_CONFIG[term];
  const gross = BASE_FEE_YEN * c.months;
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
    const plan = String(body.plan ?? "NON_EVENT_ONLY").trim() as Plan;
    const billingTerm = String(body.billingTerm ?? "MONTHLY").trim() as BillingTerm;
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
    const totalFeeYen = computeTotalFeeYen(billingTerm);

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

      const contract = await tx.monthlyContract.create({
        data: {
          tenantId: tenant.id,
          placeId: place.id,
          plan,
          billingTerm,
          baseFeeYen: BASE_FEE_YEN,
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
    console.error(error);
    return jsonError("申込の処理に失敗しました", 500, "server_error");
  } finally {
    console.log("[monthly/apply] done POST", { ms: Date.now() - startedAt });
  }
}
