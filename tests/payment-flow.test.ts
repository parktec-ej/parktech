import { describe, it, expect } from "vitest";
import {
  calcSplitAmounts,
  calcTax,
  calcCancellationPolicy,
} from "@/lib/settlement-math";

describe("calcSplitAmounts", () => {
  it("gross=1000, 8000/1000/1000 bps → 800/100/100 and sums to gross", () => {
    const r = calcSplitAmounts(1000, 8000, 1000, 1000);
    expect(r.ownerAmount).toBe(800);
    expect(r.agentAmount).toBe(100);
    expect(r.platformAmount).toBe(100);
    expect(r.ownerAmount + r.agentAmount + r.platformAmount).toBe(1000);
  });
});

describe("calcTax", () => {
  it("total=1100 → subtotal=1000, tax=100", () => {
    const r = calcTax(1100);
    expect(r.subtotal).toBe(1000);
    expect(r.tax).toBe(100);
  });

  it("total=1050 → subtotal=954, tax=96 (floor rounding)", () => {
    const r = calcTax(1050);
    expect(r.subtotal).toBe(954);
    expect(r.tax).toBe(96);
  });
});

describe("calcCancellationPolicy", () => {
  // 利用日 = 2026-05-05 JST (00:00:00 JST = 2026-05-04T15:00:00Z)
  const useDate = "2026-05-05";
  const useDateJstStart = new Date("2026-05-05T00:00:00+09:00");

  it("利用日まで72時間 → キャンセル可、手数料320円", () => {
    const now = new Date(useDateJstStart.getTime() - 72 * 60 * 60 * 1000);
    const r = calcCancellationPolicy(1000, useDate, now);
    expect(r.rule).toBe("before_48h");
    expect(r.canCancel).toBe(true);
    expect(r.cancelFee).toBe(320);
    expect(r.refundFee).toBe(0);
    expect(r.refundAmount).toBe(680);
  });

  it("利用日まで丁度48時間 → キャンセル可（境界包含）", () => {
    const now = new Date(useDateJstStart.getTime() - 48 * 60 * 60 * 1000);
    const r = calcCancellationPolicy(1000, useDate, now);
    expect(r.rule).toBe("before_48h");
    expect(r.canCancel).toBe(true);
    expect(r.cancelFee).toBe(320);
    expect(r.refundAmount).toBe(680);
  });

  it("利用日まで47時間59分 → キャンセル不可、全額請求", () => {
    const now = new Date(useDateJstStart.getTime() - (48 * 60 - 1) * 60 * 1000);
    const r = calcCancellationPolicy(1000, useDate, now);
    expect(r.rule).toBe("within_48h");
    expect(r.canCancel).toBe(false);
    expect(r.cancelFee).toBe(1000);
    expect(r.refundFee).toBe(0);
    expect(r.refundAmount).toBe(0);
  });

  it("利用日当日 → キャンセル不可", () => {
    const now = new Date(useDateJstStart.getTime() + 6 * 60 * 60 * 1000);
    const r = calcCancellationPolicy(1000, useDate, now);
    expect(r.rule).toBe("within_48h");
    expect(r.canCancel).toBe(false);
    expect(r.refundAmount).toBe(0);
  });

  it("price=320 → 手数料320円、返金0円", () => {
    const now = new Date(useDateJstStart.getTime() - 72 * 60 * 60 * 1000);
    const r = calcCancellationPolicy(320, useDate, now);
    expect(r.canCancel).toBe(true);
    expect(r.cancelFee).toBe(320);
    expect(r.refundAmount).toBe(0);
  });

  it("price=200 (手数料未満) → 返金は負にならず0円", () => {
    const now = new Date(useDateJstStart.getTime() - 72 * 60 * 60 * 1000);
    const r = calcCancellationPolicy(200, useDate, now);
    expect(r.canCancel).toBe(true);
    expect(r.cancelFee).toBe(320);
    expect(r.refundAmount).toBe(0);
  });
});
