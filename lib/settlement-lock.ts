// 税務要件: 締めた（settlement済みの）Payment は行不変とする。
// 締め時に settlementLock="LOCKED" かつ status="SETTLED" がセットされるため、
// どちらか一方でも立っていれば「ロック済み」とみなす（安全側の OR 判定）。
export function isPaymentLocked(p: {
  settlementLock?: string | null;
  status?: string | null;
}): boolean {
  return p.settlementLock === "LOCKED" || p.status === "SETTLED";
}
