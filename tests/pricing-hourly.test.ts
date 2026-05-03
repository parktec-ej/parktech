import { describe, it, expect } from "vitest";
import { calcHourlyFee } from "@/lib/pricing-core";

describe("calcHourlyFee — hourlyYen=200, dailyYen=700", () => {
  const hourlyYen = 200;
  const dailyYen = 700;

  it("1 hour (60 min) → 200 yen", () => {
    expect(calcHourlyFee(60, hourlyYen, dailyYen)).toBe(200);
  });

  it("3 hours (180 min) → 600 yen", () => {
    expect(calcHourlyFee(180, hourlyYen, dailyYen)).toBe(600);
  });

  it("4 hours (240 min) → 700 yen (cap reached)", () => {
    expect(calcHourlyFee(240, hourlyYen, dailyYen)).toBe(700);
  });

  it("5 hours (300 min) → 700 yen (cap holds)", () => {
    expect(calcHourlyFee(300, hourlyYen, dailyYen)).toBe(700);
  });

  it("24 hours (1440 min) → 700 yen (cap)", () => {
    expect(calcHourlyFee(1440, hourlyYen, dailyYen)).toBe(700);
  });

  it("25 hours (1500 min) → 900 yen (cap resets + 1h)", () => {
    expect(calcHourlyFee(1500, hourlyYen, dailyYen)).toBe(900);
  });

  it("28 hours (1680 min) → 1400 yen (2-day cap)", () => {
    expect(calcHourlyFee(1680, hourlyYen, dailyYen)).toBe(1400);
  });

  it("48 hours (2880 min) → 1400 yen (2-day cap holds)", () => {
    expect(calcHourlyFee(2880, hourlyYen, dailyYen)).toBe(1400);
  });

  it("49 hours (2940 min) → 1600 yen (day 3 + 1h)", () => {
    expect(calcHourlyFee(2940, hourlyYen, dailyYen)).toBe(1600);
  });
});

describe("calcHourlyFee — dailyYen=null (no cap)", () => {
  const hourlyYen = 200;

  it("5 hours (300 min), no cap → 1000 yen", () => {
    expect(calcHourlyFee(300, hourlyYen, null)).toBe(1000);
  });

  it("25 hours (1500 min), no cap → 5000 yen", () => {
    expect(calcHourlyFee(1500, hourlyYen, null)).toBe(5000);
  });
});
