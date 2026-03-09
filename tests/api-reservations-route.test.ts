import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/db", () => {
  return {
    prisma: {
      place: {
        findUnique: vi.fn(),
      },
      spot: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
      },
      reservation: {
        create: vi.fn(),
        findMany: vi.fn(),
      },
    },
  };
});

vi.mock("@/lib/pricing-core", () => {
  return {
    getReservationFixedPrice: vi.fn(),
  };
});

import { POST } from "../app/api/reservations/route";
import { prisma } from "@/lib/db";
import { getReservationFixedPrice } from "@/lib/pricing-core";

const mockedPrisma = prisma as any;
const mockedGetReservationFixedPrice = getReservationFixedPrice as any;

const PLACE_ID = "place-1";
const SPOT_ID = "spot-1";

function makeRequest(body: unknown) {
  return new Request("http://localhost:3000/api/reservations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function readJson(res: Response) {
  return await res.json();
}

describe("app/api/reservations/route.ts POST", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockedPrisma.place.findUnique.mockResolvedValue({
      id: PLACE_ID,
      name: "ParkTech 利府メイン駐車場",
      operationMode: "RESERVATION_THEN_HOURLY",
      isActive: true,
    });

    mockedPrisma.spot.findUnique.mockResolvedValue({
      id: SPOT_ID,
      placeId: PLACE_ID,
      code: "A-01",
      label: "A-01",
      isActive: true,
      operationModeOverride: null,
    });

    mockedPrisma.spot.findFirst.mockResolvedValue({
      id: SPOT_ID,
      placeId: PLACE_ID,
      code: "A-01",
      label: "A-01",
      isActive: true,
      operationModeOverride: null,
    });

    mockedGetReservationFixedPrice.mockResolvedValue(3500);

    mockedPrisma.reservation.create.mockResolvedValue({
      id: "reservation-1",
      qrToken: "qr-1",
      pin: "1234",
      price: 3500,
      placeId: PLACE_ID,
      spotId: SPOT_ID,
      slot: "A-01",
    });
  });

  it("RESERVATION_ONLY なら予約作成できる", async () => {
    mockedPrisma.place.findUnique.mockResolvedValue({
      id: PLACE_ID,
      name: "ParkTech 利府メイン駐車場",
      operationMode: "RESERVATION_ONLY",
      isActive: true,
    });

    const req = makeRequest({
      placeId: PLACE_ID,
      spotId: SPOT_ID,
      date: "2026-03-22",
      name: "テスト太郎",
      plate: "宮城300あ1111",
      email: "test@example.com",
    });

    const res = await POST(req);
    const json = await readJson(res);

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.price).toBe(3500);
    expect(json.operationMode).toBe("RESERVATION_ONLY");
    expect(mockedGetReservationFixedPrice).toHaveBeenCalledWith(PLACE_ID, "2026-03-22");
    expect(mockedPrisma.reservation.create).toHaveBeenCalledTimes(1);
  });

  it("RESERVATION_THEN_HOURLY なら予約作成できる", async () => {
    mockedPrisma.place.findUnique.mockResolvedValue({
      id: PLACE_ID,
      name: "ParkTech 利府メイン駐車場",
      operationMode: "RESERVATION_THEN_HOURLY",
      isActive: true,
    });

    const req = makeRequest({
      placeId: PLACE_ID,
      spotId: SPOT_ID,
      date: "2026-03-22",
      name: "テスト太郎",
      plate: "宮城300あ1111",
      email: "test@example.com",
    });

    const res = await POST(req);
    const json = await readJson(res);

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.operationMode).toBe("RESERVATION_THEN_HOURLY");
    expect(mockedPrisma.reservation.create).toHaveBeenCalledTimes(1);
  });

  it("HOURLY_ONLY なら予約できない", async () => {
    mockedPrisma.place.findUnique.mockResolvedValue({
      id: PLACE_ID,
      name: "ParkTech 利府メイン駐車場",
      operationMode: "HOURLY_ONLY",
      isActive: true,
    });

    const req = makeRequest({
      placeId: PLACE_ID,
      spotId: SPOT_ID,
      date: "2026-03-22",
      name: "テスト太郎",
      plate: "宮城300あ1111",
      email: "test@example.com",
    });

    const res = await POST(req);
    const json = await readJson(res);

    expect(res.status).toBe(409);
    expect(json.ok).toBe(false);
    expect(json.error).toBe("この区画は時間貸し専用のため予約できません");
    expect(json.extra.operationMode).toBe("HOURLY_ONLY");
    expect(mockedPrisma.reservation.create).not.toHaveBeenCalled();
  });

  it("CLOSED なら予約できない", async () => {
    mockedPrisma.place.findUnique.mockResolvedValue({
      id: PLACE_ID,
      name: "ParkTech 利府メイン駐車場",
      operationMode: "CLOSED",
      isActive: true,
    });

    const req = makeRequest({
      placeId: PLACE_ID,
      spotId: SPOT_ID,
      date: "2026-03-22",
      name: "テスト太郎",
      plate: "宮城300あ1111",
      email: "test@example.com",
    });

    const res = await POST(req);
    const json = await readJson(res);

    expect(res.status).toBe(409);
    expect(json.ok).toBe(false);
    expect(json.error).toBe("この区画は営業していません");
    expect(json.extra.operationMode).toBe("CLOSED");
    expect(mockedPrisma.reservation.create).not.toHaveBeenCalled();
  });

  it("Spot override が HOURLY_ONLY なら Place が予約可でも予約できない", async () => {
    mockedPrisma.place.findUnique.mockResolvedValue({
      id: PLACE_ID,
      name: "ParkTech 利府メイン駐車場",
      operationMode: "RESERVATION_THEN_HOURLY",
      isActive: true,
    });

    mockedPrisma.spot.findUnique.mockResolvedValue({
      id: SPOT_ID,
      placeId: PLACE_ID,
      code: "A-01",
      label: "A-01",
      isActive: true,
      operationModeOverride: "HOURLY_ONLY",
    });

    const req = makeRequest({
      placeId: PLACE_ID,
      spotId: SPOT_ID,
      date: "2026-03-22",
      name: "テスト太郎",
      plate: "宮城300あ1111",
      email: "test@example.com",
    });

    const res = await POST(req);
    const json = await readJson(res);

    expect(res.status).toBe(409);
    expect(json.ok).toBe(false);
    expect(json.extra.operationMode).toBe("HOURLY_ONLY");
    expect(json.extra.placeOperationMode).toBe("RESERVATION_THEN_HOURLY");
    expect(json.extra.spotOperationModeOverride).toBe("HOURLY_ONLY");
    expect(mockedPrisma.reservation.create).not.toHaveBeenCalled();
  });
});