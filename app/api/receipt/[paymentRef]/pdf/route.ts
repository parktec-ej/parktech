export const runtime = "nodejs";
export const preferredRegion = "hnd1";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { calcTax } from "@/lib/settlement-math";

function yen(v: number) {
  return Number(v || 0).toLocaleString("ja-JP");
}

function formatDate(v: Date | string | null | undefined) {
  if (!v) return "";
  if (typeof v === "string") return v;
  return v.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
}

function formatYmd(v: Date | string | null | undefined) {
  if (!v) return "";
  if (typeof v === "string") return v;
  return v.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}

function parseMemoLine(memo: string, key: string) {
  const line = memo
    .split("\n")
    .find((v) => v.trim().startsWith(`${key}=`));
  if (!line) return "";
  return line.replace(`${key}=`, "").trim();
}

export async function GET(
  req: Request,
  context: { params: Promise<{ paymentRef: string }> }
) {
  try {
    const { paymentRef } = await context.params;

    if (!paymentRef) {
      return NextResponse.json(
        { ok: false, error: "missing_paymentRef" },
        { status: 400 }
      );
    }

    const url = new URL(req.url);
    const overrideName = String(url.searchParams.get("name") ?? "").trim();

    const payment = await prisma.payment.findFirst({
      where: { paymentRef },
      orderBy: { createdAt: "desc" },
    });

    const reservation = await prisma.reservation.findFirst({
      where: { paymentRef },
      include: {
        place: true,
        spot: true,
      },
      orderBy: { createdAt: "desc" },
    });

    const parkingSession = await prisma.parkingSession.findFirst({
      where: { paymentRef },
      include: {
        place: true,
        spot: true,
      },
      orderBy: { createdAt: "desc" },
    });

    if (!payment && !reservation && !parkingSession) {
      return NextResponse.json(
        { ok: false, error: "not_found" },
        { status: 404 }
      );
    }

    // -----------------------
    // 種別判定
    // -----------------------
    const memo = String(payment?.memo ?? "");
    // 構造化カラム優先。旧予約（カラム未設定）は memo 文字列でフォールバック判定
    const isBus =
      reservation?.reservationType === "bus" || memo.includes("BUS_RESERVATION");
    const isHourly = !!parkingSession || payment?.kind === "HOURLY";

    const total =
      payment?.grossAmount ??
      reservation?.price ??
      parkingSession?.totalYen ??
      0;

    const { subtotal, tax } = calcTax(total);

    const customerName =
      overrideName ||
      reservation?.name ||
      payment?.customerNameSnapshot ||
      "ご利用者様";

    const parkingName =
      payment?.placeNameSnapshot ||
      reservation?.place?.name ||
      parkingSession?.place?.name ||
      "";

    const slot =
      payment?.spotLabelSnapshot ||
      payment?.spotCodeSnapshot ||
      reservation?.slot ||
      reservation?.spot?.label ||
      reservation?.spot?.code ||
      parkingSession?.spot?.label ||
      parkingSession?.spot?.code ||
      "";

    const plate =
      reservation?.plate ||
      payment?.plateSnapshot ||
      parkingSession?.plate ||
      "";

    const useDate =
      reservation?.date ||
      formatYmd(payment?.serviceDate) ||
      formatYmd(parkingSession?.checkInAt);

    let note = "駐車場予約利用料として";
    if (isHourly) note = "駐車場時間貸し利用料として";
    if (isBus) note = "バス予約利用料として";

    let extra = "";

    // -----------------------
    // バス予約追加表示
    // -----------------------
    if (isBus) {
      // 構造化カラム優先、無ければ memo パースにフォールバック
      const eventName = reservation?.eventName || "";
      const vehicleTypeLabel =
        reservation?.vehicleType === "bus"
          ? "バス"
          : reservation?.vehicleType === "car"
          ? "普通車"
          : "";

      const company = parseMemoLine(memo, "companyName");
      const contact = parseMemoLine(memo, "contactName");
      const phone = parseMemoLine(memo, "phone");
      const arrival = reservation?.arrivalTime || parseMemoLine(memo, "arrivalTime");

      extra = `
        ${eventName ? `<div>イベント名: ${eventName}</div>` : ""}
        ${vehicleTypeLabel ? `<div>車両タイプ: ${vehicleTypeLabel}</div>` : ""}
        ${company ? `<div>会社名: ${company}</div>` : ""}
        ${contact ? `<div>担当者名: ${contact}</div>` : ""}
        ${phone ? `<div>電話番号: ${phone}</div>` : ""}
        ${arrival ? `<div>到着予定時刻: ${arrival}</div>` : ""}
      `;
    }

    // -----------------------
    // 時間貸し表示
    // -----------------------
    let usageHtml = "";

    if (isHourly && parkingSession) {
      usageHtml = `
        <div>入庫時間: ${formatDate(parkingSession.checkInAt)}</div>
        <div>出庫時間: ${formatDate(parkingSession.checkOutAt)}</div>
        <div>利用時間: ${parkingSession.totalMinutes ?? 0} 分</div>
      `;
    }

    const html = `
<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8" />
<title>領収書</title>
<style>
body{
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
  margin:40px;
  color:#111;
}
.wrap{
  max-width:820px;
  margin:0 auto;
}
.card{
  border:1px solid #ddd;
  border-radius:16px;
  padding:28px;
}
h1{
  font-size:32px;
  margin-bottom:20px;
}
.amount{
  font-size:34px;
  font-weight:800;
  margin:24px 0;
}
.sec{
  margin-top:20px;
  padding-top:16px;
  border-top:1px solid #eee;
}
@media print{
  button{display:none;}
}
</style>
</head>
<body>
<div class="wrap">
<h1>領収書</h1>

<div class="card">

<div>
<div>宛名: ${customerName}</div>
<div>但し書き: ${note}</div>
</div>

<div class="sec">
<div>駐車場: ${parkingName}</div>
<div>区画: ${slot}</div>
<div>利用日: ${useDate}</div>
${plate ? `<div>車両ナンバー: ${plate}</div>` : ""}
${usageHtml}
${extra}
</div>

<div class="amount">
お支払い金額: ${yen(total)} 円
</div>

<div class="sec">
<div>税抜金額: ${yen(subtotal)} 円</div>
<div>消費税(10%): ${yen(tax)} 円</div>
<div>税込金額: ${yen(total)} 円</div>
</div>

<div class="sec">
<div>発行者: パークテックイーストジャパン</div>
<div>登録番号: T5810943607466</div>
<div>決済ID: ${paymentRef}</div>
<div>発行日時: ${formatDate(new Date())}</div>
</div>

</div>

<br />
<button onclick="window.print()">印刷 / PDF保存</button>
</div>
</body>
</html>
`;

    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
      },
    });
  } catch (e: any) {
    console.error("receipt route error:", e);

    return NextResponse.json(
      {
        ok: false,
        error: "server_error",
        message: String(e?.message ?? e),
      },
      { status: 500 }
    );
  }
}