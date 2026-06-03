export const runtime = "nodejs";
export const preferredRegion = "hnd1";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminSession } from "@/lib/admin-auth";

const BOM = "﻿";

function csvField(v: string | number | null | undefined): string {
  if (v == null) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function fmtYmdSlash(d: Date | string | null | undefined): string {
  if (!d) return "";
  const dt = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(dt.getTime())) return "";
  const yyyy = dt.toLocaleDateString("ja-JP", { year: "numeric", timeZone: "Asia/Tokyo" }).replace(/[^0-9]/g, "");
  const mm = String(dt.toLocaleDateString("ja-JP", { month: "2-digit", timeZone: "Asia/Tokyo" })).replace(/[^0-9]/g, "").padStart(2, "0");
  const dd = String(dt.toLocaleDateString("ja-JP", { day: "2-digit", timeZone: "Asia/Tokyo" })).replace(/[^0-9]/g, "").padStart(2, "0");
  return `${yyyy}/${mm}/${dd}`;
}

function monthEndDate(month: string): Date {
  // month = "2026-05"
  const [y, m] = month.split("-").map(Number);
  // last day of that month in JST
  return new Date(Date.UTC(y, m, 0, 0, 0, 0)); // 月末日 JST(00:00 UTC = 当日09:00 JST)
}

function monthLabel(month: string): string {
  // "2026-05" -> "2026年05月"
  const [y, m] = month.split("-");
  return `${y}年${m}月`;
}

export async function GET(req: Request) {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 }
    );
  }

  const url = new URL(req.url);
  const month = (url.searchParams.get("month") ?? "").trim();
  const type = (url.searchParams.get("type") ?? "detail").trim() as
    | "journal"
    | "detail";

  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json(
      { ok: false, error: "invalid_month", message: "month は YYYY-MM 形式" },
      { status: 400 }
    );
  }

  try {
    if (type === "journal") {
      return await journalCsv(month);
    }
    return await detailCsv(month);
  } catch (e: any) {
    console.error("[admin/settlements/csv] error:", e);
    return NextResponse.json(
      {
        ok: false,
        error: "server_error",
        message: e?.message ?? String(e),
      },
      { status: 500 }
    );
  }
}

async function journalCsv(month: string): Promise<Response> {
  const payments = await prisma.payment.findMany({
    where: {
      recognizedMonth: month,
      status: { in: ["CONFIRMED", "SETTLED"] },
    },
    select: {
      id: true,
      recognizedDate: true,
      grossAmount: true,
      ownerAmount: true,
      agentAmount: true,
      stripeFeeAmount: true,
      placeNameSnapshot: true,
      spotLabelSnapshot: true,
      spotCodeSnapshot: true,
      customerNameSnapshot: true,
      plateSnapshot: true,
      ownerNameSnapshot: true,
      agentNameSnapshot: true,
    },
    orderBy: { recognizedDate: "asc" },
  });

  const settlements = await prisma.settlement.findMany({
    where: { month, status: { not: "CANCELLED" } },
    include: {
      Owner: { select: { name: true, displayName: true } },
      Agent: { select: { name: true, displayName: true } },
      Place: { select: { name: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const monthEnd = monthEndDate(month);
  const stripeFeeTotal = payments.reduce(
    (s, p) => s + (p.stripeFeeAmount ?? 0),
    0
  );

  type Row = {
    date: Date;
    debit: string;
    debitSub: string;
    debitTax: string;
    debitAmount: number;
    credit: string;
    creditSub: string;
    creditTax: string;
    creditAmount: number;
    memo: string;
  };
  const rows: Row[] = [];

  for (const p of payments) {
    const spot = p.spotLabelSnapshot ?? p.spotCodeSnapshot ?? "";
    const customer = p.customerNameSnapshot ?? p.plateSnapshot ?? "";
    const memoBase = `${p.placeNameSnapshot} ${spot} ${customer}`.trim();

    // a) 売上計上
    rows.push({
      date: p.recognizedDate,
      debit: "売掛金",
      debitSub: "",
      debitTax: "",
      debitAmount: p.grossAmount,
      credit: "売上高",
      creditSub: "",
      creditTax: "",
      creditAmount: p.grossAmount,
      memo: memoBase,
    });

    // e) オーナー報酬計上
    if (p.ownerAmount > 0) {
      rows.push({
        date: p.recognizedDate,
        debit: "業務委託費",
        debitSub: "",
        debitTax: "",
        debitAmount: p.ownerAmount,
        credit: "未払金",
        creditSub: "",
        creditTax: "",
        creditAmount: p.ownerAmount,
        memo: `駐車場オーナー報酬 ${p.ownerNameSnapshot}`,
      });
    }

    // f) 代理店報酬計上
    if (p.agentAmount > 0) {
      rows.push({
        date: p.recognizedDate,
        debit: "業務委託費",
        debitSub: "",
        debitTax: "",
        debitAmount: p.agentAmount,
        credit: "未払金",
        creditSub: "",
        creditTax: "",
        creditAmount: p.agentAmount,
        memo: `代理店報酬 ${p.agentNameSnapshot ?? ""}`.trim(),
      });
    }
  }

  // b) Stripe決済手数料 (月末)
  if (stripeFeeTotal > 0) {
    rows.push({
      date: monthEnd,
      debit: "支払手数料",
      debitSub: "",
      debitTax: "",
      debitAmount: stripeFeeTotal,
      credit: "売掛金",
      creditSub: "",
      creditTax: "",
      creditAmount: stripeFeeTotal,
      memo: `Stripe決済手数料 ${monthLabel(month)}分`,
    });
  }

  for (const s of settlements) {
    const paidAt = s.paidAt ?? monthEnd;
    // c) オーナー支払
    if (s.finalOwnerPayoutAmount > 0) {
      rows.push({
        date: paidAt,
        debit: "未払金",
        debitSub: "",
        debitTax: "",
        debitAmount: s.finalOwnerPayoutAmount,
        credit: "普通預金",
        creditSub: "",
        creditTax: "",
        creditAmount: s.finalOwnerPayoutAmount,
        memo: `駐車場オーナー報酬 ${s.Owner?.displayName || s.Owner?.name || ""} ${monthLabel(month)}分`,
      });
    }
    // d) 代理店支払
    if (s.agentId && s.finalAgentPayoutAmount > 0) {
      rows.push({
        date: paidAt,
        debit: "未払金",
        debitSub: "",
        debitTax: "",
        debitAmount: s.finalAgentPayoutAmount,
        credit: "普通預金",
        creditSub: "",
        creditTax: "",
        creditAmount: s.finalAgentPayoutAmount,
        memo: `代理店報酬 ${s.Agent?.displayName || s.Agent?.name || ""} ${monthLabel(month)}分`,
      });
    }
  }

  // 取引日でソート
  rows.sort((a, b) => a.date.getTime() - b.date.getTime());

  const header = [
    "取引No",
    "取引日",
    "借方勘定科目",
    "借方補助科目",
    "借方税区分",
    "借方金額",
    "貸方勘定科目",
    "貸方補助科目",
    "貸方税区分",
    "貸方金額",
    "摘要",
  ];

  const lines: string[] = [];
  lines.push(header.map(csvField).join(","));
  rows.forEach((r, idx) => {
    lines.push(
      [
        idx + 1,
        fmtYmdSlash(r.date),
        r.debit,
        r.debitSub,
        r.debitTax,
        r.debitAmount,
        r.credit,
        r.creditSub,
        r.creditTax,
        r.creditAmount,
        r.memo,
      ]
        .map(csvField)
        .join(",")
    );
  });

  const body = BOM + lines.join("\r\n") + "\r\n";
  const filename = `journal_${month}.csv`;

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

async function detailCsv(month: string): Promise<Response> {
  const items = await prisma.settlementItem.findMany({
    where: { Settlement: { month } },
    include: {
      Settlement: {
        include: {
          Owner: { select: { name: true, displayName: true } },
          Agent: { select: { name: true, displayName: true } },
          Place: { select: { name: true } },
        },
      },
      Payment: {
        select: {
          id: true,
          recognizedDate: true,
          grossAmount: true,
          stripeFeeAmount: true,
          spotLabelSnapshot: true,
          spotCodeSnapshot: true,
          customerNameSnapshot: true,
          plateSnapshot: true,
          status: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const header = [
    "精算月",
    "駐車場名",
    "オーナー名",
    "代理店名",
    "決済日",
    "区画",
    "利用者名",
    "売上",
    "オーナー分",
    "代理店分",
    "プラットフォーム分",
    "Stripe手数料",
    "ステータス",
  ];

  const lines: string[] = [];
  lines.push(header.map(csvField).join(","));

  for (const it of items) {
    const p = it.Payment;
    const settle = it.Settlement;
    const placeName = settle.Place?.name ?? "";
    const ownerName = settle.Owner?.displayName || settle.Owner?.name || "";
    const agentName = settle.Agent?.displayName || settle.Agent?.name || "";
    const spot = p ? p.spotLabelSnapshot ?? p.spotCodeSnapshot ?? "" : "";
    const customer = p
      ? p.customerNameSnapshot ?? p.plateSnapshot ?? ""
      : "";
    lines.push(
      [
        settle.month,
        placeName,
        ownerName,
        agentName,
        p ? fmtYmdSlash(p.recognizedDate) : "",
        spot,
        customer,
        it.grossAmount,
        it.ownerAmount,
        it.agentAmount,
        it.platformAmount,
        p?.stripeFeeAmount ?? 0,
        p?.status ?? it.itemType,
      ]
        .map(csvField)
        .join(",")
    );
  }

  const body = BOM + lines.join("\r\n") + "\r\n";
  const filename = `settlement_detail_${month}.csv`;

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
