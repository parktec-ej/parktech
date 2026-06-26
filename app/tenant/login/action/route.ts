import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { createTenantSession } from "@/lib/tenant-auth";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const password = String(formData.get("password") ?? "");
    if (!email || !password) {
      return NextResponse.redirect(new URL("/tenant/login?error=1", req.url), { status: 303 });
    }
    const tenant = await prisma.tenant.findFirst({
      where: { email, status: "ACTIVE" },
      select: { id: true, passwordHash: true },
    });
    if (!tenant || !tenant.passwordHash) {
      return NextResponse.redirect(new URL("/tenant/login?error=1", req.url), { status: 303 });
    }
    const ok = await bcrypt.compare(password, tenant.passwordHash);
    if (!ok) {
      return NextResponse.redirect(new URL("/tenant/login?error=1", req.url), { status: 303 });
    }
    await createTenantSession(tenant.id);
    return NextResponse.redirect(new URL("/tenant/dashboard", req.url), { status: 303 });
  } catch (error) {
    console.error("[tenant/login] error:", error);
    return NextResponse.redirect(new URL("/tenant/login?error=1", req.url), { status: 303 });
  }
}
