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
    const byId = await prisma.place.findFirst({
      where: { id: placeId, isActive: true },
      select,
    });
    if (byId) return byId;

    // placeId にスラッグが渡ってくるケース（gate → hourly-start / hourly-checkout 等）に対応
    const byIdAsSlug = await prisma.place.findFirst({
      where: { slug: placeId, isActive: true },
      select,
    });
    if (byIdAsSlug) return byIdAsSlug;
  }

  if (placeSlug) {
    const place = await prisma.place.findFirst({
      where: { slug: placeSlug, isActive: true },
      select,
    });
    if (place) return place;
  }

  // 識別子（placeId/placeSlug）が指定されたのに解決できなかった場合は、
  // 誤った place への書き込みを防ぐため null を返す（呼び出し側は place_not_found）。
  if (placeId || placeSlug) {
    return null;
  }

  // 識別子が一切指定されていない場合のみ、従来どおり最古の有効 place を返す。
  return prisma.place.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: "asc" },
    select,
  });
}