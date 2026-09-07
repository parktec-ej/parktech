import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import {
  sendEmailChangedNoticeMail,
  sendPlateChangedMail,
  sendReservationPinMail,
} from "@/lib/mail";
import { sendSlackAlert, sendSlackNotification } from "@/lib/slack";
import {
  isPlaceholderPlate,
  matchCandidates,
  normalizePhone,
  normalizePlate,
} from "@/lib/reservation-verify";
import {
  checkVerificationRateLimit,
  getClientIp,
  hashIp,
  recordVerificationAttempt,
} from "@/lib/rate-limit";

export const runtime = "nodejs";
export const preferredRegion = "hnd1";

const EDITABLE_FIELDS = ["email", "plate"] as const;
type EditableField = (typeof EDITABLE_FIELDS)[number];

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

const SUPPORT_TEL = "050-1793-4785";

// 照合失敗の文言は入口（/api/reservations/verify）と揃える。
// どの項目が違ったかを返さない。
const MISMATCH_MESSAGE =
  "ご入力内容が確認できませんでした。お手数ですが内容をご確認ください。";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);

    const token = String(body?.token ?? "").trim();
    const field = String(body?.field ?? "").trim() as EditableField;
    const value = String(body?.value ?? "").trim();
    // メール変更時の再照合に使う電話番号（登録済みの番号との突き合わせ）
    const phone = String(body?.phone ?? "").trim();
    // 電話番号が未登録の予約で、今後の手続き用に登録してもらう番号
    const newPhone = String(body?.newPhone ?? "").trim();

    if (!token) {
      return NextResponse.json(
        { ok: false, error: "missing_token", message: "token が必要です" },
        { status: 400 }
      );
    }

    if (!EDITABLE_FIELDS.includes(field)) {
      return NextResponse.json(
        {
          ok: false,
          error: "invalid_field",
          message: "変更できる項目ではありません",
        },
        { status: 400 }
      );
    }

    if (!value) {
      return NextResponse.json(
        {
          ok: false,
          error: "value_required",
          message:
            field === "email"
              ? "メールアドレスを入力してください"
              : "車両ナンバーを入力してください",
        },
        { status: 400 }
      );
    }

    if (field === "email" && !isValidEmail(value)) {
      return NextResponse.json(
        {
          ok: false,
          error: "invalid_email",
          message: "メールアドレスの形式が正しくありません",
        },
        { status: 400 }
      );
    }

    // 「未登録」等に変更されると、次回この方が照会導線を使えなくなる（自分で締め出される）
    if (field === "plate" && isPlaceholderPlate(value)) {
      return NextResponse.json(
        {
          ok: false,
          error: "invalid_plate",
          message:
            "車両ナンバーを正しくご入力ください（「未定」などは登録できません）",
        },
        { status: 400 }
      );
    }

    const reservation = await prisma.reservation.findFirst({
      where: { cancelToken: token },
      include: {
        place: { select: { name: true, googleMapUrl: true } },
        spot: { select: { code: true, label: true } },
      },
    });

    if (!reservation) {
      return NextResponse.json(
        { ok: false, error: "not_found", message: "予約が見つかりません" },
        { status: 404 }
      );
    }

    if (reservation.status === "CANCELED") {
      return NextResponse.json(
        { ok: false, error: "canceled", message: "キャンセル済みの予約です" },
        { status: 400 }
      );
    }

    if (reservation.checkedOutAt) {
      return NextResponse.json(
        {
          ok: false,
          error: "already_checked_out",
          message: "出庫済みのため変更できません",
        },
        { status: 400 }
      );
    }

    const oldValue = field === "email" ? reservation.email : reservation.plate;

    const unchanged =
      field === "plate"
        ? normalizePlate(oldValue) === normalizePlate(value)
        : (oldValue ?? "").toLowerCase() === value.toLowerCase();

    if (unchanged) {
      return NextResponse.json(
        { ok: false, error: "same_value", message: "現在の内容と同じです" },
        { status: 400 }
      );
    }

    // メールアドレスの変更だけは、QRと領収書の宛先ごと予約の支配権が移る操作なので
    // 再照合を求める。manage 画面は予約日・PIN・ナンバーを表示しているため、
    // 画面に出ていない電話番号だけが実効性のある確認材料になる。
    const registeredPhone = normalizePhone(reservation.phone);
    let phoneRegistered = false;

    if (field === "email") {
      const ipHash = hashIp(getClientIp(req), "selfupdate");

      if (registeredPhone) {
        const limit = await checkVerificationRateLimit(ipHash);

        if (!limit.allowed) {
          const minutes = Math.ceil(limit.retryAfterSeconds / 60);

          await sendSlackAlert(
            [
              "⚠️ メールアドレス変更の再照合がロックされました",
              `予約ID：${reservation.id}`,
              `駐車場：${reservation.place?.name ?? "-"}`,
              `利用日：${reservation.date}`,
              `お客様：${reservation.name}`,
            ].join("\n")
          );

          return NextResponse.json(
            {
              ok: false,
              error: "rate_limited",
              message:
                `ご入力の確認が続けて取れなかったため、${minutes}分ほどお待ちいただく必要があります。` +
                `お急ぎの場合は ${SUPPORT_TEL} までお電話ください。`,
            },
            {
              status: 429,
              headers: { "Retry-After": String(limit.retryAfterSeconds) },
            }
          );
        }

        // 予約1件だけを候補にして照合する。
        // 入口の verify を流用すると全予約から検索してしまい、
        // 別の予約に一致した場合にその予約のトークンを返しかねない。
        const outcome = matchCandidates(
          [
            {
              id: reservation.id,
              date: reservation.date,
              plate: reservation.plate,
              phone: reservation.phone,
              cancelToken: reservation.cancelToken,
            },
          ],
          {
            date: reservation.date,
            pin: reservation.pin,
            plate: reservation.plate,
            phone,
          }
        );

        if (!outcome.ok) {
          await recordVerificationAttempt(ipHash, false);

          // 残り試行回数は返さない（総当たりの手がかりになるため）
          return NextResponse.json(
            { ok: false, error: "verification_failed", message: MISMATCH_MESSAGE },
            { status: 403 }
          );
        }

        await recordVerificationAttempt(ipHash, true);
      } else {
        // 電話番号が未登録の予約は、照合材料が画面上の情報しか無いため確認できない。
        // 変更は通したうえで、今後の手続きのために電話番号を登録してもらう。
        if (!newPhone) {
          return NextResponse.json(
            {
              ok: false,
              error: "phone_registration_required",
              message: "お電話番号をご登録ください",
            },
            { status: 400 }
          );
        }

        if (!/^[0-9\-\s\+\(\)]+$/.test(newPhone) || normalizePhone(newPhone).length < 10) {
          return NextResponse.json(
            {
              ok: false,
              error: "invalid_phone",
              message: "電話番号の形式が正しくありません",
            },
            { status: 400 }
          );
        }

        phoneRegistered = true;
      }
    }

    await prisma.reservation.update({
      where: { id: reservation.id },
      data:
        field === "email"
          ? phoneRegistered
            ? { email: value, phone: newPhone }
            : { email: value }
          : { plate: value },
    });

    // ログが欠けても変更自体は成立させる（検知できるようアラートは出す）
    try {
      await prisma.reservationChangeLog.create({
        data: {
          id: crypto.randomUUID(),
          reservationId: reservation.id,
          // oldDate/newDate は必須カラム。日付は変えていないので現在値を入れる。
          oldDate: reservation.date,
          newDate: reservation.date,
          field,
          oldValue: oldValue ?? "",
          newValue: value,
          changedBy: "customer",
          reason: "お客様による変更",
        },
      });
    } catch (e) {
      console.error("Reservation change log failed:", e);

      await sendSlackAlert(
        [
          "⚠️ 予約変更ログの記録に失敗（変更履歴が残りません）",
          `予約ID：${reservation.id}`,
          `項目：${field}`,
          `操作者：お客様`,
        ].join("\n")
      );
    }

    const placeName = reservation.place?.name ?? "-";
    const spotLabel =
      reservation.spot?.label ?? reservation.spot?.code ?? reservation.slot;

    // メール送信の失敗で変更を巻き戻さない（変更は成立させ、送信結果だけ返す）
    let mailSent = true;

    if (field === "email") {
      const appUrl = (
        process.env.NEXT_PUBLIC_APP_URL || "https://reserve.parktec-ej.com"
      )
        .trim()
        .replace(/\/$/, "");
      const manageUrl = reservation.cancelToken
        ? `${appUrl}/reservation/manage?token=${encodeURIComponent(
            reservation.cancelToken
          )}`
        : null;

      // 新アドレス宛：この導線を使う方の多くは確認メールを受け取れていないため、
      // PIN と管理リンクを含む予約内容そのものを送る。
      try {
        await sendReservationPinMail({
          to: value,
          placeName,
          spotLabel,
          date: reservation.date,
          slot: reservation.slot,
          plate: reservation.plate,
          phone: reservation.phone,
          price: reservation.price,
          pin: reservation.pin,
          googleMapUrl: reservation.place?.googleMapUrl ?? null,
          manageUrl,
        });
      } catch (e) {
        console.error("[self-update] pin mail to new address failed:", e);
        mailSent = false;
      }

      // 旧アドレス宛：乗っ取り時に本人が気づけるようにする。
      // 新しいアドレスは本文に書かない（攻撃者のアドレスを晒さないため）。
      if (oldValue) {
        try {
          await sendEmailChangedNoticeMail({
            to: oldValue,
            placeName,
            date: reservation.date,
          });
        } catch (e) {
          console.error("[self-update] notice mail to old address failed:", e);

          await sendSlackAlert(
            [
              "⚠️ メールアドレス変更の旧アドレス通知に失敗",
              `予約ID：${reservation.id}`,
              `駐車場：${placeName}`,
              `利用日：${reservation.date}`,
            ].join("\n")
          );
        }
      }
    } else {
      try {
        if (reservation.email) {
          await sendPlateChangedMail({
            to: reservation.email,
            placeName,
            date: reservation.date,
            oldPlate: oldValue ?? "",
            newPlate: value,
          });
        }
      } catch (e) {
        console.error("[self-update] plate mail failed:", e);
        mailSent = false;
      }
    }

    if (field === "email" && phoneRegistered) {
      await sendSlackAlert(
        [
          "⚠️ 再照合なしでメールアドレスが変更されました",
          "※ 電話番号が未登録の予約のため、本人確認ができませんでした",
          `予約ID：${reservation.id}`,
          `駐車場：${placeName}`,
          `利用日：${reservation.date}`,
          `お客様：${reservation.name}`,
          `今回ご登録の電話番号：${newPhone}`,
        ].join("\n")
      );
    }

    await sendSlackNotification(
      [
        field === "email"
          ? "✉️ お客様がメールアドレスを変更しました"
          : "🚗 お客様が車両ナンバーを変更しました",
        `予約ID：${reservation.id}`,
        `駐車場：${placeName}`,
        `利用日：${reservation.date}`,
        field === "email"
          ? `変更：${oldValue ?? "(未設定)"} → ${value}`
          : `変更：${oldValue ?? "(未設定)"} → ${value}`,
        mailSent ? null : "※ 通知メールの送信に失敗しました",
      ]
        .filter(Boolean)
        .join("\n")
    );

    return NextResponse.json({
      ok: true,
      message:
        field === "email"
          ? "メールアドレスを変更しました"
          : "車両ナンバーを変更しました",
      field,
      newValue: value,
      mailSent,
      phoneRegistered,
    });
  } catch (error) {
    console.error("[reservations/self-update] error:", error);

    return NextResponse.json(
      { ok: false, error: "server_error", message: "変更に失敗しました" },
      { status: 500 }
    );
  }
}
