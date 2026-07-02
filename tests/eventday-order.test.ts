import { describe, it, expect, beforeEach, vi } from "vitest";

// ─────────────────────────────────────────────────────────────
// in-memory Prisma スタブ（EventDay / PricingRule / Event を配列で保持）
// pricing route POST と event-day-sync が同じストアを共有する。
// vi.mock は先頭へ巻き上げられるため store/stub も vi.hoisted で巻き上げる。
// ─────────────────────────────────────────────────────────────
const { store, prismaStub } = vi.hoisted(() => {
  type Row = Record<string, any>;
  const store: {
    eventDays: Row[];
    pricingRules: Row[];
    events: Row[];
    places: Row[];
    venueGroupParkings: Row[];
    seq: number;
  } = {
    eventDays: [],
    pricingRules: [],
    events: [],
    places: [],
    venueGroupParkings: [],
    seq: 0,
  };

  function nextId(prefix: string) {
    store.seq += 1;
    return `${prefix}-${store.seq}`;
  }
  function sameDate(a: Date, b: Date) {
    return new Date(a).getTime() === new Date(b).getTime();
  }

  const prismaStub = {
    place: {
      findUnique: async ({ where }: any) =>
        store.places.find((p) => p.id === where.id) ?? null,
      findMany: async ({ where }: any) => {
        let rows = store.places;
        if (where?.slug?.in) rows = rows.filter((p) => where.slug.in.includes(p.slug));
        if (where?.id?.in) rows = rows.filter((p) => where.id.in.includes(p.id));
        if (where?.isActive != null) rows = rows.filter((p) => p.isActive === where.isActive);
        return rows.map((p) => ({ ...p }));
      },
    },
    pricingRule: {
      findFirst: async ({ where }: any) => {
        const rows = store.pricingRules
          .filter((r) => r.placeId === where.placeId && r.pricingType === where.pricingType)
          .sort((a, b) => b.createdAt - a.createdAt);
        return rows[0] ?? null;
      },
      update: async ({ where, data }: any) => {
        const r = store.pricingRules.find((x) => x.id === where.id);
        Object.assign(r, data);
        return { ...r };
      },
      create: async ({ data }: any) => {
        const r = { id: nextId("pr"), createdAt: Date.now(), ...data };
        store.pricingRules.push(r);
        return { ...r };
      },
    },
    eventDay: {
      updateMany: async ({ where, data }: any) => {
        let rows = store.eventDays.filter((d) => d.placeId === where.placeId);
        if (where.date?.notIn) {
          rows = rows.filter((d) => !where.date.notIn.some((t: Date) => sameDate(d.date, t)));
        }
        rows.forEach((d) => Object.assign(d, data));
        return { count: rows.length };
      },
      upsert: async ({ where, update, create }: any) => {
        const { placeId, date } = where.placeId_date;
        const existing = store.eventDays.find(
          (d) => d.placeId === placeId && sameDate(d.date, date)
        );
        if (existing) {
          Object.assign(existing, update);
          return { ...existing };
        }
        const row = { id: nextId("ed"), createdAt: Date.now(), ...create };
        store.eventDays.push(row);
        return { ...row };
      },
      findMany: async ({ where }: any) => {
        let rows = store.eventDays.filter((d) => d.placeId === where.placeId);
        if (where?.isActive != null) rows = rows.filter((d) => d.isActive === where.isActive);
        return rows.map((d) => ({ ...d }));
      },
    },
    event: {
      findUnique: async ({ where }: any) =>
        store.events.find((e) => e.id === where.id) ?? null,
    },
    venueGroupParking: {
      findMany: async () => store.venueGroupParkings.map((v) => ({ ...v })),
    },
  };

  return { store, prismaStub };
});

vi.mock("@/lib/db", () => ({ prisma: prismaStub }));
vi.mock("@/lib/admin-auth", () => ({ requireAdmin: vi.fn().mockResolvedValue(undefined) }));

import { POST } from "../app/api/admin/pricing/route";
import { syncEventDayFromEvent } from "@/lib/event-day-sync";

const PLACE_ID = "rifu-main-id";

function resetStore() {
  store.eventDays = [];
  store.pricingRules = [];
  store.events = [];
  store.venueGroupParkings = [];
  store.seq = 0;
  store.places = [
    { id: PLACE_ID, slug: "rifu-main", name: "利府メイン", isActive: true },
  ];
}

function seedPublishedEvent(id: string, ymd: string, title: string, ourPrice: number | null) {
  // startAt は JST その日の19:00 相当（UTCで +10:00）。jstYmd で ymd になる。
  store.events.push({
    id,
    title,
    status: "published",
    placeId: PLACE_ID,
    venueGroupId: null,
    startAt: new Date(`${ymd}T10:00:00.000Z`),
    bookingStartDays: null,
    ourPrice,
  });
}

function pricingRequest(eventDays: any[]) {
  return new Request("http://localhost/api/admin/pricing", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      placeId: PLACE_ID,
      reservationFixedYen: 3000,
      hourlyYen: 500,
      dailyYen: null,
      eventDays,
    }),
  });
}

function getEventDay(ymd: string) {
  const target = new Date(`${ymd}T00:00:00.000Z`).getTime();
  return store.eventDays.find(
    (d) => d.placeId === PLACE_ID && new Date(d.date).getTime() === target
  );
}

describe("③一本化後: 予約の開閉(isActive)は publish 専任・料金設定は触らない", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStore();
  });

  it("順序A: 料金設定で追加(この時点は閉) → publish で開く。最終 isActive:true・料金3000", async () => {
    const res = await POST(
      pricingRequest([
        { date: "2026-07-25", label: "乃木坂46", fixedYenOverride: 3000, reservationOpenDaysBefore: 0 },
      ])
    );
    expect(res.status).toBe(200);
    // ③: 料金設定だけでは開かない（新規日は閉じた状態で作成）
    expect(getEventDay("2026-07-25")!.isActive).toBe(false);

    seedPublishedEvent("ev-725", "2026-07-25", "乃木坂46 真夏の全国ツアー2026", 3000);
    await syncEventDayFromEvent("ev-725");

    const d = getEventDay("2026-07-25");
    expect(d!.isActive).toBe(true);
    expect(d!.fixedYenOverride).toBe(3000);
  });

  it("順序B: publish → 料金設定で保存しても 7/25 は開いたまま・料金3000", async () => {
    seedPublishedEvent("ev-725", "2026-07-25", "乃木坂46 真夏の全国ツアー2026", 3000);
    await syncEventDayFromEvent("ev-725");
    expect(getEventDay("2026-07-25")!.isActive).toBe(true);

    const res = await POST(
      pricingRequest([
        { date: "2026-07-25", label: "乃木坂46 真夏の全国ツアー2026", fixedYenOverride: 3000, reservationOpenDaysBefore: 0 },
      ])
    );
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);

    const d = getEventDay("2026-07-25");
    // ③: 料金設定は isActive を触らない → 開いたまま
    expect(d!.isActive).toBe(true);
    expect(d!.fixedYenOverride).toBe(3000);
  });

  it("旧・落とし穴の解消: publish済み7/25を送信外にして別日を保存しても 7/25 は閉じない", async () => {
    seedPublishedEvent("ev-725", "2026-07-25", "乃木坂46", 3000);
    await syncEventDayFromEvent("ev-725");
    expect(getEventDay("2026-07-25")!.isActive).toBe(true);

    // 別の日 8/1 だけを保存（7/25 を送らない）
    const res = await POST(
      pricingRequest([
        { date: "2026-08-01", label: "別イベント", fixedYenOverride: 3000, reservationOpenDaysBefore: 0 },
      ])
    );
    expect(res.status).toBe(200);

    // ③: updateMany の全OFF撤廃により 7/25 は開いたまま（回帰防止の核心）
    expect(getEventDay("2026-07-25")!.isActive).toBe(true);
    // 新規追加の 8/1 は publish 前なので閉じている
    expect(getEventDay("2026-08-01")!.isActive).toBe(false);
  });
});
