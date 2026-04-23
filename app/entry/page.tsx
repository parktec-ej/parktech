import type { CSSProperties } from "react";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";

type OperationMode =
  | "RESERVATION_ONLY"
  | "HOURLY_ONLY"
  | "RESERVATION_THEN_HOURLY"
  | "EVENT_ONLY"
  | "CLOSED";

function normalizeDate(input: string) {
  const value = String(input ?? "").trim();

  if (!value) return "";

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

  if (/^\d{8}$/.test(value)) {
    return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  }

  return value;
}

function normalizeSlot(input: string) {
  const value = String(input ?? "").trim().toUpperCase();
  if (!value) return "";

  const s = value.match(/^S(\d{1,2})$/i);
  if (s) {
    return `S${String(Number(s[1])).padStart(2, "0")}`;
  }

  const a = value.match(/^([A-Z])[- ]?(\d{1,2})$/i);
  if (a) {
    return `${a[1].toUpperCase()}-${String(Number(a[2])).padStart(2, "0")}`;
  }

  return value;
}

function ymdTodayJst() {
  return new Date().toLocaleDateString("sv-SE", {
    timeZone: "Asia/Tokyo",
  });
}

async function resolveActivePlace(placeIdOrSlug: string) {
  const raw = String(placeIdOrSlug ?? "").trim();
  if (!raw) return null;

  const byId = await prisma.place.findFirst({
    where: {
      id: raw,
      isActive: true,
    },
    select: {
      id: true,
      slug: true,
      name: true,
      address: true,
      operationMode: true,
    },
  });
  if (byId) return byId;

  const bySlug = await prisma.place.findFirst({
    where: {
      slug: raw,
      isActive: true,
    },
    select: {
      id: true,
      slug: true,
      name: true,
      address: true,
      operationMode: true,
    },
  });

  return bySlug;
}

export default async function EntryPage({
  searchParams,
}: {
  searchParams?: Promise<{
    placeId?: string;
    slot?: string;
    date?: string;
  }>;
}) {
  const sp = (await searchParams) ?? {};

  const rawPlaceId = String(sp.placeId ?? "").trim();
  const rawSlot = String(sp.slot ?? "").trim();
  const date = normalizeDate(sp.date ?? ymdTodayJst());
  const slot = normalizeSlot(rawSlot);

  if (!rawPlaceId) {
    return (
      <main style={pageStyle}>
        <div style={cardStyle}>
          <h1 style={titleStyle}>利用できません</h1>
          <p style={messageStyle}>駐車場情報が見つかりません。</p>
        </div>
      </main>
    );
  }

  if (!slot) {
    return (
      <main style={pageStyle}>
        <div style={cardStyle}>
          <h1 style={titleStyle}>利用できません</h1>
          <p style={messageStyle}>車室情報が見つかりません。</p>
        </div>
      </main>
    );
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return (
      <main style={pageStyle}>
        <div style={cardStyle}>
          <h1 style={titleStyle}>利用できません</h1>
          <p style={messageStyle}>利用日が不正です。</p>
        </div>
      </main>
    );
  }

  const place = await resolveActivePlace(rawPlaceId);

  if (!place) {
    return (
      <main style={pageStyle}>
        <div style={cardStyle}>
          <h1 style={titleStyle}>利用できません</h1>
          <p style={messageStyle}>駐車場情報が見つかりません。</p>
        </div>
      </main>
    );
  }

  const spot = await prisma.spot.findFirst({
    where: {
      placeId: place.id,
      isActive: true,
      code: slot,
    },
    select: {
      id: true,
      code: true,
      label: true,
      operationModeOverride: true,
    },
  });

  if (!spot) {
    return (
      <main style={pageStyle}>
        <div style={cardStyle}>
          <h1 style={titleStyle}>利用できません</h1>
          <p style={messageStyle}>車室情報が見つかりません。</p>
        </div>
      </main>
    );
  }

  const dayMode = await prisma.spotModeCalendar.findUnique({
    where: {
      spotId_date: {
        spotId: spot.id,
        date,
      },
    },
    select: {
      operationMode: true,
    },
  });

  const effectiveMode =
    (dayMode?.operationMode as OperationMode | undefined) ??
    (spot.operationModeOverride as OperationMode | null) ??
    (place.operationMode as OperationMode | null) ??
    "RESERVATION_ONLY";

  if (effectiveMode === "CLOSED") {
    return (
      <main style={pageStyle}>
        <div style={cardStyle}>
          <h1 style={titleStyle}>本日は利用できません</h1>
          <div style={infoStyle}>
            <div>駐車場: {place.name}</div>
            <div>区画: {spot.label ?? spot.code}</div>
            <div>日付: {date}</div>
          </div>
          <p style={messageStyle}>この区画は本日クローズです。</p>
        </div>
      </main>
    );
  }

  const encodedPlaceId = encodeURIComponent(place.slug || place.id);
  const encodedSlot = encodeURIComponent(spot.code);
  const encodedDate = encodeURIComponent(date);

  if (effectiveMode === "RESERVATION_ONLY") {
    redirect(
      `/checkin?placeId=${encodedPlaceId}&slot=${encodedSlot}&date=${encodedDate}`
    );
  }

  if (effectiveMode === "EVENT_ONLY") {
    redirect(
      `/checkin?placeId=${encodedPlaceId}&slot=${encodedSlot}&date=${encodedDate}`
    );
  }

  if (effectiveMode === "HOURLY_ONLY") {
    redirect(
      `/hourly-start?placeId=${encodedPlaceId}&slot=${encodedSlot}&date=${encodedDate}`
    );
  }

  if (effectiveMode === "RESERVATION_THEN_HOURLY") {
    const existingReservation = await prisma.reservation.findFirst({
      where: {
        placeId: place.id,
        date,
        OR: [{ spotId: spot.id }, { slot: spot.code }],
      },
      select: {
        id: true,
      },
    });

    if (existingReservation) {
      redirect(
        `/checkin?placeId=${encodedPlaceId}&slot=${encodedSlot}&date=${encodedDate}`
      );
    }

    redirect(
      `/hourly-start?placeId=${encodedPlaceId}&slot=${encodedSlot}&date=${encodedDate}`
    );
  }

  return (
    <main style={pageStyle}>
      <div style={cardStyle}>
        <h1 style={titleStyle}>利用できません</h1>
        <div style={infoStyle}>
          <div>駐車場: {place.name}</div>
          <div>区画: {spot.label ?? spot.code}</div>
          <div>日付: {date}</div>
        </div>
        <p style={messageStyle}>営業モードを判定できませんでした。</p>
      </div>
    </main>
  );
}

const pageStyle: CSSProperties = {
  minHeight: "100vh",
  background: "#f7f7f7",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
};

const cardStyle: CSSProperties = {
  width: "100%",
  maxWidth: 560,
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 20,
  padding: 24,
  boxShadow: "0 8px 30px rgba(0,0,0,0.06)",
};

const titleStyle: CSSProperties = {
  fontSize: 28,
  fontWeight: 900,
  marginBottom: 16,
};

const infoStyle: CSSProperties = {
  color: "#444",
  lineHeight: 1.8,
  marginBottom: 16,
};

const messageStyle: CSSProperties = {
  fontSize: 16,
  color: "#111",
  lineHeight: 1.8,
};