import { prisma } from "@/lib/db";

export async function getTodayPrice(): Promise<{
  price: number;
  label: string;
}> {
  const today = new Date();

  const row = await prisma.pricingCalendar.findFirst({
    where: {
      targetDate: today,
    },
    select: {
      priceYen: true,
      label: true,
    },
  });

  if (row) {
    return {
      price: row.priceYen,
      label: row.label,
    };
  }

  return {
    price: Number(process.env.DAILY_PRICE_YEN || "800"),
    label: "NORMAL",
  };
}