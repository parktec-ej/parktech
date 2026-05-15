export const runtime = "nodejs";
export const preferredRegion = "hnd1";

import { NextResponse } from "next/server";
import { sendSlackAlert } from "@/lib/slack";

function isAuthorized(req: Request): boolean {
  const header = req.headers.get("authorization") ?? "";
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return header === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const token = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
  if (!token) {
    await sendSlackAlert("⚠️ [FB Token] FACEBOOK_PAGE_ACCESS_TOKEN が未設定です");
    return NextResponse.json({ ok: false, error: "token not set" });
  }

  try {
    // Graph API でトークンの有効期限を確認（Page Token 自身で debug）
    const res = await fetch(
      `https://graph.facebook.com/debug_token?input_token=${token}&access_token=${token}`
    );
    const data = await res.json() as {
      data?: {
        expires_at?: number;
        is_valid?: boolean;
        error?: { message: string };
      };
      error?: { message: string };
    };

    if (data.error || data.data?.error) {
      const msg = data.error?.message ?? data.data?.error?.message ?? "unknown";
      await sendSlackAlert(`🔴 [FB Token] トークン確認エラー: ${msg}`);
      return NextResponse.json({ ok: false, error: msg });
    }

    const expiresAt = data.data?.expires_at;
    const isValid = data.data?.is_valid;

    if (!isValid) {
      await sendSlackAlert("🔴 [FB Token] Facebookアクセストークンが無効です！今すぐ更新してください");
      return NextResponse.json({ ok: false, status: "invalid" });
    }

    if (!expiresAt) {
      // 期限なし（長期トークンが正しく設定されている）
      return NextResponse.json({ ok: true, status: "no_expiry" });
    }

    const now = Math.floor(Date.now() / 1000);
    const daysLeft = Math.floor((expiresAt - now) / 86400);

    if (daysLeft <= 7) {
      await sendSlackAlert(`🔴 [FB Token] Facebookトークンの期限まで残り${daysLeft}日です！今すぐ更新してください\n更新手順: https://developers.facebook.com/tools/explorer/`);
    } else if (daysLeft <= 14) {
      await sendSlackAlert(`⚠️ [FB Token] Facebookトークンの期限まで残り${daysLeft}日です。そろそろ更新してください`);
    } else if (daysLeft <= 30) {
      await sendSlackAlert(`📅 [FB Token] Facebookトークンの期限まで残り${daysLeft}日です`);
    }

    return NextResponse.json({ ok: true, daysLeft, expiresAt });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await sendSlackAlert(`⚠️ [FB Token] チェック失敗: ${msg}`);
    return NextResponse.json({ ok: false, error: msg });
  }
}
