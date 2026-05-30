import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { OWNER_SESSION_COOKIE } from "@/lib/owner-session";

export async function getOwnerSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(OWNER_SESSION_COOKIE)?.value;

  if (!token) return null;

  const owner = await prisma.owner.findFirst({
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
      displayName: true,
      sessionExpiresAt: true,
    },
  });

  return owner;
}

export async function requireOwner() {
  const owner = await getOwnerSession();
  if (!owner) redirect("/owner/login");
  return owner;
}
