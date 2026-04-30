export const runtime = "nodejs";
export const preferredRegion = "hnd1";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const paymentRef = String(searchParams.get("paymentRef") ?? "").trim();

    if (!paymentRef) {
      return NextResponse.json(
        { ok: false, error: "missing_paymentRef", message: "paymentRef が必要です" },
        { status: 400 }
      );
    }

    const receipt = await prisma.receipt.findFirst({
      where: { paymentRef },
      orderBy: { createdAt: "desc" },
      select: {
        receiptNo: true,
        issuedAt: true,
        useDate: true,
        parkingName: true,
        slot: true,
        customerName: true,
        plate: true,
        subtotal: true,
        tax: true,
        total: true,
        taxRate: true,
        paymentRef: true,
        issuerName: true,
        issuerInvoiceNo: true,
        invoiceStatus: true,
      },
    });

    if (!receipt) {
      return NextResponse.json(
        { ok: false, error: "receipt_not_found", message: "領収書が見つかりません" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      receiptNo: receipt.receiptNo,
      issuedAt: receipt.issuedAt,
      useDate: receipt.useDate,
      placeName: receipt.parkingName,
      spotLabel: receipt.slot,
      customerName: receipt.customerName,
      plate: receipt.plate,
      subtotal: receipt.subtotal,
      tax: receipt.tax,
      totalYen: receipt.total,
      taxRate: receipt.taxRate,
      paymentRef: receipt.paymentRef,
      issuerName: receipt.issuerName,
      issuerInvoiceNo: receipt.issuerInvoiceNo,
      invoiceStatus: receipt.invoiceStatus,
    });
  } catch (e: any) {
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