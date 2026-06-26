import type { ReactNode } from "react";
import { requireTenant } from "@/lib/tenant-auth";

export default async function TenantProtectedLayout({ children }: { children: ReactNode }) {
  await requireTenant();
  return <>{children}</>;
}
