import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";
import { notFound } from "next/navigation";
import AssignmentEditForm from "./AssignmentEditForm";

function ymd(date: Date | null | undefined) {
  if (!date) return "";
  return new Date(date).toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}

export default async function AssignmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;

  const [assignment, places, owners, agents] = await Promise.all([
    prisma.placeAssignment.findUnique({
      where: { id },
      include: {
        Place: { select: { id: true, name: true, slug: true } },
        Owner: { select: { id: true, name: true } },
        Agent: { select: { id: true, name: true } },
      },
    }),
    prisma.place.findMany({
      where: { isActive: true },
      select: { id: true, name: true, slug: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.owner.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, name: true },
      orderBy: { registeredAt: "asc" },
    }),
    prisma.agent.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, name: true, defaultAgentRateBps: true },
      orderBy: { registeredAt: "asc" },
    }),
  ]);

  if (!assignment) return notFound();

  return (
    <AssignmentEditForm
      assignment={{
        id: assignment.id,
        placeId: assignment.placeId,
        ownerId: assignment.ownerId,
        agentId: assignment.agentId ?? "",
        ownerRateBps: assignment.ownerRateBps,
        agentRateBps: assignment.agentRateBps,
        platformRateBps: assignment.platformRateBps,
        startsAt: ymd(assignment.startsAt),
        endsAt: ymd(assignment.endsAt),
        isActive: assignment.isActive,
        note: assignment.note ?? "",
      }}
      places={places}
      owners={owners}
      agents={agents}
    />
  );
}