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
  const token = process.env.FACEBOOK_PAGE_ACCESS_TOKEN ?? "";
  const envPageId = process.env.FACEBOOK_PAGE_ID ?? "";
  const me = await fetch(
    `https://graph.facebook.com/v19.0/me?fields=id,name,instagram_business_account&access_token=${token}`
  ).then(r => r.json()) as {
    id?: string;
    name?: string;
    instagram_business_account?: { id?: string };
    error?: { message: string };
  };

  return NextResponse.json({
    envPageId,
    tokenPageId: me.id,
    name: me.name,
    match: envPageId === me.id,
    igAccountId: me.instagram_business_account?.id ?? null,
    igLinked: !!me.instagram_business_account?.id,
    error: me.error?.message ?? null,
  });
}
