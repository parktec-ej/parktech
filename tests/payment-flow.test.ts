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

  it("price=1000, 2+ days before → cancelFee=500, refundAmount=200", () => {
    const r = calcCancellationPolicy(1000, "2026-05-05", today);
    expect(r.rule).toBe("until_2_days_before");
    expect(r.cancelFee).toBe(500);
    expect(r.refundFee).toBe(300);
    expect(r.refundAmount).toBe(200);
  });

  it("price=1000, day before → refundAmount=0", () => {
    const r = calcCancellationPolicy(1000, "2026-05-02", today);
    expect(r.rule).toBe("day_before_or_same_day");
    expect(r.refundAmount).toBe(0);
  });

  it("price=1000, same day → refundAmount=0", () => {
    const r = calcCancellationPolicy(1000, "2026-05-01", today);
    expect(r.rule).toBe("day_before_or_same_day");
    expect(r.refundAmount).toBe(0);
  });
});
