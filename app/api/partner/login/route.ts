import { NextResponse } from "next/server";
import {
  createPartnerSession,
  verifyPartnerCredentials,
} from "@/lib/partner-auth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);

    if (!body) {
      return NextResponse.json(
        { ok: false, error: "invalid_json", message: "JSONが不正です。" },
        { status: 400 }
      );
    }

    const loginId = String(body.loginId ?? "").trim();
    const password = String(body.password ?? "").trim();

    if (!loginId || !password) {
      return NextResponse.json(
        {
          ok: false,
          error: "missing_credentials",
          message: "ログインIDとパスワードを入力してください。",
        },
        { status: 400 }
      );
    }

    const ok = verifyPartnerCredentials(loginId, password);

    if (!ok) {
      return NextResponse.json(
        {
          ok: false,
          error: "invalid_credentials",
          message: "ログインIDまたはパスワードが違います。",
        },
        { status: 401 }
      );
    }

    const session = await createPartnerSession(loginId);

    return NextResponse.json({
      ok: true,
      session: {
        loginId: session.loginId,
        expiresAt: session.expiresAt,
      },
    });
  } catch (e: any) {
    console.error("[partner/login] error:", e);

    return NextResponse.json(
      {
        ok: false,
        error: "server_error",
        message: String(e?.message ?? e),
      },
      { status: 500 }
    );
  }
}