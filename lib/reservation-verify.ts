import { prisma } from "@/lib/db";
import { isPlaceholderPlate, normalizePlate, toHalfWidth } from "@/lib/plate";

// 既存の import 元を変えずに済むよう、ナンバー系のユーティリティはここからも公開する。
export { isPlaceholderPlate, normalizePlate };

/**
 * メールアドレスに依存しない本人確認。
 * 予約日 + PIN + ナンバー（+ 電話番号）で照合し、成功したら既存の cancelToken を返す。
 *
 * 電話番号は予約に入っている場合のみ照合する。既存予約の約1/4は phone が空で、
 * 一律必須にするとその持ち主が導線に入れなくなるため。
 */

/** 電話番号は数字のみで比較する（090-1234-5678 と 09012345678 を同一視） */
export function normalizePhone(value: string | null | undefined) {
  return toHalfWidth(String(value ?? "")).replace(/\D/g, "");
}

export type VerifyInput = {
  date: string;
  pin: string;
  plate: string;
  phone?: string | null;
};

export type VerifyCandidate = {
  id: string;
  date: string;
  plate: string;
  phone: string | null;
  cancelToken: string | null;
};

export type VerifyOutcome =
  | { ok: true; reservationId: string; cancelToken: string }
  | { ok: false; reason: "not_found" | "ambiguous" | "unsupported_plate" | "no_token" };

/**
 * 候補群から入力に一致する予約を選ぶ。DBに触らないので単体で確認できる。
 *
 * - ナンバーは正規化して比較する
 * - 予約に phone が入っていれば phone も一致必須（4点照合）
 * - phone が空の予約は phone を照合しない（3点照合）
 * - 1件に絞れなければ失敗（別人の予約を開かせないため）
 */
export function matchCandidates(
  candidates: VerifyCandidate[],
  input: VerifyInput
): VerifyOutcome {
  const inputPlate = normalizePlate(input.plate);
  const inputPhone = normalizePhone(input.phone);

  if (!inputPlate) {
    return { ok: false, reason: "not_found" };
  }

  const matched: VerifyCandidate[] = [];

  for (const candidate of candidates) {
    // ナンバーが実質未登録の予約は本人確認が成立しないので除外する
    if (isPlaceholderPlate(candidate.plate)) continue;

    if (normalizePlate(candidate.plate) !== inputPlate) continue;

    const candidatePhone = normalizePhone(candidate.phone);

    if (candidatePhone) {
      if (!inputPhone || candidatePhone !== inputPhone) continue;
    }

    matched.push(candidate);
  }

  if (matched.length === 0) return { ok: false, reason: "not_found" };
  // 1件に絞れないときは失敗扱い。呼び出し側は not_found と同じ文言を返すこと。
  if (matched.length > 1) return { ok: false, reason: "ambiguous" };

  const hit = matched[0];

  if (!hit.cancelToken) return { ok: false, reason: "no_token" };

  return { ok: true, reservationId: hit.id, cancelToken: hit.cancelToken };
}

/** 入力されたナンバーがプレースホルダそのものなら、照合するまでもなく対象外 */
export function isUnsupportedInputPlate(plate: string) {
  return isPlaceholderPlate(plate);
}

function todayJst() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}

/**
 * 予約日とPINで候補を引き、ナンバー（と電話番号）で1件に絞る。
 * 対象は今後の CONFIRMED 予約のみ。
 */
export async function findVerifiedReservation(
  input: VerifyInput
): Promise<VerifyOutcome> {
  if (isUnsupportedInputPlate(input.plate)) {
    return { ok: false, reason: "unsupported_plate" };
  }

  const candidates = await prisma.reservation.findMany({
    where: {
      date: input.date,
      pin: input.pin,
      status: "CONFIRMED",
      // 過去の予約は変更できないので候補に含めない
      ...(input.date >= todayJst() ? {} : { id: "__none__" }),
    },
    select: {
      id: true,
      date: true,
      plate: true,
      phone: true,
      cancelToken: true,
    },
    take: 50,
  });

  return matchCandidates(candidates, input);
}
