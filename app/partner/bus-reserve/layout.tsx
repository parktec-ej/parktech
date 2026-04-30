import type { ReactNode } from "react";
import { requirePartner } from "@/lib/partner-auth";

export default async function BusReserveLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requirePartner();
  return <>{children}</>;
}
