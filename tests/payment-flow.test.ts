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
  // Pin "today" so the test is deterministic (function accepts an explicit JST today).
  const today = new Date(2026, 4, 1); // 2026-05-01 local midnight

  it("price=1000, 2+ days before, no paidAt → 50% cancelFee + 300円, refundAmount=200", () => {
    const r = calcCancellationPolicy(1000, "2026-05-05", today);
    expect(r.rule).toBe("until_2_days_before");
    expect(r.cancelFee).toBe(500);
    expect(r.refundFee).toBe(300);
    expect(r.refundAmount).toBe(200);
  });

  it("price=1000, 2+ days before, paidAt > 48h ago → until_2_days_before (50%)", () => {
    // paidAt = 72時間前
    const paidAt = new Date(Date.now() - 72 * 60 * 60 * 1000);
    const r = calcCancellationPolicy(1000, "2026-05-05", today, paidAt);
    expect(r.rule).toBe("until_2_days_before");
    expect(r.cancelFee).toBe(500);
    expect(r.refundFee).toBe(300);
    expect(r.refundAmount).toBe(200);
  });

  it("price=1000, 2+ days before, paidAt within 48h → within_48h (300円のみ)", () => {
    // paidAt = 1時間前
    const paidAt = new Date(Date.now() - 60 * 60 * 1000);
    const r = calcCancellationPolicy(1000, "2026-05-05", today, paidAt);
    expect(r.rule).toBe("within_48h");
    expect(r.cancelFee).toBe(300);
    expect(r.refundFee).toBe(0);
    expect(r.refundAmount).toBe(700);
  });

  it("price=1000, day before → day_before, 50% + 300円, refundAmount=200", () => {
    const r = calcCancellationPolicy(1000, "2026-05-02", today);
    expect(r.rule).toBe("day_before");
    expect(r.cancelFee).toBe(500);
    expect(r.refundFee).toBe(300);
    expect(r.refundAmount).toBe(200);
  });

  it("price=1000, day before, paidAt within 48h → still day_before (48h rule doesn't apply)", () => {
    const paidAt = new Date(Date.now() - 60 * 60 * 1000);
    const r = calcCancellationPolicy(1000, "2026-05-02", today, paidAt);
    expect(r.rule).toBe("day_before");
    expect(r.refundAmount).toBe(200);
  });

  it("price=1000, same day → same_day, no refund", () => {
    const r = calcCancellationPolicy(1000, "2026-05-01", today);
    expect(r.rule).toBe("same_day");
    expect(r.cancelFee).toBe(1000);
    expect(r.refundFee).toBe(0);
    expect(r.refundAmount).toBe(0);
  });

  it("price=1000, same day, paidAt within 48h → still same_day (48h rule doesn't apply)", () => {
    const paidAt = new Date(Date.now() - 60 * 60 * 1000);
    const r = calcCancellationPolicy(1000, "2026-05-01", today, paidAt);
    expect(r.rule).toBe("same_day");
    expect(r.refundAmount).toBe(0);
  });

  it("price=1000, paidAt exactly 48h ago → still within_48h (boundary inclusive)", () => {
    const paidAt = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const r = calcCancellationPolicy(1000, "2026-05-05", today, paidAt);
    expect(r.rule).toBe("within_48h");
  });
});
