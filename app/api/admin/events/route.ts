export const runtime = "nodejs";
export const preferredRegion = "hnd1";

import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getAdminSession } from "@/lib/admin-auth";

const ALLOWED_STATUS = ["draft", "approved", "published"] as const;
type Status = (typeof ALLOWED_STATUS)[number];
function isStatus(v: string): v is Status {
  return (ALLOWED_STATUS as readonly string[]).includes(v);
}

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
  if (!value) return null;
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
  // JST midnight then set HH:MM
  const ymd = day.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
  return new Date(`${ymd}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00+09:00`);
}

export async function GET(req: Request) {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 }
    );
  }

  try {
    const url = new URL(req.url);
    const status = (url.searchParams.get("status") ?? "").trim();
    const venue = (url.searchParams.get("venue") ?? "").trim();

    const where: Prisma.EventWhereInput = {};
    if (status && isStatus(status)) where.status = status;
    if (venue && isVenue(venue)) where.venue = venue;

    const events = await prisma.event.findMany({
      where,
      orderBy: [{ startAt: "asc" }, { createdAt: "desc" }],
      include: {
        place: { select: { id: true, slug: true, name: true } },
        _count: { select: { snsPosts: true } },
      },
    });

    return NextResponse.json({
      ok: true,
      events: events.map((e) => ({
        id: e.id,
        title: e.title,
        description: e.description,
        venue: e.venue,
        category: e.category,
        startAt: e.startAt,
        endAt: e.endAt,
        sourceType: e.sourceType,
        sourceUrl: e.sourceUrl,
        officialUrl: e.officialUrl,
        competitorPrice: e.competitorPrice,
        ourPrice: e.ourPrice,
        bookingStartDays: e.bookingStartDays,
        bookingStartAt: e.bookingStartAt,
        bookingStartTime: e.bookingStartTime,
        status: e.status,
        place: e.place,
        placeId: e.placeId,
        snsPostsCount: e._count.snsPosts,
        // 新着バッジ用フラグ: 自動取得かつ未承認
        isNewlyScraped: e.sourceType !== "manual" && e.status === "draft",
        createdAt: e.createdAt,
        updatedAt: e.updatedAt,
      })),
    });
  } catch (error) {
    console.error("[admin/events][GET] error:", error);
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

export async function POST(req: Request) {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 }
    );
  }

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { ok: false, error: "invalid_json" },
        { status: 400 }
      );
    }

    const title = String(body.title ?? "").trim();
    const description = String(body.description ?? "").trim();
    const venueIn = String(body.venue ?? "").trim();
    const startAtIn = String(body.startAt ?? "").trim();
    const placeId = String(body.placeId ?? "").trim();

    if (!title) {
      return NextResponse.json(
        { ok: false, error: "title_required" },
        { status: 400 }
      );
    }
    if (!isVenue(venueIn)) {
      return NextResponse.json(
        { ok: false, error: "invalid_venue", message: "venue は sekisui_arena か qanda_stadium" },
        { status: 400 }
      );
    }
    const startAt = parseDateOrNull(startAtIn);
    if (!startAt) {
      return NextResponse.json(
        { ok: false, error: "invalid_start_at" },
        { status: 400 }
      );
    }

    const endAt = parseDateOrNull(body.endAt);
    const doorOpenAt = parseDateOrNull(body.doorOpenAt);
    const showStartAt = parseDateOrNull(body.showStartAt);
    const officialUrl = String(body.officialUrl ?? "").trim() || null;
    const competitorPrice = parseIntOrNull(body.competitorPrice);
    const ourPrice = parseIntOrNull(body.ourPrice);

    const bookingStartDaysRaw = parseIntOrNull(body.bookingStartDays);
    const bookingStartTime = String(body.bookingStartTime ?? "10:00").trim() || "10:00";

    // Validate bookingStartDays — either one of preset values or null (custom)
    const bookingStartDays =
      bookingStartDaysRaw !== null && ALLOWED_BOOKING_DAYS.includes(bookingStartDaysRaw)
        ? bookingStartDaysRaw
        : null;

    let bookingStartAt: Date | null = parseDateOrNull(body.bookingStartAt);
    if (!bookingStartAt && bookingStartDays !== null) {
      bookingStartAt = computeBookingStartAt(startAt, bookingStartDays, bookingStartTime);
    }

    const created = await prisma.event.create({
      data: {
        title,
        description: description || null,
        venue: venueIn,
        category: "concert",
        startAt,
        endAt,
        doorOpenAt,
        showStartAt,
        sourceType: "manual",
        officialUrl,
        competitorPrice,
        ourPrice,
        bookingStartDays,
        bookingStartAt,
        bookingStartTime,
        status: "draft",
        placeId: placeId || null,
      },
    });

    return NextResponse.json({ ok: true, event: created });
  } catch (error) {
    console.error("[admin/events][POST] error:", error);
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
