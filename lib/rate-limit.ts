import crypto from "crypto";
import { prisma } from "@/lib/db";

/**
 * 予約照会の総当たり対策。
 * Vercel は複数インスタンスで動くため、インメモリのカウンタでは
 * インスタンスごとに別集計になり実質無効になる。DBに試行を記録して数える。
 */

/** 同一IPの失敗をこの件数まで許す */
const MAX_FAILURES = 5;
/** 失敗を数える時間窓（分） */
const WINDOW_MINUTES = 15;
/** 試行記録の保持期間（日）。cron で掃除する。 */
export const ATTEMPT_RETENTION_DAYS = 30;

/**
 * 生IPは保存しない。
 * scope を変えると別カウンタになる。入口の照会（verify）で失敗が続いた人が、
 * manage 内の操作（selfupdate）まで巻き添えでロックされるのを避けるため。
 */
export function hashIp(ip: string, scope: "verify" | "selfupdate" = "verify") {
  return crypto.createHash("sha256").update(`${scope}:${ip}`).digest("hex");
}

export function getClientIp(req: Request) {
  const forwarded = req.headers.get("x-forwarded-for") ?? "";
  const first = forwarded.split(",")[0]?.trim();
  if (first) return first;
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

export type RateLimitResult = {
  allowed: boolean;
  failureCount: number;
  retryAfterSeconds: number;
};

/** 直近の時間窓での失敗回数を数える。上限に達していたら allowed=false。 */
export async function checkVerificationRateLimit(
  ipHash: string
): Promise<RateLimitResult> {
  const since = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000);

  const failures = await prisma.verificationAttempt.findMany({
    where: {
      ipHash,
      succeeded: false,
      createdAt: { gte: since },
    },
    select: { createdAt: true },
    orderBy: { createdAt: "asc" },
    take: MAX_FAILURES + 1,
  });

  if (failures.length < MAX_FAILURES) {
    return {
      allowed: true,
      failureCount: failures.length,
      retryAfterSeconds: 0,
    };
  }

  // 最も古い失敗が窓から外れるまで待たせる
  const oldest = failures[0].createdAt.getTime();
  const unblockAt = oldest + WINDOW_MINUTES * 60 * 1000;
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((unblockAt - Date.now()) / 1000)
  );

  return { allowed: false, failureCount: failures.length, retryAfterSeconds };
}

export async function recordVerificationAttempt(
  ipHash: string,
  succeeded: boolean
) {
  await prisma.verificationAttempt.create({
    data: {
      id: crypto.randomUUID(),
      ipHash,
      succeeded,
    },
  });
}

/** 保持期間を過ぎた試行記録を削除する。戻り値は削除件数。 */
export async function cleanupVerificationAttempts() {
  const cutoff = new Date(
    Date.now() - ATTEMPT_RETENTION_DAYS * 24 * 60 * 60 * 1000
  );

  const result = await prisma.verificationAttempt.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });

  return result.count;
}
