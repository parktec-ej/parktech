export const runtime = "nodejs";
export const preferredRegion = "hnd1";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getTenantSession } from "@/lib/tenant-auth";
import { calcTax } from "@/lib/settlement-math";

const ISSUER_NAME = process.env.ISSUER_NAME || "パークテックイーストジャパン";
const ISSUER_INVOICE_NO = process.env.ISSUER_INVOICE_NO || "T5810943607466";

function yen(v: number) {
  return Number(v || 0).toLocaleString("ja-JP");
}

function billingPeriodLabel(p: string) {
  const m = p.match(/^(\d{4})-(\d{2})$/);
  if (!m) return p;
  return `${m[1]}年${Number(m[2])}月`;
}

function formatDateTime(d: Date) {
  return d.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
}

function formatYmd(d: Date) {
  return d.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}

export async function GET(
  _req: Request,
  context: { params: Promise<{ paymentId: string }> }
) {
  const session = await getTenantSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  try {
    const { paymentId } = await context.params;

    const payment = await prisma.monthlySubscriptionPayment.findUnique({
      where: { id: paymentId },
      include: { contract: { include: { place: true } }, tenant: true },
    });

    if (!payment) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    // 他人の領収書を防ぐ：ログイン中の tenantId と必ず一致させる
    if (payment.tenantId !== session.tenantId) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const total = payment.amountYen;
    const { subtotal, tax, taxRate } = calcTax(total);
    const customerName = payment.tenant.name;
    const periodLabel = billingPeriodLabel(payment.billingPeriod);
    const note = `月極駐車場利用料 ${periodLabel}分として`;
    const placeName = payment.contract.place.name;

    const html = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8" />
<title>領収書（適格請求書）</title>
<style>
body{
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
  margin:40px;
  color:#111;
}
.wrap{ max-width:820px; margin:0 auto; }
.card{ border:1px solid #ddd; border-radius:16px; padding:28px; }
h1{ font-size:32px; margin-bottom:20px; }
.amount{ font-size:34px; font-weight:800; margin:24px 0; }
.sec{ margin-top:20px; padding-top:16px; border-top:1px solid #eee; }
@media print{ button{display:none;} }
</style>
</head>
<body>
<div class="wrap">
<h1>領収書</h1>

<div class="card">

<div>
<div>宛名: ${customerName} 様</div>
<div>但し書き: ${note}</div>
</div>

<div class="sec">
<div>駐車場: ${placeName}</div>
<div>対象月: ${periodLabel}</div>
<div>取引年月日: ${formatYmd(payment.paidAt)}</div>
</div>

<div class="amount">
お支払い金額: ${yen(total)} 円（税込）
</div>

<div class="sec">
<div>税抜金額: ${yen(subtotal)} 円</div>
<div>消費税(${taxRate}%対象): ${yen(tax)} 円</div>
<div>税込金額: ${yen(total)} 円</div>
</div>

<div class="sec">
<div>発行者: ${ISSUER_NAME}</div>
<div>登録番号: ${ISSUER_INVOICE_NO}</div>
<div>領収書番号: ${payment.receiptNumber}</div>
<div>発行日時: ${formatDateTime(new Date())}</div>
</div>

</div>

<br />
<button onclick="window.print()">印刷 / PDF保存</button>
</div>
</body>
</html>
`;

    return new NextResponse(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (e: any) {
    console.error("tenant receipt route error:", e);
    return NextResponse.json(
      { ok: false, error: "server_error", message: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}
