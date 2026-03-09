import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { ADMIN_SESSION_COOKIE } from "@/lib/admin-session";

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;

  if (token) {
    await prisma.adminUser.updateMany({
      where: { sessionToken: token },
      data: {
        sessionToken: null,
        sessionExpiresAt: null,
      },
    });
  }

  const url = new URL("/admin/login", req.url);

  const res = NextResponse.redirect(url);

  res.cookies.set(ADMIN_SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(0),
  });

  return res;
}