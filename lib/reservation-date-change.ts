import { prisma } from "@/lib/db";
import { sendSlackAlert, sendSlackNotification } from "@/lib/slack";

type SyncPaymentAfterDateChangeParams = {
  reservationId: string;
  oldDate: string;
  newDate: string;
  newSpotId?: string | null;
};

type SyncPaymentAfterDateChangeResult = {
  updated: boolean;
  reason?: "no_payment" | "locked";
};

/**
 * 予約の日付変更に合わせて、紐づく Payment の計上日・計上月・区画スナップショットを追従させる。
 * 月間売上の日別明細は Payment.serviceDate をキーに行を組み立てるため、
 * ここを更新しないと変更先の日付の行が生成されない（月をまたぐ場合は精算月そのものがずれる）。
 */
export async function syncPaymentAfterDateChange(
  params: SyncPaymentAfterDateChangeParams
): Promise<SyncPaymentAfterDateChangeResult> {
  const { reservationId, oldDate, newDate, newSpotId } = params;

  const payment = await prisma.payment.findFirst({
    where: {
      reservationId,
      kind: "RESERVATION",
    },
    select: {
      id: true,
      settlementLock: true,
      status: true,
      serviceDate: true,
      recognizedMonth: true,
      spotId: true,
    },
  });

  if (!payment) {
    return { updated: false, reason: "no_payment" };
  }

  // 精算が締まっている決済は書き換えない（確定済みの精算額が動いてしまうため）
  if (payment.settlementLock === "LOCKED" || payment.status === "SETTLED") {
    await sendSlackAlert(
      [
        "⚠️ 日付変更に決済が追従できません（精算ロック済み）",
        `予約ID：${reservationId}`,
        `旧日付：${oldDate}`,
        `新日付：${newDate}`,
        `PaymentID：${payment.id}`,
      ].join("\n")
    );

    return { updated: false, reason: "locked" };
  }

  const newRecognizedMonth = newDate.slice(0, 7);

  const data: {
    serviceDate: string;
    recognizedDate: Date;
    recognizedMonth: string;
    updatedAt: Date;
    spotId?: string;
    spotCodeSnapshot?: string | null;
    spotLabelSnapshot?: string | null;
  } = {
    serviceDate: newDate,
    recognizedDate: new Date(`${newDate}T00:00:00+09:00`),
    recognizedMonth: newRecognizedMonth,
    updatedAt: new Date(),
  };

  if (newSpotId && newSpotId !== payment.spotId) {
    data.spotId = newSpotId;

    const spot = await prisma.spot.findUnique({
      where: { id: newSpotId },
      select: { code: true, label: true },
    });

    if (spot) {
      data.spotCodeSnapshot = spot.code;
      data.spotLabelSnapshot = spot.label;
    }
  }

  await prisma.payment.update({
    where: { id: payment.id },
    data,
  });

  const oldRecognizedMonth = payment.recognizedMonth;

  if (oldRecognizedMonth !== newRecognizedMonth) {
    await sendSlackNotification(
      [
        `決済の計上月が変わりました（${oldRecognizedMonth} → ${newRecognizedMonth}）`,
        `予約ID：${reservationId}`,
        `日付：${oldDate} → ${newDate}`,
        `PaymentID：${payment.id}`,
      ].join("\n")
    );
  }

  return { updated: true };
}
