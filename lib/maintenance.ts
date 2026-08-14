import { MONTHLY_PLACE_SLUG } from "@/lib/monthly-config";

// 利府グランディー前（rifu-main）の新規予約だけを一時停止するためのフラグ。
// 環境変数 RESERVATION_MAINTENANCE === "1" かつ対象 place のときだけ true。
// 石堂の時間貸し・ゲート入出庫・既存予約の管理・webhook・月極ポータルには影響しない。
export function isReservationMaintenance(placeSlug: string): boolean {
  return (
    process.env.RESERVATION_MAINTENANCE === "1" &&
    placeSlug === MONTHLY_PLACE_SLUG
  );
}
