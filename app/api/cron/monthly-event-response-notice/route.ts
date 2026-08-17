export const runtime = "nodejs";
export const preferredRegion = "hnd1";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendSlackNotification } from "@/lib/slack";
import {
  sendMonthlyEventResponseReminderMail,
  sendMonthlyEventReleasedMail,
} from "@/lib/mail";
import { ymdTodayJst } from "@/lib/pricing-core";
import { ymdMinusDaysUtc } from "@/lib/monthly-event-release";
import {
  MONTHLY_EVENT_RESPONSE_DEADLINE_DAYS,
  MONTHLY_EVENT_PRE_RESPONSE_START_YMD,
} from "@/lib/monthly-config";

const APP_URL = (
  process.env.NEXT_PUBLIC_APP_URL || "https://reserve.parktec-ej.com"
).trim();

// リマインドは回答期限（開催 DEADLINE_DAYS 日前）のさらに3日前＝開催17日前。
// 新しい定数は増やさず、DEADLINE_DAYS から算出する。
const REMINDER_DAYS = MONTHLY_EVENT_RESPONSE_DEADLINE_DAYS + 3;

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.get("authorization") ?? "";
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { ok: false, error: "unauthorized" },
        { status: 401 }
      );
    }
  }

  const today = ymdTodayJst();
  const summary = {
    remindersSent: 0,
    reminderFailed: 0,
    expired: 0,
    expiredMailFailed: 0,
    skippedReserved: 0,
  };
  const errors: string[] = [];

  try {
    // 事前回答方式の対象（切替日以降）かつ未決着（NOTIFIED / RESERVED）のみ。
    // DECLINED / EXPIRED は対象外（フィルタで除外＝再送防止）。8月分（旧フロー）は
    // date < 切替日で除外されるため一切触らない。
    const responses = await prisma.monthlyEventResponse.findMany({
      where: {
        date: { gte: MONTHLY_EVENT_PRE_RESPONSE_START_YMD },
        status: { in: ["NOTIFIED", "RESERVED"] },
      },
      select: {
        id: true,
        contractId: true,
        placeId: true,
        spotId: true,
        date: true,
        status: true,
        notifiedAt: true,
        reminderSentAt: true,
      },
    });

    if (responses.length === 0) {
      return NextResponse.json({ ok: true, today, summary });
    }

    // 関連データを一括取得（契約者は必ず contractId 経由で引く）。
    const contractIds = [...new Set(responses.map((r) => r.contractId))];
    const spotIds = [...new Set(responses.map((r) => r.spotId))];
    const placeIds = [...new Set(responses.map((r) => r.placeId))];
    // 3クエリは逐次実行する。
    const contracts = await prisma.monthlyContract.findMany({
      where: { id: { in: contractIds } },
      select: { id: true, tenant: { select: { name: true, email: true } } },
    });
    const spots = await prisma.spot.findMany({
      where: { id: { in: spotIds } },
      select: { id: true, code: true, label: true },
    });
    const places = await prisma.place.findMany({
      where: { id: { in: placeIds } },
      select: { id: true, name: true },
    });
    const contractById = new Map(contracts.map((c) => [c.id, c]));
    const spotById = new Map(spots.map((s) => [s.id, s]));
    const placeById = new Map(places.map((p) => [p.id, p]));

    const dashboardUrl = `${APP_URL}/tenant/dashboard`;
    const DAY_MS = 24 * 60 * 60 * 1000;
    const now = Date.now();

    for (const r of responses) {
      const deadlineYmd = ymdMinusDaysUtc(
        r.date,
        MONTHLY_EVENT_RESPONSE_DEADLINE_DAYS
      ); // 開催14日前（回答期限）
      const reminderYmd = ymdMinusDaysUtc(r.date, REMINDER_DAYS); // 開催17日前

      const tenant = contractById.get(r.contractId)?.tenant;
      const spot = spotById.get(r.spotId);
      const spotLabel = spot?.label ?? spot?.code ?? r.spotId;
      const placeName = placeById.get(r.placeId)?.name ?? "";

      // ④ 通知直後（notifiedAt から3日未満）は ② の対象から除外。
      // 遅れて登録されたイベントで「回答依頼」と「開放通知」が同時に届くのを防ぐ。
      const recentlyNotified =
        now - new Date(r.notifiedAt).getTime() < 3 * DAY_MS;

      // ② 期限切れ → EXPIRED
      //   RESERVED（未決済）: 日付を問わず対象（案A）
      //   NOTIFIED（未回答）: today > deadlineYmd のときのみ
      const expireEligible =
        r.status === "RESERVED" ||
        (r.status === "NOTIFIED" && today > deadlineYmd);

      if (expireEligible && !recentlyNotified) {
        // 当日その区画に CONFIRMED 予約があれば（決済済）開放しない。
        const reserved = await prisma.reservation.findFirst({
          where: { spotId: r.spotId, date: r.date, status: "CONFIRMED" },
          select: { id: true },
        });
        if (reserved) {
          summary.skippedReserved++;
          continue;
        }

        const reason: "no_response" | "unpaid" =
          r.status === "RESERVED" ? "unpaid" : "no_response";

        // status 更新を先に行い、メール送信失敗で巻き戻さない。
        await prisma.monthlyEventResponse.update({
          where: { id: r.id },
          data: { status: "EXPIRED" },
        });
        summary.expired++;

        if (tenant?.email) {
          try {
            await sendMonthlyEventReleasedMail({
              to: tenant.email,
              tenantName: tenant.name ?? "",
              placeName,
              spotLabel,
              date: r.date,
              reason,
            });
          } catch (e) {
            summary.expiredMailFailed++;
            const msg = `expire mail failed (contract=${r.contractId} date=${r.date}): ${String(e)}`;
            console.error(`[monthly-event-response-notice] ${msg}`);
            errors.push(msg);
          }
        }
        continue;
      }

      // ① リマインド（NOTIFIED・回答期間中・未送信のみ）。
      //   範囲判定: reminderYmd <= today <= deadlineYmd。
      //   reminderSentAt が null のときだけ送信し、成功したら現在時刻を書き込む（重複防止）。
      if (
        r.status === "NOTIFIED" &&
        today >= reminderYmd &&
        today <= deadlineYmd &&
        r.reminderSentAt == null &&
        tenant?.email
      ) {
        try {
          await sendMonthlyEventResponseReminderMail({
            to: tenant.email,
            tenantName: tenant.name ?? "",
            placeName,
            spotLabel,
            date: r.date,
            deadlineDate: deadlineYmd,
            dashboardUrl,
          });
          await prisma.monthlyEventResponse.update({
            where: { id: r.id },
            data: { reminderSentAt: new Date() },
          });
          summary.remindersSent++;
        } catch (e) {
          summary.reminderFailed++;
          const msg = `reminder mail failed (contract=${r.contractId} date=${r.date}): ${String(e)}`;
          console.error(`[monthly-event-response-notice] ${msg}`);
          errors.push(msg);
        }
      }
    }

    // 処理結果を Slack へ集約通知。
    const parts = [
      `リマインド送信 ${summary.remindersSent}`,
      `期限切れ開放 ${summary.expired}`,
      `予約済スキップ ${summary.skippedReserved}`,
    ];
    if (summary.reminderFailed || summary.expiredMailFailed) {
      parts.push(
        `送信失敗(リマインド ${summary.reminderFailed} / 開放 ${summary.expiredMailFailed})`
      );
    }
    await sendSlackNotification(
      `【月極イベント回答cron ${today}】${parts.join(" / ")}${
        errors.length ? `\n${errors.slice(0, 20).join("\n")}` : ""
      }`
    ).catch(() => {});

    return NextResponse.json({ ok: true, today, summary, errors });
  } catch (error) {
    console.error("[cron/monthly-event-response-notice] error:", error);
    await sendSlackNotification(
      `【月極イベント回答cron ${today}】エラー: ${String(error)}`
    ).catch(() => {});
    return NextResponse.json(
      { ok: false, error: "server_error" },
      { status: 500 }
    );
  }
}
