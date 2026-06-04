export const runtime = "nodejs";
export const preferredRegion = "hnd1";

import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getAdminSession } from "@/lib/admin-auth";
import {
  syncEventDayFromEvent,
  deactivateStaleEventDay,
} from "@/lib/event-day-sync";

const ALLOWED_VENUE = ["sekisui_arena", "qanda_stadium"] as const;
type Venue = (typeof ALLOWED_VENUE)[number];
function isVenue(v: string): v is Venue {
  return (ALLOWED_VENUE as readonly string[]).includes(v);
}

const ALLOWED_BOOKING_DAYS = [0, 14, 30, 60, 90];

function parseIntOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function parseDateOrNull(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

function computeBookingStartAt(
  startAt: Date,
  bookingStartDays: number | null,
  bookingStartTime: string | null
): Date | null {
  if (bookingStartDays === null) return null;
  const time = (bookingStartTime ?? "10:00").trim() || "10:00";
  const [hh, mm] = time.split(":").map((s) => Number(s));
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  const day = new Date(startAt.getTime() - bookingStartDays * 24 * 60 * 60 * 1000);
  const ymd = day.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
  return new Date(`${ymd}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00+09:00`);
}

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 }
    );
  }

  try {
    const { id } = await context.params;
    const event = await prisma.event.findUnique({
      where: { id },
      include: {
        place: { select: { id: true, slug: true, name: true } },
        venueGroup: { include: { parkings: true } },
        snsPosts: { orderBy: { phase: "asc" } },
      },
    });
    if (!event) {
      return NextResponse.json(
        { ok: false, error: "event_not_found" },
        { status: 404 }
      );
    }
    return NextResponse.json({ ok: true, event });
  } catch (error) {
    console.error("[admin/events/[id]][GET] error:", error);
    return NextResponse.json(
      {
        ok: false,
        error: "server_error",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 }
    );
  }

  try {
    const { id } = await context.params;
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { ok: false, error: "invalid_json" },
        { status: 400 }
      );
    }

    const existing = await prisma.event.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { ok: false, error: "event_not_found" },
        { status: 404 }
      );
    }

    const data: Prisma.EventUpdateInput = {};

    if (typeof body.title === "string") data.title = body.title.trim();
    if ("description" in body)
      data.description = String(body.description ?? "").trim() || null;
    if (typeof body.venue === "string" && isVenue(body.venue.trim()))
      data.venue = body.venue.trim();
    if ("officialUrl" in body)
      data.officialUrl = String(body.officialUrl ?? "").trim() || null;
    if ("competitorPrice" in body)
      data.competitorPrice = parseIntOrNull(body.competitorPrice);
    if ("ourPrice" in body) data.ourPrice = parseIntOrNull(body.ourPrice);
    if ("placeId" in body) {
      const pid = String(body.placeId ?? "").trim();
      data.place = pid ? { connect: { id: pid } } : { disconnect: true };
    }
    if ("venueGroupId" in body) {
      const vgid = String(body.venueGroupId ?? "").trim();
      data.venueGroup = vgid ? { connect: { id: vgid } } : { disconnect: true };
    }

    let nextStartAt: Date | null = null;
    if ("startAt" in body) {
      const s = parseDateOrNull(body.startAt);
      if (!s) {
        return NextResponse.json(
          { ok: false, error: "invalid_start_at" },
          { status: 400 }
        );
      }
      data.startAt = s;
      nextStartAt = s;
    }
    if ("endAt" in body) data.endAt = parseDateOrNull(body.endAt);
    if ("doorOpenAt" in body) data.doorOpenAt = parseDateOrNull(body.doorOpenAt);
    if ("showStartAt" in body) data.showStartAt = parseDateOrNull(body.showStartAt);

    let nextBookingStartDays: number | null | undefined = undefined;
    if ("bookingStartDays" in body) {
      const raw = parseIntOrNull(body.bookingStartDays);
      nextBookingStartDays =
        raw !== null && ALLOWED_BOOKING_DAYS.includes(raw) ? raw : null;
      data.bookingStartDays = nextBookingStartDays;
    }

    let nextBookingStartTime: string | null | undefined = undefined;
    if ("bookingStartTime" in body) {
      const t = String(body.bookingStartTime ?? "").trim();
      nextBookingStartTime = t || null;
      data.bookingStartTime = nextBookingStartTime;
    }

    // bookingStartAt の決定（予約系フィールドが来たときだけ更新）:
    //  1) カスタム日時(body.bookingStartAt が非null) → それを採用
    //  2) プリセット(bookingStartDays = N日前) → startAt から再計算
    //  3) どちらも無ければ null
    // ※ 編集画面はプリセット選択時に bookingStartAt:null を送るため、
    //   「"bookingStartAt" in body なら無条件 null」だと再計算されない（バグ）。
    const touchesBooking =
      "bookingStartAt" in body ||
      "bookingStartDays" in body ||
      "bookingStartTime" in body ||
      nextStartAt !== null;

    if (touchesBooking) {
      const explicitBookingStartAt =
        "bookingStartAt" in body ? parseDateOrNull(body.bookingStartAt) : null;
      const sAt = nextStartAt ?? existing.startAt;
      const days =
        nextBookingStartDays !== undefined
          ? nextBookingStartDays
          : existing.bookingStartDays;
      const time =
        nextBookingStartTime !== undefined
          ? nextBookingStartTime
          : existing.bookingStartTime;

      if (explicitBookingStartAt) {
        data.bookingStartAt = explicitBookingStartAt; // カスタム日時を優先
      } else if (days != null) {
        data.bookingStartAt = computeBookingStartAt(sAt, days, time); // プリセット再計算
      } else {
        data.bookingStartAt = null; // 未設定 / カスタム空
      }
    }

    const updated = await prisma.event.update({ where: { id }, data });

    // 日付が変わった場合は旧日付の予約日を閉じる（place直結・VenueGroup両対応）
    if (nextStartAt) {
      await deactivateStaleEventDay(
        existing.placeId,
        existing.venueGroupId,
        existing.startAt,
        nextStartAt
      );
    }
    // 料金・予約開始タイミング・公開状態を EventDay に反映
    await syncEventDayFromEvent(id);

    return NextResponse.json({ ok: true, event: updated });
  } catch (error) {
    console.error("[admin/events/[id]][PATCH] error:", error);
    return NextResponse.json(
      {
        ok: false,
        error: "server_error",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 }
    );
  }

  try {
    const { id } = await context.params;
    await prisma.event.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[admin/events/[id]][DELETE] error:", error);
    return NextResponse.json(
      {
        ok: false,
        error: "server_error",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
