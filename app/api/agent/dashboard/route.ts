import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAgentSession } from "@/lib/agent-auth";

type AgentAssignmentRow = {
  id: string;
  placeId: string;
  startsAt: Date | null;
  endsAt: Date | null;
  agentRateBps: number;
  ownerRateBps: number;
  platformRateBps: number;
  place: {
    id: string;
    slug: string | null;
    name: string;
    address: string | null;
  };
  owner: {
    id: string;
    name: string;
    displayName: string | null;
  } | null;
};

type PaymentRow = {
  id: string;
  placeId: string;
  placeNameSnapshot: string;
  recognizedDate: Date;
  grossAmount: number | null;
  ownerAmount: number | null;
  agentAmount: number | null;
  platformAmount: number | null;
  status: string;
  settledAt: Date | null;
  createdAt: Date;
};

type PlaceSummaryRow = {
  placeId: string;
  placeName: string;
  placeSlug: string | null;
  address: string | null;
  ownerId: string | null;
  ownerName: string | null;
  ownerDisplayName: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  gross: number;
  agentAmount: number;
  settledAgentAmount: number;
  paymentCount: number;
};

type DailySummaryRow = {
  date: string;
  gross: number;
  agentAmount: number;
  paymentCount: number;
};

function ymNowJst() {
  const now = new Date();
  const y = now.toLocaleDateString("sv-SE", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
  });
  const m = now.toLocaleDateString("sv-SE", {
    timeZone: "Asia/Tokyo",
    month: "2-digit",
  });
  return `${y}-${m}`;
}

function normalizeMonth(value?: string | null) {
  if (value && /^\d{4}-\d{2}$/.test(value)) return value;
  return ymNowJst();
}

function ymdJst(value: Date) {
  return value.toLocaleDateString("sv-SE", {
    timeZone: "Asia/Tokyo",
  });
}

export async function GET(req: Request) {
  const session = await getAgentSession();

  if (!session) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 }
    );
  }

  try {
    const url = new URL(req.url);
    const month = normalizeMonth(url.searchParams.get("month"));
    const agentId = session.agentId;

    const agent = await prisma.agent.findUnique({
      where: { id: agentId },
      select: {
        id: true,
        code: true,
        name: true,
        displayName: true,
        email: true,
        assignments: {
          where: {
            isActive: true,
          },
          select: {
            id: true,
            placeId: true,
            startsAt: true,
            endsAt: true,
            agentRateBps: true,
            ownerRateBps: true,
            platformRateBps: true,
            place: {
              select: {
                id: true,
                slug: true,
                name: true,
                address: true,
              },
            },
            owner: {
              select: {
                id: true,
                name: true,
                displayName: true,
              },
            },
          },
          orderBy: [{ startsAt: "asc" }],
        },
      },
    });

    if (!agent) {
      return NextResponse.json(
        { ok: false, error: "agent_not_found" },
        { status: 404 }
      );
    }

    const assignments = agent.assignments as AgentAssignmentRow[];

    const assignedPlaceIds = assignments.map(
      (a: AgentAssignmentRow) => a.placeId
    );

    if (assignedPlaceIds.length === 0) {
      return NextResponse.json({
        ok: true,
        month,
        agent: {
          id: agent.id,
          code: agent.code,
          name: agent.name,
          displayName: agent.displayName,
          email: agent.email,
        },
        totals: {
          gross: 0,
          agentAmount: 0,
          settledAgentAmount: 0,
          placeCount: 0,
          paymentCount: 0,
        },
        places: [],
        daily: [],
      });
    }

    const paymentsRaw = await prisma.payment.findMany({
      where: {
        placeId: {
          in: assignedPlaceIds,
        },
        recognizedMonth: month,
      },
      select: {
        id: true,
        placeId: true,
        placeNameSnapshot: true,
        recognizedDate: true,
        grossAmount: true,
        ownerAmount: true,
        agentAmount: true,
        platformAmount: true,
        status: true,
        settledAt: true,
        createdAt: true,
      },
      orderBy: [{ recognizedDate: "asc" }, { createdAt: "asc" }],
    });

    const payments = paymentsRaw as PaymentRow[];

    const totalGross = payments.reduce(
      (sum: number, p: PaymentRow) => sum + (p.grossAmount ?? 0),
      0
    );

    const totalAgent = payments.reduce(
      (sum: number, p: PaymentRow) => sum + (p.agentAmount ?? 0),
      0
    );

    const settledAgent = payments
      .filter((p: PaymentRow) => p.status === "SETTLED")
      .reduce((sum: number, p: PaymentRow) => sum + (p.agentAmount ?? 0), 0);

    const placeMap = new Map<string, PlaceSummaryRow>();

    for (const a of assignments) {
      placeMap.set(a.placeId, {
        placeId: a.place.id,
        placeName: a.place.name,
        placeSlug: a.place.slug,
        address: a.place.address,
        ownerId: a.owner?.id ?? null,
        ownerName: a.owner?.name ?? null,
        ownerDisplayName: a.owner?.displayName ?? null,
        startsAt: a.startsAt,
        endsAt: a.endsAt,
        gross: 0,
        agentAmount: 0,
        settledAgentAmount: 0,
        paymentCount: 0,
      });
    }

    for (const p of payments) {
      const current = placeMap.get(p.placeId);
      if (!current) continue;

      current.gross += p.grossAmount ?? 0;
      current.agentAmount += p.agentAmount ?? 0;
      current.paymentCount += 1;

      if (p.status === "SETTLED") {
        current.settledAgentAmount += p.agentAmount ?? 0;
      }
    }

    const places = Array.from(placeMap.values()).sort(
      (a: PlaceSummaryRow, b: PlaceSummaryRow) =>
        a.placeName.localeCompare(b.placeName, "ja")
    );

    const dailyMap = new Map<string, DailySummaryRow>();

    for (const p of payments) {
      const date = ymdJst(p.recognizedDate);
      const current = dailyMap.get(date) ?? {
        date,
        gross: 0,
        agentAmount: 0,
        paymentCount: 0,
      };

      current.gross += p.grossAmount ?? 0;
      current.agentAmount += p.agentAmount ?? 0;
      current.paymentCount += 1;

      dailyMap.set(date, current);
    }

    const daily = Array.from(dailyMap.values()).sort(
      (a: DailySummaryRow, b: DailySummaryRow) =>
        a.date.localeCompare(b.date, "ja")
    );

    return NextResponse.json({
      ok: true,
      month,
      agent: {
        id: agent.id,
        code: agent.code,
        name: agent.name,
        displayName: agent.displayName,
        email: agent.email,
      },
      totals: {
        gross: totalGross,
        agentAmount: totalAgent,
        settledAgentAmount: settledAgent,
        placeCount: assignments.length,
        paymentCount: payments.length,
      },
      places,
      daily,
      meta: {
        mode: "by-assigned-place",
        note: "Payment.agentId 未保存のため、担当Placeベースで集計中",
      },
    });
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