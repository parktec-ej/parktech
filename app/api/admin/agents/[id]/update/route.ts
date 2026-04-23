import { NextResponse } from "next/server";
import { scryptSync } from "crypto";
import { prisma } from "@/lib/db";
import { getAdminSession } from "@/lib/admin-auth";

function hashPassword(password: string) {
  const salt = process.env.PASSWORD_SALT || "parktech-local-salt";
  return scryptSync(password, salt, 64).toString("hex");
}

function asNullableString(v: FormDataEntryValue | null) {
  const s = String(v ?? "").trim();
  return s || null;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const fd = await req.formData();

    const name = String(fd.get("name") ?? "").trim();
    const displayName = asNullableString(fd.get("displayName"));
    const emailRaw = asNullableString(fd.get("email"));
    const email = emailRaw ? emailRaw.toLowerCase() : null;
    const password = String(fd.get("password") ?? "").trim();
    const phone = asNullableString(fd.get("phone"));

    const status = String(fd.get("status") ?? "ACTIVE").trim() as
      | "ACTIVE"
      | "INACTIVE"
      | "SUSPENDED";

    const defaultAgentRateBps = Number(
      String(fd.get("defaultAgentRateBps") ?? "").trim()
    );

    const postalCode = asNullableString(fd.get("postalCode"));
    const address1 = asNullableString(fd.get("address1"));
    const address2 = asNullableString(fd.get("address2"));
    const invoiceNo = asNullableString(fd.get("invoiceNo"));

    const bankAccountName = asNullableString(fd.get("bankAccountName"));
    const bankName = asNullableString(fd.get("bankName"));
    const bankBranchName = asNullableString(fd.get("bankBranchName"));
    const bankAccountType = asNullableString(fd.get("bankAccountType"));
    const bankAccountNo = asNullableString(fd.get("bankAccountNo"));

    const notes = asNullableString(fd.get("notes"));

    if (!name) {
      return NextResponse.json(
        { ok: false, error: "missing_name" },
        { status: 400 }
      );
    }

    if (!Number.isFinite(defaultAgentRateBps) || defaultAgentRateBps < 0 || defaultAgentRateBps > 10000) {
      return NextResponse.json(
        { ok: false, error: "invalid_defaultAgentRateBps" },
        { status: 400 }
      );
    }

    if (email) {
      const existing = await prisma.agent.findFirst({
        where: {
          email,
          id: { not: id },
        },
        select: { id: true },
      });

      if (existing) {
        return NextResponse.json(
          { ok: false, error: "email_already_exists" },
          { status: 400 }
        );
      }
    }

    await prisma.agent.update({
      where: { id },
      data: {
        name,
        displayName,
        email,
        ...(password ? { passwordHash: hashPassword(password) } : {}),
        phone,
        status,
        defaultAgentRateBps,
        postalCode,
        address1,
        address2,
        invoiceNo,
        bankAccountName,
        bankName,
        bankBranchName,
        bankAccountType,
        bankAccountNo,
        notes,
      },
    });

    return NextResponse.redirect(new URL("/admin/agents?updated=1", req.url), {
      status: 303,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "server_error", message: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}