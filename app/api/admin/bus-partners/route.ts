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

export async function GET() {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const partners = await prisma.busPartner.findMany({
    orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
    select: {
      id: true,
      name: true,
      contact: true,
      phone: true,
      email: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ ok: true, partners });
}

export async function POST(req: Request) {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => null);
    if (!body) return jsonError("JSONが不正です", 400, "invalid_json");

    const name = cleanText(body.name, 120);
    const contact = cleanText(body.contact, 120);
    const phone = cleanText(body.phone, 60);
    const email = cleanText(body.email, 160);

    if (!name) return jsonError("会社名は必須です", 400, "name_required");
    if (!contact) return jsonError("担当者名は必須です", 400, "contact_required");
    if (!phone) return jsonError("電話番号は必須です", 400, "phone_required");
    if (!email || !isEmailLike(email)) {
      return jsonError("メールアドレスが不正です", 400, "email_invalid");
    }

    const partner = await prisma.busPartner.create({
      data: { name, contact, phone, email },
      select: {
        id: true,
        name: true,
        contact: true,
        phone: true,
        email: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ ok: true, partner });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return jsonError(message, 500, "server_error");
  }
}
