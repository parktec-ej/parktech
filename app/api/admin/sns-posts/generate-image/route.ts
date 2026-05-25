export const runtime = "nodejs";
export const preferredRegion = "hnd1";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminSession } from "@/lib/admin-auth";

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL || "https://reserve.parktec-ej.com";

function jsonError(error: string, status = 400, message?: string) {
  return NextResponse.json(
    { ok: false, error, ...(message ? { message } : {}) },
    { status }
  );
}

/**
 * GET / POST いずれでも eventId を受け取り、OG 画像エンドポイントの
 * 公開URLを返す。実際の画像生成は /api/og/event/[id] が担当（動的）。
 */
async function handle(eventId: string) {
  if (!eventId) return jsonError("event_id_required");
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true, title: true },
  });
  if (!event) return jsonError("event_not_found", 404);

  const url = `${APP_URL}/api/og/event/${encodeURIComponent(event.id)}`;
  return NextResponse.json({
    ok: true,
    eventId: event.id,
    title: event.title,
    url,
  });
}

export async function GET(req: Request) {
  const admin = await getAdminSession();
  if (!admin) return jsonError("unauthorized", 401);
  const url = new URL(req.url);
  const eventId = (url.searchParams.get("eventId") ?? "").trim();
  return handle(eventId);
}

export async function POST(req: Request) {
  const admin = await getAdminSession();
  if (!admin) return jsonError("unauthorized", 401);
  const body = await req.json().catch(() => ({} as any));
  const eventId = String(body?.eventId ?? "").trim();
  return handle(eventId);
}
