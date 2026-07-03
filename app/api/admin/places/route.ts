export const runtime = "nodejs";
export const preferredRegion = "hnd1";

import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import { getAdminSession } from "@/lib/admin-auth";

function toSlug(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-_]/g, "");
}

function makeSpotCode(n: number) {
  return `S${String(n).padStart(2, "0")}`;
}

function parseDateJst(dateStr: string | null | undefined) {
  if (!dateStr) return null;
  const d = new Date(`${dateStr}T00:00:00+09:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isValidOperationMode(value: string) {
  return [
    "RESERVATION_ONLY",
    "HOURLY_ONLY",
    "RESERVATION_THEN_HOURLY",
    "EVENT_ONLY",
    "CLOSED",
    "MONTHLY",
  ].includes(value);
}

function isValidContractType(value: string) {
  return ["HQ_BULK", "OWNER_DIRECT", "OWNER_AGENT_PLATFORM"].includes(value);
}

function isValidYearMonth(value: string | null | undefined) {
  if (!value) return false;
  return /^\d{4}-\d{2}$/.test(value);
}

function normalizeAssignmentForResponse(
  assignment: {
    id: string;
    ownerId: string;
    agentId: string | null;
    contractType: string;
    ownerRateBps: number;
    agentRateBps: number;
    platformRateBps: number;
    startsAt: Date;
    endsAt: Date | null;
    isActive: boolean;
    note: string | null;
    Owner: unknown;
    Agent: unknown;
  } | null
) {
  if (!assignment) return null;

  return {
    id: assignment.id,
    ownerId: assignment.ownerId,
    agentId: assignment.agentId,
    contractType: assignment.contractType,
    ownerRateBps: assignment.ownerRateBps,
    agentRateBps: assignment.agentRateBps,
    platformRateBps: assignment.platformRateBps,
    startsAt: assignment.startsAt,
    endsAt: assignment.endsAt,
    isActive: assignment.isActive,
    note: assignment.note,
    owner: assignment.Owner,
    agent: assignment.Agent,
  };
}

export async function GET(_req: Request) {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 }
    );
  }

  try {
    const places = await prisma.place.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        spots: {
          orderBy: { code: "asc" },
          select: {
            id: true,
            code: true,
            label: true,
            isActive: true,
            operationModeOverride: true,
          },
        },
        PlaceAssignment: {
          where: { isActive: true },
          orderBy: { startsAt: "desc" },
          include: {
            Owner: {
              select: {
                id: true,
                name: true,
                displayName: true,
                status: true,
              },
            },
            Agent: {
              select: {
                id: true,
                code: true,
                name: true,
                displayName: true,
                status: true,
              },
            },
          },
        },
        PlaceBillingPolicy: {
          where: { isActive: true },
          orderBy: { startMonth: "desc" },
          take: 1,
        },
      },
    });

    const items = places.map((p) => {
      const currentAssignment = p.PlaceAssignment[0] ?? null;
      const currentBillingPolicy = p.PlaceBillingPolicy[0] ?? null;

      return {
        id: p.id,
        slug: p.slug,
        name: p.name,
        address: p.address,
        googleMapUrl: p.googleMapUrl,
        ownerId: p.ownerId,
        operationMode: p.operationMode,
        isActive: p.isActive,
        createdAt: p.createdAt,
        spotCount: p.spots.length,
        spots: p.spots,
        currentAssignment: normalizeAssignmentForResponse(currentAssignment),
        currentBillingPolicy: currentBillingPolicy
          ? {
              id: currentBillingPolicy.id,
              startMonth: currentBillingPolicy.startMonth,
              endMonth: currentBillingPolicy.endMonth,
              contractType: currentBillingPolicy.contractType,
              taxRateBps: currentBillingPolicy.taxRateBps,
              monthlyMinFeeThreshold:
                currentBillingPolicy.monthlyMinFeeThreshold,
              ownerPayoutFeeBurden: currentBillingPolicy.ownerPayoutFeeBurden,
              agentPayoutFeeBurden: currentBillingPolicy.agentPayoutFeeBurden,
              note: currentBillingPolicy.note,
              isActive: currentBillingPolicy.isActive,
            }
          : null,
      };
    });

    return NextResponse.json({
      ok: true,
      places: items,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);

    console.error("[places][GET] error:", e);

    return NextResponse.json(
      { ok: false, error: "server_error", message },
      { status: 500 }
    );
  }
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
    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json(
        { ok: false, error: "invalid_json" },
        { status: 400 }
      );
    }

    const name = String(body.name ?? "").trim();
    const rawSlug = String(body.slug ?? "").trim();
    const address = body.address ? String(body.address).trim() : null;
    const googleMapUrl = body.googleMapUrl
      ? String(body.googleMapUrl).trim()
      : null;
    const operationMode = String(
      body.operationMode ?? "RESERVATION_THEN_HOURLY"
    ).trim();
    const isActive =
      body.isActive === undefined ? true : Boolean(body.isActive);
    const spotCount = Number(body.spotCount ?? 0);

    const ownerId = String(body.ownerId ?? "").trim();

    const contractType = String(
      body.contractType ?? "OWNER_AGENT_PLATFORM"
    ).trim();

    const agentIdRaw = body.agentId ? String(body.agentId).trim() : "";
    const agentId = agentIdRaw || null;

    const ownerRateBps = Number(body.ownerRateBps ?? NaN);
    const agentRateBps = Number(body.agentRateBps ?? NaN);
    const platformRateBps = Number(body.platformRateBps ?? NaN);

    const startsAtRaw = String(body.startsAt ?? "").trim();
    const endsAtRaw = body.endsAt ? String(body.endsAt).trim() : "";

    const policyStartMonth = String(body.policyStartMonth ?? "").trim();
    const policyEndMonth = body.policyEndMonth
      ? String(body.policyEndMonth).trim()
      : "";
    const taxRateBps = Number(body.taxRateBps ?? 1000);
    const monthlyMinFeeThreshold = Number(body.monthlyMinFeeThreshold ?? 300);
    const ownerPayoutFeeBurden = Boolean(body.ownerPayoutFeeBurden ?? false);
    const agentPayoutFeeBurden = Boolean(body.agentPayoutFeeBurden ?? false);
    const billingNote = body.billingNote
      ? String(body.billingNote).trim()
      : null;

    if (!name) {
      return NextResponse.json(
        { ok: false, error: "name_required" },
        { status: 400 }
      );
    }

    if (!rawSlug) {
      return NextResponse.json(
        { ok: false, error: "slug_required" },
        { status: 400 }
      );
    }

    if (!ownerId) {
      return NextResponse.json(
        { ok: false, error: "owner_required" },
        { status: 400 }
      );
    }

    const slug = toSlug(rawSlug);
    if (!slug) {
      return NextResponse.json(
        { ok: false, error: "slug_invalid" },
        { status: 400 }
      );
    }

    if (!isValidOperationMode(operationMode)) {
      return NextResponse.json(
        { ok: false, error: "operation_mode_invalid" },
        { status: 400 }
      );
    }

    if (!isValidContractType(contractType)) {
      return NextResponse.json(
        { ok: false, error: "contract_type_invalid" },
        { status: 400 }
      );
    }

    if (!Number.isInteger(spotCount) || spotCount <= 0 || spotCount > 300) {
      return NextResponse.json(
        { ok: false, error: "spot_count_invalid" },
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

    if (!agentId && agentRateBps !== 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "invalid_agent_rate",
          message: "代理店なしの場合、agentRateBps は 0 にしてください。",
        },
        { status: 400 }
      );
    }

    if (
      (contractType === "HQ_BULK" || contractType === "OWNER_DIRECT") &&
      agentId
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: "invalid_agent_for_contract_type",
          message: "この契約タイプでは代理店は設定できません。",
        },
        { status: 400 }
      );
    }

    const startsAt = parseDateJst(startsAtRaw);
    const endsAt = parseDateJst(endsAtRaw);

    if (!startsAt) {
      return NextResponse.json(
        { ok: false, error: "startsAt_required" },
        { status: 400 }
      );
    }

    if (endsAtRaw && !endsAt) {
      return NextResponse.json(
        { ok: false, error: "endsAt_invalid" },
        { status: 400 }
      );
    }

    if (endsAt && endsAt < startsAt) {
      return NextResponse.json(
        { ok: false, error: "endsAt_before_startsAt" },
        { status: 400 }
      );
    }

    if (!isValidYearMonth(policyStartMonth)) {
      return NextResponse.json(
        { ok: false, error: "policyStartMonth_invalid" },
        { status: 400 }
      );
    }

    if (policyEndMonth && !isValidYearMonth(policyEndMonth)) {
      return NextResponse.json(
        { ok: false, error: "policyEndMonth_invalid" },
        { status: 400 }
      );
    }

    if (policyEndMonth && policyEndMonth < policyStartMonth) {
      return NextResponse.json(
        { ok: false, error: "policyEndMonth_before_policyStartMonth" },
        { status: 400 }
      );
    }

    if (!Number.isFinite(taxRateBps) || taxRateBps < 0) {
      return NextResponse.json(
        { ok: false, error: "taxRateBps_invalid" },
        { status: 400 }
      );
    }

    if (!Number.isFinite(monthlyMinFeeThreshold) || monthlyMinFeeThreshold < 0) {
      return NextResponse.json(
        { ok: false, error: "monthlyMinFeeThreshold_invalid" },
        { status: 400 }
      );
    }

    const existing = await prisma.place.findUnique({
      where: { slug },
      select: { id: true },
    });

    if (existing) {
      return NextResponse.json(
        { ok: false, error: "slug_already_exists" },
        { status: 409 }
      );
    }

    const owner = await prisma.owner.findUnique({
      where: { id: ownerId },
      select: { id: true, status: true },
    });

    if (!owner) {
      return NextResponse.json(
        { ok: false, error: "owner_not_found" },
        { status: 404 }
      );
    }

    if (owner.status !== "ACTIVE") {
      return NextResponse.json(
        { ok: false, error: "owner_not_active" },
        { status: 400 }
      );
    }

    if (agentId) {
      const agent = await prisma.agent.findUnique({
        where: { id: agentId },
        select: { id: true, status: true },
      });

      if (!agent) {
        return NextResponse.json(
          { ok: false, error: "agent_not_found" },
          { status: 404 }
        );
      }

      if (agent.status !== "ACTIVE") {
        return NextResponse.json(
          { ok: false, error: "agent_not_active" },
          { status: 400 }
        );
      }
    }

    const normalizedAgentId =
      contractType === "OWNER_AGENT_PLATFORM" ? agentId : null;
    const normalizedAgentRateBps =
      contractType === "OWNER_AGENT_PLATFORM" ? agentRateBps : 0;

    const now = new Date();

    const result = await prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const place = await tx.place.create({
          data: {
            name,
            slug,
            address,
            googleMapUrl,
            ownerId,
            operationMode: operationMode as
              | "RESERVATION_ONLY"
              | "HOURLY_ONLY"
              | "RESERVATION_THEN_HOURLY"
              | "EVENT_ONLY"
              | "CLOSED"
              | "MONTHLY",
            isActive,
            updatedAt: now,
          },
        });

        await tx.spot.createMany({
          data: Array.from({ length: spotCount }, (_, i) => {
            const code = makeSpotCode(i + 1);
            return {
              placeId: place.id,
              code,
              label: code,
              isActive: true,
              operationModeOverride: null,
            };
          }),
        });

        await tx.placeAssignment.create({
          data: {
            id: crypto.randomUUID(),
            placeId: place.id,
            ownerId,
            agentId: normalizedAgentId,
            contractType: contractType as
              | "HQ_BULK"
              | "OWNER_DIRECT"
              | "OWNER_AGENT_PLATFORM",
            ownerRateBps,
            agentRateBps: normalizedAgentRateBps,
            platformRateBps,
            startsAt,
            endsAt,
            isActive: true,
            note: "Place作成時に同時作成",
            createdAt: now,
            updatedAt: now,
          },
        });

        await tx.placeBillingPolicy.create({
          data: {
            id: crypto.randomUUID(),
            placeId: place.id,
            startMonth: policyStartMonth,
            endMonth: policyEndMonth || null,
            contractType: contractType as
              | "HQ_BULK"
              | "OWNER_DIRECT"
              | "OWNER_AGENT_PLATFORM",
            taxRateBps,
            monthlyMinFeeThreshold,
            ownerPayoutFeeBurden,
            agentPayoutFeeBurden,
            note: billingNote,
            isActive: true,
            createdAt: now,
            updatedAt: now,
          },
        });

        const spots = await tx.spot.findMany({
          where: { placeId: place.id },
          orderBy: { code: "asc" },
          select: {
            id: true,
            code: true,
            label: true,
            isActive: true,
            operationModeOverride: true,
          },
        });

        const currentAssignment = await tx.placeAssignment.findFirst({
          where: {
            placeId: place.id,
            isActive: true,
          },
          orderBy: {
            startsAt: "desc",
          },
          include: {
            Owner: {
              select: {
                id: true,
                name: true,
                displayName: true,
                status: true,
              },
            },
            Agent: {
              select: {
                id: true,
                code: true,
                name: true,
                displayName: true,
                status: true,
              },
            },
          },
        });

        const currentBillingPolicy = await tx.placeBillingPolicy.findFirst({
          where: {
            placeId: place.id,
            isActive: true,
          },
          orderBy: {
            startMonth: "desc",
          },
        });

        return { place, spots, currentAssignment, currentBillingPolicy };
      }
    );

    revalidatePath("/api/public/places");
    revalidatePath("/reserve");

    return NextResponse.json({
      ok: true,
      place: {
        ...result.place,
        spotCount: result.spots.length,
        spots: result.spots,
        currentAssignment: normalizeAssignmentForResponse(
          result.currentAssignment
        ),
        currentBillingPolicy: result.currentBillingPolicy,
      },
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);

    console.error("[places][POST] error:", e);

    return NextResponse.json(
      { ok: false, error: "server_error", message },
      { status: 500 }
    );
  }
}