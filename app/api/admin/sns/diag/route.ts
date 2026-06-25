export const runtime = "nodejs";
export const preferredRegion = "hnd1";

import { NextResponse } from "next/server";

export async function GET() {
  const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "(unset)";
  const out: Record<string, unknown> = { projectUrl };

  // 1) Supabase auth health（認証不要・到達性のみ確認）
  try {
    const r = await fetch(`${projectUrl}/auth/v1/health`, { method: "GET" });
    out.authHealth = { ok: r.ok, status: r.status, body: (await r.text()).slice(0, 120) };
  } catch (e) {
    out.authHealth = { error: e instanceof Error ? e.message : String(e) };
  }

  // 2) 全く別ドメインへの到達性（Vercelのegress自体が生きているか）
  try {
    const r = await fetch("https://example.com", { method: "GET" });
    out.example = { ok: r.ok, status: r.status };
  } catch (e) {
    out.example = { error: e instanceof Error ? e.message : String(e) };
  }

  return NextResponse.json(out);
}
