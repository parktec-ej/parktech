export const runtime = "nodejs";
export const preferredRegion = "hnd1";

import { NextResponse } from "next/server";

export async function GET() {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "(unset)";
  const trimmed = raw.trim();
  const out: Record<string, unknown> = {
    rawJson: JSON.stringify(raw),       // 改行や空白が見えるようJSON文字列化
    trimmedJson: JSON.stringify(trimmed),
    rawLength: raw.length,
    trimmedLength: trimmed.length,
  };

  try {
    const r = await fetch(`${trimmed}/auth/v1/health`, { method: "GET" });
    out.authHealth = { ok: r.ok, status: r.status };
  } catch (e) {
    out.authHealth = { error: e instanceof Error ? e.message : String(e) };
  }

  return NextResponse.json(out);
}
