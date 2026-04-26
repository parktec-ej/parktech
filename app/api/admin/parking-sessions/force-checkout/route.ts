import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminSession } from "@/lib/admin-auth";

type ForceCheckoutBody = {
  parkingSessionId?: unknown;
};

function jsonError(error: string, status: number, message?: string) {
  return NextResponse.json(
    {
      ok: false,
      error,
      ...(message ? { message } : {}),
    },
    { status }
  );
}

export async function POST(req: Request) {
  const admin = await getAdminSession();

  if (!admin) {
    return jsonError("unauthorized", 401);
  }

  try {
    const body = (await req.json().catch(() => null)) as ForceCheckoutBody | null;

    if (!body || typeof body !== "object") {
      return jsonError("invalid_json", 400);
    }

    const parkingSessionId = String(body.parkingSessionId ?? "").trim();

    if (!parkingSessionId) {
      return jsonError("parking_session_id_required", 400);
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
      return jsonError("parking_session_not_found", 404);
    }

    if (session.status === "OUT" || session.checkOutAt) {
      return NextResponse.json({
        ok: true,
        status: "already_checked_out",
        parkingSessionId,
        checkedOutAt: session.checkOutAt?.toISOString() ?? null,
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
      checkedOutAt: now.toISOString(),
      note: "駐車状態のみ終了。精算完了ではありません。",
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);

    console.error("POST /api/admin/reservations/force-checkout error:", e);

    return jsonError("server_error", 500, message);
  }
}