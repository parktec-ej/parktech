import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getAdminSession } from "@/lib/admin-auth";

function toSlug(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-_]/g, "");
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
  ].includes(value);
}

function isValidContractType(value: string) {
  return ["HQ_BULK", "OWNER_DIRECT", "OWNER_AGENT_PLATFORM"].includes(value);
}

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await context.params;

    const place = await prisma.place.findUnique({
      where: { id },
      include: {
        assignments: {
          where: { isActive: true },
          orderBy: { startsAt: "desc" },
          take: 1,
          include: {
            owner: {
              select: {
                id: true,
                name: true,
                displayName: true,
                status: true,
              },
            },
            agent: {
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
        billingPolicies: {
          where: { isActive: true },
          orderBy: { startMonth: "desc" },
          take: 1,
        },
      },
    });

    if (!place) {
      return NextResponse.json(
        { ok: false, error: "not_found", message: "Place が見つかりません" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      place: {
        ...place,
        currentAssignment: place.assignments[0] ?? null,
        currentBillingPolicy: place.billingPolicies[0] ?? null,
      },
    });
  } catch (e: any) {
    console.error("[places/:id][GET] error:", e);
    return NextResponse.json(
      { ok: false, error: "server_error", message: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const body = await req.json().catch(() => null);

    if (!body) {
      return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
    }

    const name = String(body.name ?? "").trim();
    const rawSlug = String(body.slug ?? "").trim();
    const address = body.address ? String(body.address).trim() : null;
    const googleMapUrl = body.googleMapUrl ? String(body.googleMapUrl).trim() : null;
    const operationMode = String(body.operationMode ?? "RESERVATION_THEN_HOURLY").trim();

    const assignmentId = body.assignmentId ? String(body.assignmentId).trim() : "";
    const ownerId = body.ownerId ? String(body.ownerId).trim() : "";

    const agentIdRaw = body.agentId ? String(body.agentId).trim() : "";
    const agentId = agentIdRaw || null;

    const contractType = String(body.contractType ?? "OWNER_AGENT_PLATFORM").trim();

    const ownerRateBps = Number(body.ownerRateBps ?? NaN);
    const agentRateBps = Number(body.agentRateBps ?? NaN);
    const platformRateBps = Number(body.platformRateBps ?? NaN);

    const startsAtRaw = String(body.startsAt ?? "").trim();
    const endsAtRaw = body.endsAt ? String(body.endsAt).trim() : "";

    if (!name) {
      return NextResponse.json({ ok: false, error: "name_required" }, { status: 400 });
    }

    if (!rawSlug) {
      return NextResponse.json({ ok: false, error: "slug_required" }, { status: 400 });
    }

    const slug = toSlug(rawSlug);
    if (!slug) {
      return NextResponse.json({ ok: false, error: "slug_invalid" }, { status: 400 });
    }

    if (!isValidOperationMode(operationMode)) {
      return NextResponse.json(
        { ok: false, error: "operation_mode_invalid" },
        { status: 400 }
      );
    }

    if (!ownerId) {
      return NextResponse.json(
        { ok: false, error: "owner_required", message: "オーナーを選択してください。" },
        { status: 400 }
      );
    }

    if (!isValidContractType(contractType)) {
      return NextResponse.json(
        {
          ok: false,
          error: "contract_type_invalid",
          message: "契約種別が不正です。",
        },
        { status: 400 }
      );
    }

    if (
      !Number.isFinite(ownerRateBps) ||
      !Number.isFinite(agentRateBps) ||
      !Number.isFinite(platformRateBps)
    ) {
      return NextResponse.json(
        { ok: false, error: "invalid_rate", message: "配分率が不正です。" },
        { status: 400 }
      );
    }

    if (ownerRateBps + agentRateBps + platformRateBps !== 10000) {
      return NextResponse.json(
        {
          ok: false,
          error: "invalid_rate_total",
          message: "配分率の合計は10000bpsにしてください。",
        },
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

    if ((contractType === "HQ_BULK" || contractType === "OWNER_DIRECT") && agentId) {
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
        {
          ok: false,
          error: "startsAt_required",
          message: "適用開始日を入力してください。",
        },
        { status: 400 }
      );
    }

    if (endsAtRaw && !endsAt) {
      return NextResponse.json(
        {
          ok: false,
          error: "endsAt_invalid",
          message: "終了日が不正です。",
        },
        { status: 400 }
      );
    }

    if (endsAt && endsAt < startsAt) {
      return NextResponse.json(
        {
          ok: false,
          error: "endsAt_before_startsAt",
          message: "終了日は開始日以降にしてください。",
        },
        { status: 400 }
      );
    }

    const current = await prisma.place.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!current) {
      return NextResponse.json(
        { ok: false, error: "not_found", message: "Place が見つかりません" },
        { status: 404 }
      );
    }

    const duplicate = await prisma.place.findFirst({
      where: {
        slug,
        NOT: { id },
      },
      select: { id: true },
    });

    if (duplicate) {
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
        { ok: false, error: "owner_not_found", message: "オーナーが見つかりません。" },
        { status: 404 }
      );
    }

    if (owner.status !== "ACTIVE") {
      return NextResponse.json(
        { ok: false, error: "owner_not_active", message: "有効なオーナーを選択してください。" },
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
          { ok: false, error: "agent_not_found", message: "代理店が見つかりません。" },
          { status: 404 }
        );
      }

      if (agent.status !== "ACTIVE") {
        return NextResponse.json(
          { ok: false, error: "agent_not_active", message: "有効な代理店を選択してください。" },
          { status: 400 }
        );
      }
    }

    const normalizedAgentId =
      contractType === "OWNER_AGENT_PLATFORM" ? agentId : null;
    const normalizedAgentRateBps =
      contractType === "OWNER_AGENT_PLATFORM" ? agentRateBps : 0;

    const result = await prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const place = await tx.place.update({
          where: { id },
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
              | "CLOSED",
          },
        });

        if (assignmentId) {
          await tx.placeAssignment.update({
            where: { id: assignmentId },
            data: {
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
            },
          });
        } else {
          await tx.placeAssignment.create({
            data: {
              placeId: id,
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
              note: "Place編集時に作成",
            },
          });
        }

        const currentAssignment = await tx.placeAssignment.findFirst({
          where: {
            placeId: id,
            isActive: true,
          },
          orderBy: {
            startsAt: "desc",
          },
          include: {
            owner: {
              select: {
                id: true,
                name: true,
                displayName: true,
                status: true,
              },
            },
            agent: {
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
            placeId: id,
            isActive: true,
          },
          orderBy: {
            startMonth: "desc",
          },
        });

        return { place, currentAssignment, currentBillingPolicy };
      }
    );

    return NextResponse.json({
      ok: true,
      place: result.place,
      currentAssignment: result.currentAssignment,
      currentBillingPolicy: result.currentBillingPolicy,
    });
  } catch (e: any) {
    console.error("[places/:id][PATCH] error:", e);
    return NextResponse.json(
      { ok: false, error: "server_error", message: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}