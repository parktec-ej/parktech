export const runtime = "nodejs";
export const preferredRegion = "hnd1";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminSession } from "@/lib/admin-auth";

function jsonError(message: string, status = 400, error?: string) {
  return NextResponse.json(
    { ok: false, error: error ?? "bad_request", message },
    { status }
  );
}

function isEmailLike(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function cleanText(value: unknown, max = 200) {
  return String(value ?? "").trim().slice(0, max);
}

const partnerSelect = {
  id: true,
  name: true,
  companyPhone: true,
  address: true,
  contact: true,
  phone: true,
  email: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!id) return jsonError("id が必要です", 400, "id_required");

  const existing = await prisma.busPartner.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) return jsonError("業者が見つかりません", 404, "not_found");

  try {
    const body = await req.json().catch(() => null);
    if (!body) return jsonError("JSONが不正です", 400, "invalid_json");

    const data: {
      name?: string;
      contact?: string;
      phone?: string;
      email?: string;
      isActive?: boolean;
      companyPhone?: string | null;
      address?: string | null;
    } = {};

    if (body.name !== undefined) {
      const v = cleanText(body.name, 120);
      if (!v) return jsonError("会社名は必須です", 400, "name_required");
      data.name = v;
    }
    if (body.contact !== undefined) {
      const v = cleanText(body.contact, 120);
      if (!v) return jsonError("担当者名は必須です", 400, "contact_required");
      data.contact = v;
    }
    if (body.phone !== undefined) {
      const v = cleanText(body.phone, 60);
      if (!v) return jsonError("担当者電話番号は必須です", 400, "phone_required");
      data.phone = v;
    }
    if (body.email !== undefined) {
      const v = cleanText(body.email, 160);
      if (!isEmailLike(v)) {
        return jsonError("メールアドレスが不正です", 400, "email_invalid");
      }
      data.email = v;
    }
    if (body.companyPhone !== undefined) {
      const v = cleanText(body.companyPhone, 60);
      data.companyPhone = v || null;
    }
    if (body.address !== undefined) {
      const v = cleanText(body.address, 200);
      data.address = v || null;
    }
    if (body.isActive !== undefined) {
      data.isActive = Boolean(body.isActive);
    }

    if (Object.keys(data).length === 0) {
      return jsonError("更新項目がありません", 400, "no_fields");
    }

    const partner = await prisma.busPartner.update({
      where: { id },
      data,
      select: partnerSelect,
    });

    return NextResponse.json({ ok: true, partner });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return jsonError(message, 500, "server_error");
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!id) return jsonError("id が必要です", 400, "id_required");

  const existing = await prisma.busPartner.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) return jsonError("業者が見つかりません", 404, "not_found");

  try {
    await prisma.busPartner.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return jsonError(message, 500, "server_error");
  }
}
