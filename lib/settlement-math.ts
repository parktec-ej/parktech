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

function parseYmdAsJstDate(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function startOfTodayJst() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export function calcCancellationPolicy(
  price: number,
  useDate: string,
  todayJst: Date = startOfTodayJst(),
  paidAt?: Date | null
) {
  const refundFee = 300;
  const useDateObj = parseYmdAsJstDate(useDate);
  const diffMs = useDateObj.getTime() - todayJst.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  // 当日キャンセル
  if (diffDays < 1) {
    return {
      rule: "same_day" as const,
      cancelFee: price,
      refundFee: 0,
      refundAmount: 0,
    };
  }

  // 前日キャンセル（1日前）
  if (diffDays < 2) {
    const cancelFee = Math.floor(price * 0.5);
    const refundAmount = Math.max(0, price - cancelFee - refundFee);
    return {
      rule: "day_before" as const,
      cancelFee,
      refundFee,
      refundAmount,
    };
  }

  // 2日前以前：予約から48時間以内なら手数料300円のみ
  if (paidAt) {
    const now = new Date();
    const hoursSincePaid = (now.getTime() - paidAt.getTime()) / (1000 * 60 * 60);
    if (hoursSincePaid <= 48) {
      const cancelFee = refundFee; // 300円
      const refundAmount = Math.max(0, price - cancelFee);
      return {
        rule: "within_48h" as const,
        cancelFee,
        refundFee: 0,
        refundAmount,
      };
    }
  }

  // 2日前以前：通常（50%）
  const cancelFee = Math.floor(price * 0.5);
  const refundAmount = Math.max(0, price - cancelFee - refundFee);
  return {
    rule: "until_2_days_before" as const,
    cancelFee,
    refundFee,
    refundAmount,
  };
}
