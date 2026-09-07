import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "ご予約の照会 | ParkTec East Japan",
  description:
    "ご利用日・PINコード・車両ナンバーでご予約を照会し、確認・変更画面へお進みいただけます。",
};

export default function ReservationVerifyLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <>{children}</>;
}
