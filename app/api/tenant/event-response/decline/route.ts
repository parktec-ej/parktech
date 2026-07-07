export const runtime = "nodejs";
export const preferredRegion = "hnd1";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendSlackNotification } from "@/lib/slack";
import { verifyEventToken } from "@/lib/event-token";

const APP_URL = (
  process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
).trim();

function htmlPage(inner: string) {
  return new NextResponse(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div style="font-family:sans-serif;max-width:520px;margin:40px auto;padding:0 16px;line-height:1.8;color:#111">${inner}<p style="margin-top:16px"><a href="${APP_URL}/tenant/dashboard">契約者ページへ</a></p></div>`,
    { status: 200, headers: { "content-type": "text/html; charset=utf-8" } }
  );
}

// GET: 確認ページ（メールスキャナの誤クリックで実行されないよう、確定はPOST）
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const payload = verifyEventToken(token);
  if (!payload || payload.a !== "decline") {
    return htmlPage("<h2>リンクが無効です</h2><p>契約者ページからお手続きください。</p>");
  }
  return htmlPage(`
    <h2>イベント日を「利用しない」にしますか？</h2>
    <p>対象日: ${payload.d}</p>
    <p>「利用しない」を確定すると、当日はこの区画を利用しないものとして受け付けます。一般枠が満車になった場合のみ、この区画が一般のお客様の申請（要承認）の対象になることがあります。この操作は取り消せません。</p>
    <form method="POST" action="${APP_URL}/api/tenant/event-response/decline">
      <input type="hidden" name="token" value="${token}" />
      <button type="submit" style="background:#111;color:#fff;border:none;padding:12px 20px;border-radius:8px;font-weight:bold;cursor:pointer">利用しないを確定する</button>
    </form>
  `);
}

// POST: 確定（DECLINED化＋承認待ち枠化＋Slack）
export async function POST(req: NextRequest) {
  let token = "";
  try {
    const form = await req.formData();
    token = String(form.get("token") ?? "");
  } catch {
    token = "";
  }
  const payload = verifyEventToken(token);
  if (!payload || payload.a !== "decline") {
    return htmlPage("<h2>リンクが無効です</h2><p>契約者ページからお手続きください。</p>");
  }

  try {
    const contract = await prisma.monthlyContract.findUnique({
      where: { id: payload.c },
      include: { place: true, tenant: true },
    });
    if (!contract || !contract.spotId || !contract.place) {
      return htmlPage("<h2>受付できません</h2><p>契約が見つかりませんでした。</p>");
    }
    const place = contract.place;
    const date = payload.d;

    const reserved = await prisma.reservation.findFirst({
      where: { spotId: contract.spotId, date, status: "CONFIRMED" },
      select: { id: true },
    });
    if (reserved) {
      return htmlPage("<h2>既にご予約済みです</h2><p>この日は予約が入っているため、利用しない手続きはできません。</p>");
    }

    await prisma.monthlyEventResponse.upsert({
      where: { contractId_date: { contractId: contract.id, date } },
      update: { status: "DECLINED", respondedAt: new Date() },
      create: {
        contractId: contract.id,
        placeId: place.id,
        spotId: contract.spotId,
        date,
        status: "DECLINED",
        respondedAt: new Date(),
      },
    });

    // マーカー(RESERVATION_ONLY)は書かない。契約は ACTIVE のまま残し、
    // 満車時に「要承認」枠として登場させる（自動の白開放はしない）。

    await sendSlackNotification(
      `【月極・利用しない】${contract.tenant.name} さんが ${date} のイベント日を「利用しない」と回答。承認待ち枠として受け付けます（満車時に一般申請可）。`
    ).catch(() => {});

    return htmlPage(
      `<h2>受付しました</h2><p>${date} のイベント日は「利用しない」で承りました。ありがとうございます。</p>`
    );
  } catch (error) {
    console.error("[tenant/event-response/decline] error:", error);
    return htmlPage("<h2>エラーが発生しました</h2><p>時間をおいて再度お試しください。</p>");
  }
}
