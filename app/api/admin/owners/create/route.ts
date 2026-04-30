export const runtime = "nodejs";
export const preferredRegion = "hnd1";

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

function asNullableDate(v: FormDataEntryValue | null) {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const d = new Date(`${s}T00:00:00+09:00`);
  return isNaN(d.getTime()) ? null : d;
}

export async function POST(req: Request) {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const fd = await req.formData();

    const name = String(fd.get("name") ?? "").trim();
    const displayName = asNullableString(fd.get("displayName"));
    const email = String(fd.get("email") ?? "").trim().toLowerCase();
    const password = String(fd.get("password") ?? "").trim();
    const phone = asNullableString(fd.get("phone"));

    const status = String(fd.get("status") ?? "ACTIVE").trim() as
      | "ACTIVE"
      | "INACTIVE"
      | "SUSPENDED";

    const businessTypeRaw = String(fd.get("businessType") ?? "").trim();
    const businessType =
      businessTypeRaw === "INDIVIDUAL" || businessTypeRaw === "CORPORATION"
        ? businessTypeRaw
        : null;

    const postalCode = asNullableString(fd.get("postalCode"));
    const address1 = asNullableString(fd.get("address1"));
    const address2 = asNullableString(fd.get("address2"));
    const invoiceNo = asNullableString(fd.get("invoiceNo"));

    const contractStartDate = asNullableDate(fd.get("contractStartDate"));
    const contractEndDate = asNullableDate(fd.get("contractEndDate"));

    const bankAccountName = asNullableString(fd.get("bankAccountName"));
    const bankName = asNullableString(fd.get("bankName"));
    const bankBranchName = asNullableString(fd.get("bankBranchName"));
    const bankAccountType = asNullableString(fd.get("bankAccountType"));
    const bankAccountNo = asNullableString(fd.get("bankAccountNo"));

    const notes = asNullableString(fd.get("notes"));

    if (!name || !email || !password) {
      return NextResponse.json(
        { ok: false, error: "missing_required_fields" },
        { status: 400 }
      );
    }

    if (password.length < 4) {
      return NextResponse.json(
        { ok: false, error: "password_too_short" },
        { status: 400 }
      );
    }

    const existing = await prisma.owner.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existing) {
      return NextResponse.json(
        { ok: false, error: "email_already_exists" },
        { status: 400 }
      );
    }

    await prisma.owner.create({
      data: {
        name,
        displayName,
        email,
        passwordHash: hashPassword(password),
        phone,
        status,
        businessType,
        postalCode,
        address1,
        address2,
        invoiceNo,
        contractStartDate,
        contractEndDate,
        bankAccountName,
        bankName,
        bankBranchName,
        bankAccountType,
        bankAccountNo,
        notes,
      },
    });

    return NextResponse.redirect(new URL("/admin/owners?created=1", req.url), {
      status: 303,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "server_error", message: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}