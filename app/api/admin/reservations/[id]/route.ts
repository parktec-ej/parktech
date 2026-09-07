export const runtime = "nodejs";
export const preferredRegion = "hnd1";

import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import { getAdminSession } from "@/lib/admin-auth";
import { sendReservationPinMail } from "@/lib/mail";
import { sendSlackAlert, sendSlackNotification } from "@/lib/slack";

// 更新を許可する項目のホワイトリスト。金額や qrToken はここに足さないこと。
const EDITABLE_FIELDS = ["email", "plate"] as const;
type EditableField = (typeof EDITABLE_FIELDS)[number];

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 }
    );
  }

  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        {
          ok: false,
          error: "reservation_id_required",
          message: "予約IDが必要です",
        },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => null);

    if (!body) {
      return NextResponse.json(
        { ok: false, error: "invalid_json" },
        { status: 400 }
      );
    }

    const field = String(body.field ?? "").trim() as EditableField;
    const reason = String(body.reason ?? "管理者による変更").trim();
    const resendMail = body.resendMail === true;

    if (!EDITABLE_FIELDS.includes(field)) {
      return NextResponse.json(
        {
          ok: false,
          error: "invalid_field",
          message: "変更できる項目は email と plate のみです",
        },
        { status: 400 }
      );
    }

    const newValue = String(body.value ?? "").trim();

    if (!newValue) {
      return NextResponse.json(
        {
          ok: false,
          error: "value_required",
          message: "新しい値を入力してください",
        },
        { status: 400 }
      );
    }

    if (field === "email" && !isValidEmail(newValue)) {
      return NextResponse.json(
        {
          ok: false,
          error: "invalid_email",
          message: "メールアドレスの形式が正しくありません",
        },
        { status: 400 }
      );
    }

    const reservation = await prisma.reservation.findUnique({
      where: { id },
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

    const oldValue = field === "email" ? reservation.email : reservation.plate;

    if ((oldValue ?? "") === newValue) {
      return NextResponse.json(
        { ok: false, error: "same_value", message: "現在の値と同じです" },
        { status: 400 }
      );
    }

    await prisma.reservation.update({
      where: { id: reservation.id },
      data: field === "email" ? { email: newValue } : { plate: newValue },
    });

    // ログが欠けると誰がいつ何を変えたか追えなくなるが、更新自体は成立させる。
    try {
      await prisma.reservationChangeLog.create({
        data: {
          id: crypto.randomUUID(),
          reservationId: reservation.id,
          // oldDate/newDate は必須カラム。日付は変えていないので現在値を両方に入れる。
          oldDate: reservation.date,
          newDate: reservation.date,
          field,
          oldValue: oldValue ?? "",
          newValue,
          changedBy: admin.email,
          reason,
        },
      });
    } catch (e) {
      console.error("Reservation change log failed:", e);

      await sendSlackAlert(
        [
          "⚠️ 予約変更ログの記録に失敗（変更履歴が残りません）",
          `予約ID：${reservation.id}`,
          `項目：${field}`,
          `変更：${oldValue ?? "(未設定)"} → ${newValue}`,
          `操作者：${admin.email}`,
        ].join("\n")
      );
    }

    // メール送信の失敗で更新を巻き戻すと「アドレスは誤ったまま送信も失敗」になる。
    // 更新は確定させ、送信可否は mailSent で返して UI から再送させる。
    let mailSent: boolean | null = null;

    if (field === "email" && resendMail) {
      mailSent = false;

      try {
        const appUrl = (
          process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
        ).trim();
        const manageUrl = reservation.cancelToken
          ? `${appUrl}/reservation/manage?token=${encodeURIComponent(
              reservation.cancelToken
            )}`
          : null;

        await sendReservationPinMail({
          to: newValue,
          placeName: reservation.place?.name ?? "",
          spotLabel:
            reservation.spot?.label ??
            reservation.spot?.code ??
            reservation.slot,
          date: reservation.date,
          slot: reservation.slot,
          plate: reservation.plate,
          phone: reservation.phone,
          price: reservation.price,
          pin: reservation.pin,
          googleMapUrl: reservation.place?.googleMapUrl ?? null,
          manageUrl,
        });

        mailSent = true;
      } catch (e) {
        console.error("[admin/reservations/PATCH] resend mail failed:", e);
      }
    }

    await sendSlackNotification(
      [
        field === "email" ? "✉️ 予約メールアドレス変更" : "🚗 予約ナンバー変更",
        `operator: ${admin.email}`,
        `reservationId: ${reservation.id}`,
        `顧客：${reservation.name}`,
        `変更：${oldValue ?? "(未設定)"} → ${newValue}`,
        `理由：${reason}`,
        mailSent === null
          ? null
          : mailSent
            ? "確認メール：再送しました"
            : "確認メール：再送に失敗しました",
      ]
        .filter(Boolean)
        .join("\n")
    );

    return NextResponse.json({
      ok: true,
      message:
        field === "email"
          ? "メールアドレスを更新しました"
          : "ナンバーを更新しました",
      field,
      oldValue,
      newValue,
      mailSent,
    });
  } catch (error) {
    console.error("[admin/reservations/PATCH] error:", error);

    return NextResponse.json(
      {
        ok: false,
        error: "server_error",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
