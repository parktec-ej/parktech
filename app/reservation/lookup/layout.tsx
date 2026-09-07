import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "予約内容の確認・変更 | ParkTec East Japan",
  description:
    "ご利用日・PINコード・車両ナンバーでご予約を照会し、日付変更・キャンセル・登録内容の変更ができます。",
};

export default function ReservationLookupLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <>{children}</>;
}
