import { prisma } from "@/lib/db";

export async function buildSettlementSnapshot(params: {
  placeId: string;
  spotId?: string | null;
  baseDate?: Date;
}) {
  const { placeId, spotId } = params;
  const baseDate = params.baseDate ?? new Date();

  const place = await prisma.place.findUnique({
    where: { id: placeId },
    select: {
      id: true,
      name: true,
    },
  });

  if (!place) {
    throw new Error(`Place not found: ${placeId}`);
  }

  const spot = spotId
    ? await prisma.spot.findUnique({
        where: { id: spotId },
        select: {
          id: true,
          code: true,
          label: true,
        },
      })
    : null;

  const assignment = await prisma.placeAssignment.findFirst({
    where: {
      placeId,
      isActive: true,
      startsAt: {
        lte: baseDate,
      },
      OR: [{ endsAt: null }, { endsAt: { gte: baseDate } }],
    },
    include: {
      Owner: {
        select: {
          id: true,
          name: true,
        },
      },
      Agent: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: {
      startsAt: "desc",
    },
  });

  if (!assignment) {
    throw new Error(
      `PlaceAssignment not found for placeId=${placeId} at ${baseDate.toISOString()}`
    );
  }

  const totalRate =
    assignment.ownerRateBps +
    assignment.agentRateBps +
    assignment.platformRateBps;

  if (totalRate !== 10000) {
    throw new Error(`Invalid rate total: ${totalRate} (must be 10000)`);
  }

  return {
    placeId: place.id,
    placeNameSnapshot: place.name,

    ownerId: assignment.Owner.id,
    ownerNameSnapshot: assignment.Owner.name,

    agentId: assignment.Agent?.id ?? null,
    agentNameSnapshot: assignment.Agent?.name ?? null,

    spotId: spot?.id ?? spotId ?? null,
    spotCodeSnapshot: spot?.code ?? null,
    spotLabelSnapshot: spot?.label ?? null,

    ownerRateBps: assignment.ownerRateBps,
    agentRateBps: assignment.agentRateBps,
    platformRateBps: assignment.platformRateBps,
  };
}
