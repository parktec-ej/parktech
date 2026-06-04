export const runtime = "nodejs";

import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const place = await prisma.place.findUnique({
    where: { slug },
    select: { name: true, isActive: true },
  });
  if (!place || !place.isActive) {
    return { title: "駐車場が見つかりません | ParkTec" };
  }
  return {
    title: `${place.name} の予約 | ParkTec`,
    description: `${place.name} の駐車場予約ページ。QRコードで入出庫、事前キャッシュレス決済。`,
  };
}

export default async function PlacePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ date?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;

  const place = await prisma.place.findUnique({
    where: { slug },
    select: { isActive: true },
  });

  if (!place || !place.isActive) {
    notFound();
  }

  const dateParam =
    typeof sp.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.date)
      ? sp.date
      : null;

  const target = dateParam
    ? `/reserve?placeSlug=${encodeURIComponent(slug)}&date=${dateParam}`
    : `/reserve?placeSlug=${encodeURIComponent(slug)}`;

  redirect(target);
}
