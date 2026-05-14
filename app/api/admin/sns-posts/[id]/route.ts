export const runtime = "nodejs";
export const preferredRegion = "hnd1";

import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getAdminSession } from "@/lib/admin-auth";

function jsonError(error: string, status = 400, message?: string) {
  return NextResponse.json(
    { ok: false, error, ...(message ? { message } : {}) },
    { status }
  );
}

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminSession();
  if (!admin) return jsonError("unauthorized", 401);
  const { id } = await context.params;
  const post = await prisma.snsPost.findUnique({ where: { id } });
  if (!post) return jsonError("not_found", 404);
  return NextResponse.json({ ok: true, post });
}

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminSession();
  if (!admin) return jsonError("unauthorized", 401);
  const { id } = await context.params;
  const body = await req.json().catch(() => null);
  if (!body) return jsonError("invalid_json");

  const data: Prisma.SnsPostUpdateInput = {};
  if (typeof body.postText === "string") data.postText = body.postText;
  if (typeof body.phaseLabel === "string") data.phaseLabel = body.phaseLabel;
  if ("scheduledAt" in body) {
    data.scheduledAt = body.scheduledAt
      ? new Date(String(body.scheduledAt))
      : null;
  }
  if (typeof body.status === "string") data.status = body.status;

  try {
    const updated = await prisma.snsPost.update({ where: { id }, data });
    return NextResponse.json({ ok: true, post: updated });
  } catch (e) {
    return jsonError(
      "server_error",
      500,
      e instanceof Error ? e.message : String(e)
    );
  }
}

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminSession();
  if (!admin) return jsonError("unauthorized", 401);
  const { id } = await context.params;
  try {
    await prisma.snsPost.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(
      "server_error",
      500,
      e instanceof Error ? e.message : String(e)
    );
  }
}
