import { getReservationFixedPrice } from "@/lib/pricing-core";

const DEFAULT_PLACE_ID = "e24a57f5-787f-4c2e-9394-e5f54053a955";

function ymdTodayJst() {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}

export async function getTodayPrice(): Promise<{
  price: number;
  label: string;
}> {
  const ymd = ymdTodayJst();
  const price = await getReservationFixedPrice(DEFAULT_PLACE_ID, ymd);

  return {
    price,
    label: "DB_RULE",
  };
}