// 月極駐車場の共通設定。申込API・空き枠API・管理画面・cron で共有する。
export const MONTHLY_PLACE_SLUG = "rifu-main";

// 月極で専有する4区画（rifu-main の Spot.code）。
// A-20 は旧バス追加普通車共用枠だが、月極専有へ移行（バス共用は別途③で廃止）。
export const MONTHLY_SLOT_CODES = ["A-17", "A-18", "A-19", "A-20"] as const;
export type MonthlySlotCode = (typeof MONTHLY_SLOT_CODES)[number];

// この状態の契約は区画を「進行中」として専有する（解約・却下は枠を解放）。
export const OCCUPYING_STATUSES = [
  "PENDING",
  "AWAITING_PAYMENT",
  "ACTIVE",
  "PAST_DUE",
] as const;
