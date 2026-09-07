import { NextRequest, NextResponse } from "next/server";
import { findVerifiedReservation } from "@/lib/reservation-verify";
import {
  checkVerificationRateLimit,
  getClientIp,
  hashIp,
  recordVerificationAttempt,
} from "@/lib/rate-limit";

export const runtime = "nodejs";
export const preferredRegion = "hnd1";

const SUPPORT_TEL = "050-1793-4785";

// どの項目が違ったかは返さない（総当たりの手がかりになるため）
const NOT_FOUND_MESSAGE =
  "一致する予約が見つかりません。ご入力内容をご確認ください。";

const UNSUPPORTED_MESSAGE =
  `この予約はWebでの変更手続きに対応していません。お手数ですが ${SUPPORT_TEL} までお電話ください。`;

export async function POST(req: NextRequest) {
  try {
    const ipHash = hashIp(getClientIp(req));

    const limit = await checkVerificationRateLimit(ipHash);

    if (!limit.allowed) {
      const minutes = Math.ceil(limit.retryAfterSeconds / 60);

      return NextResponse.json(
        {
          ok: false,
          error: "rate_limited",
          message:
            `入力の失敗が続いたため、${minutes}分ほどお待ちいただく必要があります。` +
            `お急ぎの場合は ${SUPPORT_TEL} までお電話ください。`,
          retryAfterSeconds: limit.retryAfterSeconds,
        },
        {
          status: 429,
          headers: { "Retry-After": String(limit.retryAfterSeconds) },
        }
      );
    }

    const body = await req.json().catch(() => null);

    const date = String(body?.date ?? "").trim();
    const pin = String(body?.pin ?? "").trim();
    const plate = String(body?.plate ?? "").trim();
    const phone = String(body?.phone ?? "").trim();

    // 形式不備は試行としてカウントしない（打ち間違いでロックされるのを避ける）
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json(
        {
          ok: false,
          error: "invalid_date",
          message: "ご利用日を選択してください",
        },
        { status: 400 }
      );
    }

    if (!pin) {
      return NextResponse.json(
        { ok: false, error: "missing_pin", message: "PINコードを入力してください" },
        { status: 400 }
      );
    }

    if (!plate) {
      return NextResponse.json(
        {
          ok: false,
          error: "missing_plate",
          message: "車両ナンバーを入力してください",
        },
        { status: 400 }
      );
    }

    const outcome = await findVerifiedReservation({ date, pin, plate, phone });

    if (!outcome.ok) {
      // ナンバーが未登録扱いの予約は本人確認が成立しないので、
      // 総当たり対策のカウントには含めず電話で案内する。
      if (outcome.reason === "unsupported_plate") {
        return NextResponse.json(
          {
            ok: false,
            error: "unsupported",
            message: UNSUPPORTED_MESSAGE,
          },
          { status: 400 }
        );
      }

      await recordVerificationAttempt(ipHash, false);

      // ambiguous / no_token / not_found はすべて同じ文言に潰す。
      // 差から予約の存在を推測されないようにするため。
      return NextResponse.json(
        {
          ok: false,
          error: "not_found",
          message: NOT_FOUND_MESSAGE,
        },
        { status: 404 }
      );
    }

    await recordVerificationAttempt(ipHash, true);

    return NextResponse.json({
      ok: true,
      manageUrl: `/reservation/manage?token=${encodeURIComponent(
        outcome.cancelToken
      )}`,
    });
  } catch (error) {
    console.error("[reservations/verify] error:", error);

    return NextResponse.json(
      { ok: false, error: "server_error", message: "照会に失敗しました" },
      { status: 500 }
    );
  }
}
