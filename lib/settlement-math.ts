import { calcHourlyFee } from "@/lib/pricing-core";

function roundYen(value: number) {
  return Math.round(value);
}

export function calcSplitAmounts(
  grossAmount: number,
  ownerRateBps: number,
  agentRateBps: number,
  platformRateBps: number
) {
  const ownerAmount = roundYen((grossAmount * ownerRateBps) / 10000);
  const agentAmount = roundYen((grossAmount * agentRateBps) / 10000);
  const platformAmount = grossAmount - ownerAmount - agentAmount;

  return {
    ownerAmount,
    agentAmount,
    platformAmount,
  };
}

export function calcTax(total: number, taxRate = 0.1) {
  const taxBp = Math.round(taxRate * 10000);
  const subtotal = Math.floor((total * 10000) / (10000 + taxBp));
  const tax = total - subtotal;
  return { subtotal, tax, total, taxRate };
}

export function calcSettlementTotals(
  grossTotal: number,
  options?: { taxRate?: number; platformRate?: number }
) {
  const taxRate = options?.taxRate ?? 0.1;
  const platformRate = options?.platformRate ?? 0.2;

  const totalNet = Math.floor(grossTotal / (1 + taxRate));
  const totalTax = grossTotal - totalNet;

  const platformNet = Math.floor(totalNet * platformRate);
  const platformTax = Math.round(platformNet * taxRate);
  const platformGross = platformNet + platformTax;

  const ownerPayout = grossTotal - platformGross;

  return {
    grossTotal,
    totalNet,
    totalTax,
    platformNet,
    platformTax,
    platformGross,
    ownerPayout,
    taxRate,
    platformRate,
  };
}

function getDeadlineJst(useDate: string): Date {
  const [y, m, d] = useDate.split("-").map(Number);
  const useDateMidnightUtc = new Date(Date.UTC(y, m - 1, d, -9, 0, 0));
  return new Date(useDateMidnightUtc.getTime() - 48 * 60 * 60 * 1000);
}

export type CancellationPolicy = {
  rule: "cancellable" | "too_late";
  canCancel: boolean;
  cancelFee: number;
  refundAmount: number;
  deadline: Date;
};

export function calcCancellationPolicy(
  price: number,
  useDate: string,
  now: Date = new Date()
): CancellationPolicy {
  const CANCEL_FEE = 320;
  const deadline = getDeadlineJst(useDate);

  if (now.getTime() < deadline.getTime()) {
    const refundAmount = Math.max(0, price - CANCEL_FEE);
    return {
      rule: "cancellable",
      canCancel: true,
      cancelFee: CANCEL_FEE,
      refundAmount,
      deadline,
    };
  }

  return {
    rule: "too_late",
    canCancel: false,
    cancelFee: price,
    refundAmount: 0,
    deadline,
  };
}

export type DateChangePolicy = {
  rule: "changeable" | "too_late" | "already_changed";
  canChange: boolean;
  deadline: Date;
};

export function calcDateChangePolicy(
  paidAt: Date,
  dateChangeCount: number,
  now: Date = new Date()
): DateChangePolicy {
  const deadline = new Date(paidAt.getTime() + 24 * 60 * 60 * 1000);

  if (dateChangeCount >= 1) {
    return {
      rule: "already_changed",
      canChange: false,
      deadline,
    };
  }

  if (now.getTime() < deadline.getTime()) {
    return {
      rule: "changeable",
      canChange: true,
      deadline,
    };
  }

  return {
    rule: "too_late",
    canChange: false,
    deadline,
  };
}

// ===== 時間貸し超過ペナルティ =====
// 事前決済で買った出庫期限（scheduledEndAt）を過ぎた場合の請求額。
// 利用規約 第6条の2 に対応。
//
// 超過は2段階。
//   1. 買った時間の超過だけ → 超過分の時間貸し料金のみ。
//      後続予約が無ければ誰も困らないため、対応費用は取らない。
//   2. 後続予約日の午前0時も超過 → 予約者が停められない実害が出るため、
//      返金相当額と対応費用5,000円を加算する。
//
// 純粋関数として保つため、返金相当額は呼び出し側が Reservation.refundAmount から
// 取得して渡すこと。refundStatus が SUCCEEDED / PENDING のときのみ加算し、
// FAILED / NONE / NOT_REQUIRED のときは 0 を渡す。

// 対応費用（深夜0時の期限に対する即応体制の維持費用。規約 第6条の2）。
export const OVERSTAY_RESPONSE_FEE = 5000;

export type OverstayPenalty = {
  isOverstay: boolean;
  overstayMinutes: number;
  hourlyFee: number;
  refundAmount: number;
  responseFee: number;
  total: number;
  // 後続予約日の午前0時を超えたか（対応費用の発生条件）
  exceededReservationLimit: boolean;
};

export function calcOverstayPenalty(params: {
  // 事前決済で買った出庫期限
  scheduledEndAt: Date;
  exitAt: Date;
  hourlyYen: number;
  dailyYen: number | null;
  // 後続予約日の午前0時。予約が無ければ null
  reservationLimitAt?: Date | null;
  refundAmount?: number;
}): OverstayPenalty {
  const { scheduledEndAt, exitAt, hourlyYen, dailyYen } = params;
  const reservationLimitAt = params.reservationLimitAt ?? null;

  const diffMs = exitAt.getTime() - scheduledEndAt.getTime();

  if (diffMs <= 0) {
    return {
      isOverstay: false,
      overstayMinutes: 0,
      hourlyFee: 0,
      refundAmount: 0,
      responseFee: 0,
      total: 0,
      exceededReservationLimit: false,
    };
  }

  const overstayMinutes = Math.ceil(diffMs / 60000);
  const hourlyFee = calcHourlyFee(overstayMinutes, hourlyYen, dailyYen);

  const exceededReservationLimit =
    reservationLimitAt != null &&
    exitAt.getTime() > reservationLimitAt.getTime();

  const refundAmount = exceededReservationLimit
    ? Math.max(0, params.refundAmount ?? 0)
    : 0;

  const responseFee = exceededReservationLimit ? OVERSTAY_RESPONSE_FEE : 0;

  return {
    isOverstay: true,
    overstayMinutes,
    hourlyFee,
    refundAmount,
    responseFee,
    total: hourlyFee + refundAmount + responseFee,
    exceededReservationLimit,
  };
}
