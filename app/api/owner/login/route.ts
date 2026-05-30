export const runtime = "nodejs";
export const preferredRegion = "hnd1";

import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { prisma } from "@/lib/db";
import {
  OWNER_SESSION_COOKIE,
  OWNER_SESSION_MAX_AGE,
} from "@/lib/owner-session";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);

    if (!body) {
      return NextResponse.json(
        { ok: false, error: "invalid_json" },
        { status: 400 }
      );
    }

    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");

    if (!email || !password) {
      return NextResponse.json(
        { ok: false, error: "email_password_required" },
        { status: 400 }
      );
    }

    const owner = await prisma.owner.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        displayName: true,
        passwordHash: true,
        status: true,
      },
    });

    if (!owner || owner.status !== "ACTIVE") {
      return NextResponse.json(
        { ok: false, error: "invalid_credentials" },
        { status: 401 }
      );
    }

    const ok = await bcrypt.compare(password, owner.passwordHash);

    if (!ok) {
      return NextResponse.json(
        { ok: false, error: "invalid_credentials" },
        { status: 401 }
      );
    }

    const sessionToken = crypto.randomUUID();
    const sessionExpiresAt = new Date(
      Date.now() + OWNER_SESSION_MAX_AGE * 1000
    );

    await prisma.owner.update({
      where: { id: owner.id },
      data: {
        sessionToken,
        sessionExpiresAt,
      },
    });

    const res = NextResponse.json({
      ok: true,
      owner: {
        id: owner.id,
        email: owner.email,
        name: owner.displayName || owner.name,
      },
    });

    res.cookies.set(OWNER_SESSION_COOKIE, sessionToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: OWNER_SESSION_MAX_AGE,
    });

    return res;
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "server_error", message: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}
