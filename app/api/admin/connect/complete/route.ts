export const runtime = "nodejs";
export const preferredRegion = "hnd1";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminSession } from "@/lib/admin-auth";

function jsonError(error: string, status = 400, message?: string) {
  return NextResponse.json(
    { ok: false, error, ...(message ? { message } : {}) },
    { status }
  );
}

export async function POST(req: Request) {
  const admin = await getAdminSession();
  if (!admin) return jsonError("unauthorized", 401);

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return jsonError("invalid_json");

    const targetType = String(body.targetType ?? "").trim() as "owner" | "agent";
    const targetId = String(body.targetId ?? "").trim();
    if (targetType !== "owner" && targetType !== "agent") {
      return jsonError("invalid_target_type");
    }
    if (!targetId) return jsonError("target_id_required");

    if (targetType === "owner") {
      await prisma.owner.update({
        where: { id: targetId },
        data: { stripeOnboardingComplete: true },
      });
    } else {
      await prisma.agent.update({
        where: { id: targetId },
        data: { stripeOnboardingComplete: true },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[admin/connect/complete] error:", error);
    return jsonError(
      "server_error",
      500,
      error instanceof Error ? error.message : String(error)
    );
  }
}
