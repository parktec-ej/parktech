export const runtime = "nodejs";
export const preferredRegion = "hnd1";

import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import { getAdminSession } from "@/lib/admin-auth";

function asBps(value: FormDataEntryValue | null) {
  const n = Number(String(value ?? "").trim());
  if (!Number.isFinite(n)) return NaN;
  return Math.round(n);
}

function asDate(value: FormDataEntryValue | null) {
  const s = String(value ?? "").trim();
  if (!s) return null;

  const d = new Date(`${s}T00:00:00+09:00`);

  if (Number.isNaN(d.getTime())) {
    return null;
  }

  return d;
}

export async function POST(req: Request) {
  const admin = await getAdminSession();

  if (!admin) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 }
    );
  }

  try {
    const fd = await req.formData();

    const placeId = String(fd.get("placeId") ?? "").trim();
    const ownerId = String(fd.get("ownerId") ?? "").trim();
    const agentIdRaw = String(fd.get("agentId") ?? "").trim();
    const agentId = agentIdRaw || null;

    const ownerRateBps = asBps(fd.get("ownerRateBps"));
    const agentRateBps = asBps(fd.get("agentRateBps"));
    const platformRateBps = asBps(fd.get("platformRateBps"));

    const startsAt = asDate(fd.get("startsAt"));
    const endsAt = asDate(fd.get("endsAt"));

    const isActive = String(fd.get("isActive") ?? "") === "on";
    const note = String(fd.get("note") ?? "").trim() || null;

    if (!placeId || !ownerId) {
      return NextResponse.json(
        { ok: false, error: "missing_required_fields" },
        { status: 400 }
      );
    }

    if (!startsAt) {
      return NextResponse.json(
        { ok: false, error: "invalid_startsAt" },
        { status: 400 }
      );
    }

    if (
      !Number.isFinite(ownerRateBps) ||
      !Number.isFinite(agentRateBps) ||
      !Number.isFinite(platformRateBps)
    ) {
      return NextResponse.json(
        { ok: false, error: "invalid_rate" },
        { status: 400 }
      );
    }

    if (ownerRateBps + agentRateBps + platformRateBps !== 10000) {
      return NextResponse.json(
        { ok: false, error: "rate_total_must_be_10000" },
        { status: 400 }
      );
    }

    if (endsAt && endsAt < startsAt) {
      return NextResponse.json(
        { ok: false, error: "endsAt_before_startsAt" },
        { status: 400 }
      );
    }

    const overlap = await prisma.placeAssignment.findFirst({
      where: {
        placeId,
        isActive: true,
        OR: [
          {
            startsAt: { lte: startsAt },
            AND: [
              {
                OR: [{ endsAt: null }, { endsAt: { gte: startsAt } }],
              },
            ],
          },
          ...(endsAt
            ? [
                {
                  startsAt: { lte: endsAt },
                  AND: [
                    {
                      OR: [{ endsAt: null }, { endsAt: { gte: endsAt } }],
                    },
                  ],
                },
              ]
            : []),
          ...(endsAt
            ? [
                {
                  startsAt: { gte: startsAt, lte: endsAt },
                },
              ]
            : [
                {
                  startsAt: { gte: startsAt },
                },
              ]),
        ],
      },
      select: { id: true },
    });

    if (overlap) {
      return NextResponse.json(
        { ok: false, error: "assignment_period_overlap" },
        { status: 400 }
      );
    }

    const now = new Date();

    await prisma.placeAssignment.create({
      data: {
        id: crypto.randomUUID(),
        placeId,
        ownerId,
        agentId,
        ownerRateBps,
        agentRateBps,
        platformRateBps,
        startsAt,
        endsAt,
        isActive,
        note,
        createdAt: now,
        updatedAt: now,
      },
    });

    return NextResponse.redirect(
      new URL("/admin/assignments?created=1", req.url),
      { status: 303 }
    );
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);

    return NextResponse.json(
      {
        ok: false,
        error: "server_error",
        message,
      },
      { status: 500 }
    );
  }
}