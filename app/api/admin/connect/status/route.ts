export const runtime = "nodejs";
export const preferredRegion = "hnd1";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminSession } from "@/lib/admin-auth";
import { getAccountStatus } from "@/lib/stripe-connect";

function jsonError(error: string, status = 400, message?: string) {
  return NextResponse.json(
    { ok: false, error, ...(message ? { message } : {}) },
    { status }
  );
}

export async function GET(req: Request) {
  const admin = await getAdminSession();
  if (!admin) return jsonError("unauthorized", 401);

  try {
    const url = new URL(req.url);
    const targetType = (url.searchParams.get("targetType") ?? "").trim() as
      | "owner"
      | "agent";
    const targetId = (url.searchParams.get("targetId") ?? "").trim();

    if (targetType !== "owner" && targetType !== "agent") {
      return jsonError("invalid_target_type");
    }
    if (!targetId) return jsonError("target_id_required");

    const target =
      targetType === "owner"
        ? await prisma.owner.findUnique({
            where: { id: targetId },
            select: { id: true, stripeAccountId: true, stripeOnboardingComplete: true },
          })
        : await prisma.agent.findUnique({
            where: { id: targetId },
            select: { id: true, stripeAccountId: true, stripeOnboardingComplete: true },
          });

    if (!target) return jsonError("target_not_found", 404);

    if (!target.stripeAccountId) {
      return NextResponse.json({
        ok: true,
        connected: false,
        stripeOnboardingComplete: false,
      });
    }

    const status = await getAccountStatus(target.stripeAccountId);

    return NextResponse.json({
      ok: true,
      connected: true,
      stripeOnboardingComplete: target.stripeOnboardingComplete,
      ...status,
    });
  } catch (error) {
    console.error("[admin/connect/status] error:", error);
    return jsonError(
      "server_error",
      500,
      error instanceof Error ? error.message : String(error)
    );
  }
}
