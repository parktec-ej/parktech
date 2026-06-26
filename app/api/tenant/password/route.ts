export const runtime = "nodejs";

import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { getTenantSession } from "@/lib/tenant-auth";

export async function POST(req: Request) {
  const session = await getTenantSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  try {
    const body = await req.json().catch(() => null);
    const currentPassword = String(body?.currentPassword ?? "");
    const newPassword = String(body?.newPassword ?? "");
    if (!currentPassword || newPassword.length < 8) {
      return NextResponse.json({ ok: false, message: "入力が不正です。" }, { status: 400 });
    }
    const tenant = await prisma.tenant.findUnique({
      where: { id: session.tenantId },
      select: { passwordHash: true },
    });
    if (!tenant?.passwordHash) {
      return NextResponse.json({ ok: false, message: "パスワードが未設定です。" }, { status: 400 });
    }
    const ok = await bcrypt.compare(currentPassword, tenant.passwordHash);
    if (!ok) {
      return NextResponse.json({ ok: false, message: "現在のパスワードが正しくありません。" }, { status: 400 });
    }
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.tenant.update({
      where: { id: session.tenantId },
      data: { passwordHash },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[tenant/password] error:", e);
    return NextResponse.json({ ok: false, message: "変更に失敗しました。" }, { status: 500 });
  }
}
