import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { ADMIN_SESSION_COOKIE } from "@/lib/admin-session";

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const headersList = await headers();
  const pathname = headersList.get("x-pathname") ?? "";

  if (pathname === "/admin/login") {
    return <>{children}</>;
  }

  const cookieStore = await cookies();
  const session = cookieStore.get(ADMIN_SESSION_COOKIE);

  if (!session) {
    redirect("/admin/login");
  }

  return <>{children}</>;
}
