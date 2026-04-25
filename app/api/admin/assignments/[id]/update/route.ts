import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getAdminSession } from "@/lib/admin-auth";

function redirectToList(req: Request, suffix = "") {
  const url = new URL(req.url);

  return NextResponse.redirect(
    new URL(`/admin/assignments${suffix}`, url.origin),
    { status: 303 }
  );
}

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminSession();

  if (!admin) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 }
    );
  }

  const { id } = await context.params;

  try {
    const form = await req.formData();

    const placeId = String(form.get("placeId") ?? "").trim();
    const ownerId = String(form.get("ownerId") ?? "").trim();
    const agentIdRaw = String(form.get("agentId") ?? "").trim();
    const agentId = agentIdRaw || null;

    const ownerRateBps = Number(form.get("ownerRateBps") ?? NaN);
    const agentRateBps = Number(form.get("agentRateBps") ?? NaN);
    const platformRateBps = Number(form.get("platformRateBps") ?? NaN);

    const startsAtRaw = String(form.get("startsAt") ?? "").trim();
    const endsAtRaw = String(form.get("endsAt") ?? "").trim();
    const isActive = form.get("isActive") === "on";
    const note = String(form.get("note") ?? "").trim();

    if (!placeId) return redirectToList(req, `/${id}?error=place_required`);
    if (!ownerId) return redirectToList(req, `/${id}?error=owner_required`);

    if (
      !Number.isFinite(ownerRateBps) ||
      !Number.isFinite(agentRateBps) ||
      !Number.isFinite(platformRateBps)
    ) {
      return redirectToList(req, `/${id}?error=invalid_rate`);
    }

    if (ownerRateBps + agentRateBps + platformRateBps !== 10000) {
      return redirectToList(req, `/${id}?error=rate_total_must_be_10000`);
    }

    const startsAt = startsAtRaw
      ? new Date(`${startsAtRaw}T00:00:00+09:00`)
      : null;

    const endsAt = endsAtRaw
      ? new Date(`${endsAtRaw}T00:00:00+09:00`)
      : null;

    if (!startsAt || Number.isNaN(startsAt.getTime())) {
      return redirectToList(req, `/${id}?error=startsAt_required`);
    }

    if (endsAt && Number.isNaN(endsAt.getTime())) {
      return redirectToList(req, `/${id}?error=endsAt_invalid`);
    }

    if (endsAt && endsAt < startsAt) {
      return redirectToList(req, `/${id}?error=endsAt_before_startsAt`);
    }

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const current = await tx.placeAssignment.findUnique({
        where: { id },
        select: { id: true, placeId: true },
      });

      if (!current) {
        throw new Error("assignment_not_found");
      }

      if (isActive) {
        await tx.placeAssignment.updateMany({
          where: {
            placeId,
            id: { not: id },
          },
          data: {
            isActive: false,
          },
        });
      }

      await tx.placeAssignment.update({
        where: { id },
        data: {
          placeId,
          ownerId,
          agentId,
          ownerRateBps,
          agentRateBps,
          platformRateBps,
          startsAt,
          endsAt,
          isActive,
          note: note || null,
        },
      });
    });

    return redirectToList(req, "?updated=1");
  } catch (e: any) {
    return redirectToList(
      req,
      `/${id}?error=${encodeURIComponent(String(e?.message ?? e))}`
    );
  }
}