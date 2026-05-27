import { describe, it, expect } from "vitest";
import {
  calcSplitAmounts,
  calcTax,
  calcCancellationPolicy,
  calcDateChangePolicy,
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

describe("calcCancellationPolicy - new binary 48h policy", () => {
  // useDate = 2026-05-10, JST midnight = 2026-05-09T15:00:00Z
  // deadline (48h before) = 2026-05-07T15:00:00Z = JST 2026-05-08 00:00

  it("price=3000, 72h before useDate → cancellable, fee=320, refund=2680", () => {
    const now = new Date("2026-05-07T00:00:00Z");
    const r = calcCancellationPolicy(3000, "2026-05-10", now);
    expect(r.rule).toBe("cancellable");
    expect(r.canCancel).toBe(true);
    expect(r.cancelFee).toBe(320);
    expect(r.refundAmount).toBe(2680);
  });

  it("price=3000, exactly at deadline → too_late (boundary exclusive)", () => {
    const now = new Date("2026-05-07T15:00:00Z");
    const r = calcCancellationPolicy(3000, "2026-05-10", now);
    expect(r.rule).toBe("too_late");
    expect(r.canCancel).toBe(false);
    expect(r.cancelFee).toBe(3000);
    expect(r.refundAmount).toBe(0);
  });

  it("price=3000, 1ms before deadline → cancellable", () => {
    const now = new Date("2026-05-07T14:59:59.999Z");
    const r = calcCancellationPolicy(3000, "2026-05-10", now);
    expect(r.rule).toBe("cancellable");
    expect(r.canCancel).toBe(true);
    expect(r.cancelFee).toBe(320);
    expect(r.refundAmount).toBe(2680);
  });

  it("price=3000, 24h before useDate → too_late", () => {
    const now = new Date("2026-05-08T15:00:00Z");
    const r = calcCancellationPolicy(3000, "2026-05-10", now);
    expect(r.rule).toBe("too_late");
    expect(r.canCancel).toBe(false);
    expect(r.refundAmount).toBe(0);
  });

  it("price=3000, same day → too_late", () => {
    const now = new Date("2026-05-09T21:00:00Z");
    const r = calcCancellationPolicy(3000, "2026-05-10", now);
    expect(r.rule).toBe("too_late");
    expect(r.canCancel).toBe(false);
  });

  it("price=3000, after useDate → too_late", () => {
    const now = new Date("2026-05-11T00:00:00Z");
    const r = calcCancellationPolicy(3000, "2026-05-10", now);
    expect(r.rule).toBe("too_late");
    expect(r.canCancel).toBe(false);
  });

  it("price=100 (less than fee) → refund is 0, not negative", () => {
    const now = new Date("2026-05-01T00:00:00Z");
    const r = calcCancellationPolicy(100, "2026-05-10", now);
    expect(r.canCancel).toBe(true);
    expect(r.cancelFee).toBe(320);
    expect(r.refundAmount).toBe(0);
  });

  it("price=320 (equal to fee) → refund is 0", () => {
    const now = new Date("2026-05-01T00:00:00Z");
    const r = calcCancellationPolicy(320, "2026-05-10", now);
    expect(r.canCancel).toBe(true);
    expect(r.refundAmount).toBe(0);
  });

  it("deadline is always useDate JST 0:00 minus 48h", () => {
    const r = calcCancellationPolicy(1000, "2026-06-15", new Date("2026-06-01T00:00:00Z"));
    expect(r.deadline.toISOString()).toBe("2026-06-12T15:00:00.000Z");
  });
});

describe("calcDateChangePolicy - 24h from paidAt, 1 change max", () => {
  it("paidAt 1h ago, no changes → changeable", () => {
    const paidAt = new Date(Date.now() - 1 * 60 * 60 * 1000);
    const r = calcDateChangePolicy(paidAt, 0);
    expect(r.rule).toBe("changeable");
    expect(r.canChange).toBe(true);
  });

  it("paidAt 23h ago, no changes → changeable", () => {
    const paidAt = new Date(Date.now() - 23 * 60 * 60 * 1000);
    const r = calcDateChangePolicy(paidAt, 0);
    expect(r.rule).toBe("changeable");
    expect(r.canChange).toBe(true);
  });

  it("paidAt exactly 24h ago → too_late (boundary)", () => {
    const now = new Date("2026-06-01T12:00:00Z");
    const paidAt = new Date("2026-05-31T12:00:00Z");
    const r = calcDateChangePolicy(paidAt, 0, now);
    expect(r.rule).toBe("too_late");
    expect(r.canChange).toBe(false);
  });

  it("paidAt 24h ago minus 1ms → changeable (boundary)", () => {
    const now = new Date("2026-06-01T11:59:59.999Z");
    const paidAt = new Date("2026-05-31T12:00:00Z");
    const r = calcDateChangePolicy(paidAt, 0, now);
    expect(r.rule).toBe("changeable");
    expect(r.canChange).toBe(true);
  });

  it("paidAt 25h ago → too_late", () => {
    const paidAt = new Date(Date.now() - 25 * 60 * 60 * 1000);
    const r = calcDateChangePolicy(paidAt, 0);
    expect(r.rule).toBe("too_late");
    expect(r.canChange).toBe(false);
  });

  it("paidAt 1h ago, already changed once → already_changed", () => {
    const paidAt = new Date(Date.now() - 1 * 60 * 60 * 1000);
    const r = calcDateChangePolicy(paidAt, 1);
    expect(r.rule).toBe("already_changed");
    expect(r.canChange).toBe(false);
  });

  it("paidAt 1h ago, changed 2 times → already_changed", () => {
    const paidAt = new Date(Date.now() - 1 * 60 * 60 * 1000);
    const r = calcDateChangePolicy(paidAt, 2);
    expect(r.rule).toBe("already_changed");
    expect(r.canChange).toBe(false);
  });

  it("deadline is paidAt + 24h", () => {
    const paidAt = new Date("2026-06-01T10:00:00Z");
    const r = calcDateChangePolicy(paidAt, 0, new Date("2026-06-01T11:00:00Z"));
    expect(r.deadline.toISOString()).toBe("2026-06-02T10:00:00.000Z");
  });
});
