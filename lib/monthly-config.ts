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

// イベント日のプラン2予約の締切（イベント日の何日前まで）。
// 締切を過ぎて未予約の月極区画は一般予約へ自動開放する。
export const MONTHLY_EVENT_DEADLINE_DAYS = 14;

// event-monthly 承認待ちの受付／月極の回答 締切（イベント日の何日前まで）。
// 「満車時点〜開催◯日前まで」承認待ちを受け付け、月極の回答期限も同じ。
export const MONTHLY_EVENT_OFFER_DEADLINE_DAYS = 3;

// 拠点別の月極ポリシー。料金とイベント二次流通の有無は区画モードでは表せないため拠点configで持つ。
export type MonthlyPlacePolicy = { feeYen: number; hasEventOffer: boolean };
export const MONTHLY_PLACE_POLICIES: Record<string, MonthlyPlacePolicy> = {
  "rifu-main":             { feeYen: 3300, hasEventOffer: true },
  "siogama-isidou-honnbu": { feeYen: 8000, hasEventOffer: false },
};

export function isMonthlyPlace(slug: string): boolean {
  return slug in MONTHLY_PLACE_POLICIES;
}
export function getMonthlyPolicy(slug: string): MonthlyPlacePolicy | null {
  return MONTHLY_PLACE_POLICIES[slug] ?? null;
}
export function getMonthlyFee(slug: string): number | null {
  return MONTHLY_PLACE_POLICIES[slug]?.feeYen ?? null;
}

// place の月極区画を特定する Prisma where 断片。
// 新方式＝区画モード MONTHLY。利府のみ旧方式（コード配列 A-17〜A-20）も併用（ブリッジ）。
export function monthlySpotWhere(placeSlug: string) {
  const or: Array<Record<string, unknown>> = [{ operationModeOverride: "MONTHLY" }];
  if (placeSlug === MONTHLY_PLACE_SLUG) {
    or.push({ code: { in: [...MONTHLY_SLOT_CODES] } });
  }
  return { OR: or };
}
