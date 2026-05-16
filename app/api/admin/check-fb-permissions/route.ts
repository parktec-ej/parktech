export const runtime = "nodejs";
export const preferredRegion = "hnd1";

import { NextResponse } from "next/server";

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
    return NextResponse.json({ ok: false, error: "FACEBOOK_PAGE_ACCESS_TOKEN not set" });
  }

  const res = await fetch(
    `https://graph.facebook.com/debug_token?input_token=${token}&access_token=${token}`
  );
  const data = await res.json() as {
    data?: {
      is_valid?: boolean;
      type?: string;
      expires_at?: number;
      scopes?: string[];
    };
    error?: { message: string };
  };

  if (data.error) {
    return NextResponse.json({ ok: false, error: data.error.message });
  }

  const granted = data.data?.scopes ?? [];
  const required = ["pages_manage_posts", "pages_read_engagement", "pages_show_list"];
  const missing = required.filter(p => !granted.includes(p));

  return NextResponse.json({
    ok: missing.length === 0,
    type: data.data?.type,
    isValid: data.data?.is_valid,
    expiresAt: data.data?.expires_at,
    granted,
    missing,
    allRequired: missing.length === 0 ? "✅ 全権限あり" : `❌ 不足: ${missing.join(", ")}`,
  });
}
