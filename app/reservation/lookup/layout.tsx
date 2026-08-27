import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "予約内容の確認・変更 | ParkTec East Japan",
  description:
    "ご予約の確認・日付変更・キャンセルはこちらから。ご登録のメールアドレスに確認リンクをお送りします。",
};

export default function ReservationLookupLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <>{children}</>;
}
