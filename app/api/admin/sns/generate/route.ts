export const runtime = "nodejs";
export const preferredRegion = "hnd1";

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-auth";
import {
  generateBroadcastCaption,
  type BroadcastTone,
  type BroadcastLength,
} from "@/lib/claude-broadcast-text";

export async function POST(req: Request) {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const brief = typeof body?.brief === "string" ? body.brief.trim() : "";
    const tone: BroadcastTone = body?.tone === "casual" ? "casual" : "polite";
    const length: BroadcastLength = body?.length === "long" ? "long" : "short";

    if (!brief) {
      return NextResponse.json(
        { ok: false, error: "brief_required", message: "ブリーフ（投稿の要点）を入力してください" },
        { status: 400 }
      );
    }

    const caption = await generateBroadcastCaption(brief, { tone, length });

    if (!caption) {
      return NextResponse.json(
        { ok: false, error: "empty_result", message: "キャプションが生成できませんでした" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, caption });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: "server_error", message }, { status: 500 });
  }
}
