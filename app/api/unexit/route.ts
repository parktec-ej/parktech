export const runtime = "nodejs";
export const preferredRegion = "hnd1";

import { prisma } from "@/lib/db";
import { verifyUnexitToken } from "@/lib/unexit-token";
import { sendSlackNotification } from "@/lib/slack";

function htmlPage(title: string, message: string): Response {
  const body = `<!doctype html><html lang="ja"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title></head>
<body style="font-family:sans-serif;background:#f5f5f5;margin:0;padding:24px">
<div style="max-width:520px;margin:40px auto;background:#fff;border-radius:12px;padding:28px;box-shadow:0 1px 4px rgba(0,0,0,.08)">
<h2 style="margin-top:0">${title}</h2>
<p style="line-height:1.8;color:#333">${message}</p>
<hr style="margin:24px 0;border:none;border-top:1px solid #eee" />
<p style="color:#888;font-size:13px">ParkTec</p>
</div></body></html>`;
  return new Response(body, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("t") ?? "";
  const payload = verifyUnexitToken(token);

  if (!payload) {
    return htmlPage("リンクが無効です", "お手数ですが、メール本文のリンクをもう一度お試しください。解決しない場合は管理者までお問い合わせください。");
  }

  const reservation = await prisma.reservation.findUnique({
    where: { id: payload.r },
    select: { id: true, checkedOutAt: true, place: { select: { name: true } } },
  });

  if (!reservation) {
    return htmlPage("予約が見つかりません", "対象の予約が確認できませんでした。管理者までお問い合わせください。");
  }

  const now = new Date();

  if (payload.a === "left") {
    if (!reservation.checkedOutAt) {
      await prisma.reservation.updateMany({
        where: { id: reservation.id, checkedOutAt: null },
        data: { checkedOutAt: now, selfCheckedOut: true },
      });
    }
    return htmlPage("ありがとうございました", "出庫の確認が完了しました。ご協力ありがとうございました。またのご利用をお待ちしております。");
  }

  await prisma.reservation.updateMany({
    where: { id: reservation.id, unexitAckAt: null },
    data: { unexitAckAt: now },
  });
  await sendSlackNotification(
    ["🅿️ 未出庫: お客様が「まだ駐車中」と回答", `reservationId: ${reservation.id}`, `駐車場: ${reservation.place?.name ?? "-"}`].join("\n")
  );
  return htmlPage("承知しました", "お帰りの際は、お手数ですが出口のQRコードを読み取って出庫手続きをお願いいたします。追加のお支払いは発生しません。");
}
