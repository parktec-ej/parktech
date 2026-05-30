export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { OWNER_SESSION_COOKIE } from "@/lib/owner-session";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(OWNER_SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return res;
}
