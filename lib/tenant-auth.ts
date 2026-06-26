import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import crypto from "node:crypto";
import { prisma } from "@/lib/db";
import { TENANT_SESSION_COOKIE } from "@/lib/tenant-session";

function buildExpiryDate(days = 14) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

export async function createTenantSession(tenantId: string) {
  const sessionToken = crypto.randomUUID();
  const sessionExpiresAt = buildExpiryDate(14);
  await prisma.tenant.update({
    where: { id: tenantId },
    data: { sessionToken, sessionExpiresAt },
  });
  const cookieStore = await cookies();
  cookieStore.set(TENANT_SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: sessionExpiresAt,
    path: "/",
  });
  return { sessionToken, sessionExpiresAt };
}

export async function clearTenantSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(TENANT_SESSION_COOKIE)?.value;
  if (token) {
    await prisma.tenant.updateMany({
      where: { sessionToken: token },
      data: { sessionToken: null, sessionExpiresAt: null },
    });
  }
  cookieStore.set(TENANT_SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: new Date(0),
    path: "/",
  });
}

export async function getTenantSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(TENANT_SESSION_COOKIE)?.value;
  if (!token) return null;
  const tenant = await prisma.tenant.findFirst({
    where: {
      sessionToken: token,
      sessionExpiresAt: { gt: new Date() },
      status: "ACTIVE",
    },
    select: { id: true, email: true, name: true },
  });
  if (!tenant) return null;
  return { tenantId: tenant.id, email: tenant.email, name: tenant.name };
}

export async function requireTenant() {
  const session = await getTenantSession();
  if (!session) redirect("/tenant/login");
  return session;
}
