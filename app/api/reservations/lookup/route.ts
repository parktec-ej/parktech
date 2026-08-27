import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import { sendManageLinkResendMail } from "@/lib/mail";

export const runtime = "nodejs";
export const preferredRegion = "hnd1";

const RESPONSE_MESSAGE =
  "ご入力のメールアドレス宛に、予約内容の確認・変更リンクをお送りしました。";

function todayJst() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const email = String(body?.email ?? "").trim().toLowerCase();

    if (!email || !email.includes("@")) {
      return NextResponse.json(
        {
          ok: false,
          error: "invalid_email",
          message: "メールアドレスを入力してください",
        },
        { status: 400 }
      );
    }

    const reservations = await prisma.reservation.findMany({
      where: {
        email: {
          equals: email,
          mode: "insensitive",
        },
        // Reservation.status のキャンセル値は L が1つの CANCELED
        // （Settlement.status の CANCELLED とは別物）
        status: "CONFIRMED",
        date: {
          gte: todayJst(),
        },
      },
      include: {
        place: {
          select: {
            name: true,
          },
        },
        spot: {
          select: {
            code: true,
            label: true,
          },
        },
      },
      orderBy: { date: "asc" },
      take: 20,
    });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL;

    const items: Array<{
      placeName: string;
      spotLabel: string;
      date: string;
      manageUrl: string;
    }> = [];

    for (const reservation of reservations) {
      let token = reservation.cancelToken;

      if (!token) {
        token = crypto.randomUUID();

        await prisma.reservation.update({
          where: { id: reservation.id },
          data: { cancelToken: token },
        });
      }

      items.push({
        placeName: reservation.place?.name ?? "-",
        spotLabel:
          reservation.spot?.label ?? reservation.spot?.code ?? reservation.slot,
        date: reservation.date,
        manageUrl: `${appUrl}/reservation/manage?token=${encodeURIComponent(
          token
        )}`,
      });
    }

    if (items.length > 0) {
      await sendManageLinkResendMail({
        to: email,
        items,
      });
    }

    // 件数・存在有無は返さない（レスポンスの差から登録有無を判定されないようにするため）
    return NextResponse.json({
      ok: true,
      message: RESPONSE_MESSAGE,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        ok: false,
        error: "server_error",
      },
      { status: 500 }
    );
  }
}
