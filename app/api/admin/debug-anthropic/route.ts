export const runtime = "nodejs";
export const preferredRegion = "hnd1";

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-auth";

/**
 * 一時的な診断エンドポイント。
 *
 * 用途: ANTHROPIC_API_KEY が `401 invalid x-api-key` を返している原因を
 * 「キー値そのものに前後の改行/空白/クオートが混入している」のか
 * 「キー値自体が間違っている」のか切り分けるためのもの。
 *
 * 完全な値は決して返さない（先頭10文字＋末尾4文字のみ）。
 * 診断が終わったら必ず削除すること。
 */
export async function GET() {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 }
    );
  }

  const raw = process.env.ANTHROPIC_API_KEY;
  if (raw == null) {
    return NextResponse.json({
      ok: false,
      error: "env_not_set",
      message: "process.env.ANTHROPIC_API_KEY is undefined",
    });
  }

  const trimmed = raw.trim();
  const hasLeadingWhitespace = raw.length > 0 && /\s/.test(raw[0]);
  const hasTrailingWhitespace =
    raw.length > 0 && /\s/.test(raw[raw.length - 1]);
  const hasNewline = /[\r\n]/.test(raw);
  const hasNullByte = raw.includes("\0");
  const isQuotedDouble = trimmed.startsWith('"') && trimmed.endsWith('"');
  const isQuotedSingle = trimmed.startsWith("'") && trimmed.endsWith("'");
  const startsWithExpectedPrefix = trimmed.startsWith("sk-ant-api03-");

  const safePreview =
    trimmed.length >= 14
      ? `${trimmed.slice(0, 10)}...${trimmed.slice(-4)}`
      : "(too short to preview)";

  // Inspect first/last 4 char codes to surface invisible chars
  const charCodesFirst = Array.from(raw.slice(0, 4)).map((c) => c.charCodeAt(0));
  const charCodesLast = Array.from(raw.slice(-4)).map((c) => c.charCodeAt(0));

  return NextResponse.json({
    ok: true,
    preview: safePreview,
    rawLength: raw.length,
    trimmedLength: trimmed.length,
    startsWithExpectedPrefix,
    hasLeadingWhitespace,
    hasTrailingWhitespace,
    hasNewline,
    hasNullByte,
    isQuotedDouble,
    isQuotedSingle,
    charCodesFirst,
    charCodesLast,
    note:
      "Inspect rawLength vs trimmedLength: if different, env var has surrounding whitespace. Check charCodesFirst/Last (32=space, 10=LF, 13=CR, 34=\", 39=').",
  });
}
