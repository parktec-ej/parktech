// 月次締めの金額計算を一元化する純関数。
//
// 方針: Payment スナップショット（ownerRateBps/agentRateBps/platformRateBps から
// 確定済みの owner/agent/platformAmount）を「唯一の正」とし、Settlement の各金額は
// この集計から算出する。固定20%プラットフォーム手数料モデルは使用しない。
//
// この関数を settlements/create（API）と締め直しスクリプトの両方が呼ぶことで、
// 会計データを生成する計算ロジックの二重持ち（コピペ）を排除する。

export type SettlementPaymentLike = {
  grossAmount: number;
  ownerAmount: number;
  agentAmount: number | null;
  platformAmount: number;
};

export type SettlementAmounts = {
  paymentCount: number;
  totalGrossAmount: number;
  totalNetAmount: number;
  totalTaxAmount: number;
  platformFeeNet: number;
  platformFeeTax: number;
  platformFeeGross: number;
  ownerPayoutAmount: number;
  totalOwnerAmount: number;
  totalAgentAmount: number;
  totalPlatformAmount: number;
  finalOwnerPayoutAmount: number;
  finalAgentPayoutAmount: number;
};

// 消費税率 10%（税込→税抜は ÷1.1）
const TAX_DIVISOR = 1.1;

export function computeSettlementAmounts(
  payments: SettlementPaymentLike[]
): SettlementAmounts {
  const totalGrossAmount = payments.reduce((s, p) => s + p.grossAmount, 0);
  const totalOwnerAmount = payments.reduce((s, p) => s + p.ownerAmount, 0);
  const totalAgentAmount = payments.reduce((s, p) => s + (p.agentAmount ?? 0), 0);
  const totalPlatformAmount = payments.reduce((s, p) => s + p.platformAmount, 0);

  // 税抜/消費税の内訳（売上総額ベース。料率非依存の表示用）
  const totalNetAmount = Math.floor(totalGrossAmount / TAX_DIVISOR);
  const totalTaxAmount = totalGrossAmount - totalNetAmount;

  // プラットフォーム手数料 = Payment 集計の platform 実額（料率準拠）
  const platformFeeGross = totalPlatformAmount;
  const platformFeeNet = Math.floor(platformFeeGross / TAX_DIVISOR);
  const platformFeeTax = platformFeeGross - platformFeeNet;

  // オーナー純額 = Payment 集計の owner 実額（料率準拠）。100%プラットフォームなら 0、
  // owner80/agent10/platform10 なら gross×80% 等、スナップショットに一致。
  const ownerPayoutAmount = totalOwnerAmount;

  return {
    paymentCount: payments.length,
    totalGrossAmount,
    totalNetAmount,
    totalTaxAmount,
    platformFeeNet,
    platformFeeTax,
    platformFeeGross,
    ownerPayoutAmount,
    totalOwnerAmount,
    totalAgentAmount,
    totalPlatformAmount,
    finalOwnerPayoutAmount: ownerPayoutAmount,
    finalAgentPayoutAmount: totalAgentAmount,
  };
}
