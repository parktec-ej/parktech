/**
 * 携帯キャリアメールのドメイン判定。
 * フォームの警告表示・予約完了画面・管理画面バッジで共通利用する。
 */

const CARRIER_DOMAINS: Record<string, string> = {
  "ezweb.ne.jp": "au",
  "au.com": "au",
  "ido.ne.jp": "au",
  "docomo.ne.jp": "docomo",
  "softbank.ne.jp": "SoftBank",
  "i.softbank.jp": "SoftBank",
  "vodafone.ne.jp": "SoftBank",
  "disney.ne.jp": "SoftBank",
  "yahoo.ne.jp": "Y!mobile",
  "ymobile.ne.jp": "Y!mobile",
  "rakumail.jp": "楽天モバイル",
};

/**
 * キャリアメールなら通信事業者名を返す。それ以外は null。
 * @example getCarrierName("foo@ezweb.ne.jp") // => "au"
 * @example getCarrierName("foo@gmail.com")   // => null
 */
export function getCarrierName(email: string | null | undefined): string | null {
  if (!email) return null;
  const domain = email.split("@")[1]?.trim().toLowerCase().replace(/\.$/, "");
  if (!domain) return null;
  return CARRIER_DOMAINS[domain] ?? null;
}

/** キャリアメールかどうかの真偽値だけが必要な場合 */
export function isCarrierMail(email: string | null | undefined): boolean {
  return getCarrierName(email) !== null;
}
