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

function startOfUseDateJst(ymd: string) {
  // YYYY-MM-DD を JST (UTC+9) の 00:00:00 として解釈
  return new Date(`${ymd}T00:00:00+09:00`);
}

export const CANCELLATION_FEE_YEN = 320;
export const CANCELLATION_CUTOFF_HOURS = 48;

export function calcCancellationPolicy(
  price: number,
  useDate: string,
  now: Date = new Date()
) {
  const useDateObj = startOfUseDateJst(useDate);
  const hoursUntilUse = (useDateObj.getTime() - now.getTime()) / (1000 * 60 * 60);

  // 利用日まで48時間未満: キャンセル不可（全額請求）
  if (hoursUntilUse < CANCELLATION_CUTOFF_HOURS) {
    return {
      rule: "within_48h" as const,
      canCancel: false,
      cancelFee: price,
      refundFee: 0,
      refundAmount: 0,
    };
  }

  // 利用日まで48時間以上: キャンセル可、手数料 ¥320
  const cancelFee = CANCELLATION_FEE_YEN;
  const refundAmount = Math.max(0, price - cancelFee);
  return {
    rule: "before_48h" as const,
    canCancel: true,
    cancelFee,
    refundFee: 0,
    refundAmount,
  };
}
