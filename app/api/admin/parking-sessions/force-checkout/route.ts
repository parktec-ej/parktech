import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminSession } from "@/lib/admin-auth";

export async function POST(req: Request) {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => null);

    if (!body) {
      return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
    }

    const parkingSessionId = String(body.parkingSessionId ?? "").trim();

    if (!parkingSessionId) {
      return NextResponse.json(
        { ok: false, error: "parking_session_id_required" },
        { status: 400 }
      );
    }

    const session = await prisma.parkingSession.findUnique({
      where: { id: parkingSessionId },
      select: {
        id: true,
        status: true,
        checkOutAt: true,
        paid: true,
        reservationId: true,
      },
    });

    if (!session) {
      return NextResponse.json(
        { ok: false, error: "parking_session_not_found" },
        { status: 404 }
      );
    }

    if (session.status === "OUT" || session.checkOutAt) {
      return NextResponse.json({
        ok: true,
        status: "already_checked_out",
        parkingSessionId,
      });
    }

    const now = new Date();

    await prisma.parkingSession.update({
      where: { id: parkingSessionId },
      data: {
        status: "OUT",
        checkOutAt: now,
      },
    });

    return NextResponse.json({
      ok: true,
      status: "forced_checked_out",
      parkingSessionId,
      checkedOutAt: now,
      note: "駐車状態のみ終了。精算完了ではありません。",
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