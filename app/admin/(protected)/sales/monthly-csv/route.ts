import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminSession } from "@/lib/admin-auth";

const MIN_PLATFORM_FEE_YEN = 300;

type OwnerMonthPayment = {
  platformAmount: number;
};

type PaymentRow = {
  kind: string;
  recognizedDate: Date;
  serviceDate: string | null;
  spotCodeSnapshot: string | null;
  spotLabelSnapshot: string | null;
  customerNameSnapshot: string | null;
  plateSnapshot: string | null;
  grossAmount: number;
  ownerRateBps: number;
  ownerAmount: number;
  agentRateBps: number;
  agentAmount: number;
  platformRateBps: number;
  platformAmount: number;
  paymentRef: string | null;
  status: string;
  createdAt: Date;
};

function ymTodayJst() {
  const d = new Date();
  const y = d.toLocaleDateString("sv-SE", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
  });
  const m = d.toLocaleDateString("sv-SE", {
    timeZone: "Asia/Tokyo",
    month: "2-digit",
  });
  return `${y}-${m}`;
}

function escapeCsv(value: string | number | null | undefined) {
  const s = String(value ?? "");
  return `"${s.replace(/"/g, '""')}"`;
}

export async function GET(req: Request) {
  const admin = await getAdminSession();

  if (!admin) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(req.url);
    const month = url.searchParams.get("month");
    const placeKey = String(url.searchParams.get("placeId") ?? "").trim();

    const targetMonth =
      month && /^\d{4}-\d{2}$/.test(month) ? month : ymTodayJst();

    const place =
      (placeKey
        ? await prisma.place.findFirst({
            where: {
              isActive: true,
              OR: [{ id: placeKey }, { slug: placeKey }],
            },
            select: { id: true, slug: true, name: true, ownerId: true },
          })
        : null) ??
      (await prisma.place.findFirst({
        where: { slug: "rifu-main", isActive: true },
        select: { id: true, slug: true, name: true, ownerId: true },
      })) ??
      (await prisma.place.findFirst({
        where: { isActive: true },
        select: { id: true, slug: true, name: true, ownerId: true },
      }));

    if (!place) {
      return NextResponse.json(
        { ok: false, error: "place_not_found" },
        { status: 404 }
      );
    }

    const payments: PaymentRow[] = await prisma.payment.findMany({
      where: {
        placeId: place.id,
        recognizedMonth: targetMonth,
        status: "CONFIRMED",
        excludedFromSettlement: false,
      },
      select: {
        kind: true,
        recognizedDate: true,
        serviceDate: true,
        spotCodeSnapshot: true,
        spotLabelSnapshot: true,
        customerNameSnapshot: true,
        plateSnapshot: true,
        grossAmount: true,
        ownerRateBps: true,
        ownerAmount: true,
        agentRateBps: true,
        agentAmount: true,
        platformRateBps: true,
        platformAmount: true,
        paymentRef: true,
        status: true,
        createdAt: true,
      },
      orderBy: [{ recognizedDate: "asc" }, { createdAt: "asc" }],
    });

    const ownerMonthPayments: OwnerMonthPayment[] = place.ownerId
      ? await prisma.payment.findMany({
          where: {
            ownerId: place.ownerId,
            recognizedMonth: targetMonth,
            status: "CONFIRMED",
            excludedFromSettlement: false,
          },
          select: {
            platformAmount: true,
          },
        })
      : [];

    const ownerMonthPlatformRaw = ownerMonthPayments.reduce(
      (sum: number, p: OwnerMonthPayment) => sum + p.platformAmount,
      0
    );

    const monthlyMinFeeAdjustment =
      ownerMonthPayments.length > 0 && ownerMonthPlatformRaw < MIN_PLATFORM_FEE_YEN
        ? MIN_PLATFORM_FEE_YEN - ownerMonthPlatformRaw
        : 0;

    const totalGross = payments.reduce(
      (sum: number, p: PaymentRow) => sum + p.grossAmount,
      0
    );

    const totalOwnerRaw = payments.reduce(
      (sum: number, p: PaymentRow) => sum + p.ownerAmount,
      0
    );

    const totalAgent = payments.reduce(
      (sum: number, p: PaymentRow) => sum + p.agentAmount,
      0
    );

    const totalPlatformRaw = payments.reduce(
      (sum: number, p: PaymentRow) => sum + p.platformAmount,
      0
    );

    const totalOwnerFinal = Math.max(0, totalOwnerRaw - monthlyMinFeeAdjustment);
    const totalPlatformFinal = totalPlatformRaw + monthlyMinFeeAdjustment;

    const lines: string[] = [];

    lines.push(
      [
        "Place",
        "区分",
        "利用日",
        "区画",
        "利用者",
        "車両ナンバー",
        "grossAmount",
        "ownerRate",
        "ownerAmount",
        "agentRate",
        "agentAmount",
        "platformRate",
        "platformAmount",
        "paymentRef",
        "status",
      ].join(",")
    );

    for (const p of payments) {
      const useDate =
        p.kind === "RESERVATION" && p.serviceDate
          ? p.serviceDate
          : new Date(p.recognizedDate).toLocaleDateString("sv-SE", {
              timeZone: "Asia/Tokyo",
            });

      lines.push(
        [
          escapeCsv(place.name),
          escapeCsv(
            p.kind === "RESERVATION"
              ? "予約"
              : p.kind === "HOURLY"
              ? "時間貸し"
              : "イベント"
          ),
          escapeCsv(useDate),
          escapeCsv(p.spotLabelSnapshot || p.spotCodeSnapshot || ""),
          escapeCsv(p.customerNameSnapshot || ""),
          escapeCsv(p.plateSnapshot || ""),
          String(p.grossAmount),
          String(p.ownerRateBps / 100),
          String(p.ownerAmount),
          String(p.agentRateBps / 100),
          String(p.agentAmount),
          String(p.platformRateBps / 100),
          String(p.platformAmount),
          escapeCsv(p.paymentRef || ""),
          escapeCsv(p.status),
        ].join(",")
      );
    }

    lines.push("");
    lines.push(["サマリー", "値"].join(","));
    lines.push([escapeCsv("Place"), escapeCsv(place.name)].join(","));
    lines.push([escapeCsv("月間合計売上"), String(totalGross)].join(","));
    lines.push([escapeCsv("オーナー取り分（調整前）"), String(totalOwnerRaw)].join(","));
    lines.push([escapeCsv("代理店取り分"), String(totalAgent)].join(","));
    lines.push([escapeCsv("本部取り分（調整前）"), String(totalPlatformRaw)].join(","));
    lines.push([escapeCsv("最低利用料基準"), String(MIN_PLATFORM_FEE_YEN)].join(","));
    lines.push([escapeCsv("最低利用料調整額"), String(monthlyMinFeeAdjustment)].join(","));
    lines.push([escapeCsv("オーナー取り分（調整後）"), String(totalOwnerFinal)].join(","));
    lines.push([escapeCsv("本部取り分（調整後）"), String(totalPlatformFinal)].join(","));

    const csv = "\uFEFF" + lines.join("\n");

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="parktech-sales-${place.slug}-${targetMonth}.csv"`,
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "server_error", message: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}