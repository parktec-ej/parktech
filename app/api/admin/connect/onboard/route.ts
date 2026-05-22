export const runtime = "nodejs";
export const preferredRegion = "hnd1";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminSession } from "@/lib/admin-auth";
import { createConnectAccount, createOnboardingLink } from "@/lib/stripe-connect";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

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

    // 対象取得
    const target =
      targetType === "owner"
        ? await prisma.owner.findUnique({
            where: { id: targetId },
            select: { id: true, email: true, stripeAccountId: true },
          })
        : await prisma.agent.findUnique({
            where: { id: targetId },
            select: { id: true, email: true, stripeAccountId: true },
          });

    if (!target) return jsonError("target_not_found", 404);
    if (!target.email) {
      return jsonError(
        "email_required",
        400,
        "Stripe Connect 連携には email が必須です"
      );
    }

    // 既存のアカウントを再利用 or 新規作成
    let stripeAccountId = target.stripeAccountId;
    if (!stripeAccountId) {
      const account = await createConnectAccount({ email: target.email });
      stripeAccountId = account.id;

      if (targetType === "owner") {
        await prisma.owner.update({
          where: { id: targetId },
          data: { stripeAccountId },
        });
      } else {
        await prisma.agent.update({
          where: { id: targetId },
          data: { stripeAccountId },
        });
      }
    }

    const returnUrl = `${APP_URL}/admin/connect/return?targetType=${targetType}&targetId=${encodeURIComponent(targetId)}`;
    const refreshUrl = `${APP_URL}/admin/connect/refresh?targetType=${targetType}&targetId=${encodeURIComponent(targetId)}`;

    const accountLink = await createOnboardingLink({
      accountId: stripeAccountId,
      returnUrl,
      refreshUrl,
    });

    return NextResponse.json({
      ok: true,
      url: accountLink.url,
      accountId: stripeAccountId,
    });
  } catch (e: any) {
    console.error("Connect onboard error:", e);
    return NextResponse.json(
      {
        ok: false,
        error: e?.type || "server_error",
        message: e?.message || String(e),
        code: e?.code || null,
      },
      { status: 500 }
    );
  }
}
