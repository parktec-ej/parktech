import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { ADMIN_SESSION_COOKIE } from "@/lib/admin-session";

export async function getAdminSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;

  if (!token) return null;

  const admin = await prisma.adminUser.findFirst({
    where: {
      sessionToken: token,
      sessionExpiresAt: {
        gt: new Date(),
      },
    },
    select: {
      id: true,
      email: true,
      name: true,
      sessionExpiresAt: true,
    },
  });

  return admin;
}

export async function requireAdmin() {
  const admin = await getAdminSession();
  if (!admin) redirect("/admin/login");
  return admin;
}