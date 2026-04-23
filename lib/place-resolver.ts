import { prisma } from "@/lib/db";

export type BasicPlace = {
  id: string;
  slug: string;
  name: string;
  address: string | null;
  operationMode?: string;
};

export async function resolveActivePlace(input?: {
  placeId?: string | null;
  placeSlug?: string | null;
}) {
  const placeId = String(input?.placeId ?? "").trim();
  const placeSlug = String(input?.placeSlug ?? "").trim();

  const select = {
    id: true,
    slug: true,
    name: true,
    address: true,
    operationMode: true,
  } as const;

  if (placeId) {
    const place = await prisma.place.findFirst({
      where: { id: placeId, isActive: true },
      select,
    });
    if (place) return place;
  }

  if (placeSlug) {
    const place = await prisma.place.findFirst({
      where: { slug: placeSlug, isActive: true },
      select,
    });
    if (place) return place;
  }

  return prisma.place.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: "asc" },
    select,
  });
}