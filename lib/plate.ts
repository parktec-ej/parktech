/**
 * 車両ナンバーの正規化と「実質未登録」判定。
 *
 * DBに触らない純粋な処理としてここに置く。
 * 本人確認（lib/reservation-verify.ts）とメール文面（lib/mail.ts）の両方から使うため、
 * どちらか一方に置くと不要な依存が生まれる。
 */

/** ナンバーとして意味を成さない値。これらは本人確認の材料にならないので照会導線の対象外にする。 */
export const PLACEHOLDER_PLATES = new Set(["未登録", "未定", "なし", "不明", "-", ""]);

/** 全角英数を半角に落とす（ナンバーの「３００」と「300」を同一視するため。電話番号でも使う） */
export function toHalfWidth(value: string) {
  return value.replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) =>
    String.fromCharCode(c.charCodeAt(0) - 0xfee0)
  );
}

/**
 * ナンバーの表記ゆれを吸収する。
 * 実データには「秋田330 ひ　5600」「長野301　た　7726」「仙台502ワ4045」のように
 * 全角スペース・半角スペース・スペース無しが混在している。
 */
export function normalizePlate(value: string | null | undefined) {
  return toHalfWidth(String(value ?? ""))
    .replace(/[\s　]/g, "")
    .replace(/[-－ー‐-‒–—―]/g, "")
    .toUpperCase();
}

/** ナンバーが実質未登録かどうか。true の予約は照会導線では扱わない。 */
export function isPlaceholderPlate(value: string | null | undefined) {
  const normalized = normalizePlate(value);
  if (!normalized) return true;
  // 正規化するとスペースが消えるので、元の値でも照合しておく
  if (PLACEHOLDER_PLATES.has(String(value ?? "").trim())) return true;
  return PLACEHOLDER_PLATES.has(normalized);
}
