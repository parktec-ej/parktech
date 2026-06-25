export const runtime = "nodejs";
export const preferredRegion = "hnd1";

import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getAdminSession } from "@/lib/admin-auth";

const BUCKET = "sns-media";
const MAX_BYTES = 8 * 1024 * 1024; // 8MB（Instagram要件）
const ALLOWED: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
};

export async function POST(req: Request) {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const form = await req.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { ok: false, error: "file_required", message: "画像ファイルを選択してください" },
        { status: 400 }
      );
    }

    const ext = ALLOWED[file.type];
    if (!ext) {
      return NextResponse.json(
        { ok: false, error: "invalid_type", message: "JPEG または PNG のみアップロードできます" },
        { status: 400 }
      );
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { ok: false, error: "too_large", message: "画像は8MBまでです" },
        { status: 400 }
      );
    }

    const path = `uploads/${randomUUID()}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const projectUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
    const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();

    // 新方式キー(sb_secret_...)はそのまま、旧JWT(eyJ...)は Bearer で渡す
    const authHeader = serviceKey.startsWith("eyJ")
      ? `Bearer ${serviceKey}`
      : serviceKey;

    const uploadRes = await fetch(
      `${projectUrl}/storage/v1/object/${BUCKET}/${path}`,
      {
        method: "POST",
        headers: {
          apikey: serviceKey,
          Authorization: authHeader,
          "Content-Type": file.type,
          "x-upsert": "false",
        },
        body: buffer,
      }
    );

    if (!uploadRes.ok) {
      const detail = await uploadRes.text().catch(() => "");
      return NextResponse.json(
        {
          ok: false,
          error: "upload_failed",
          message: `storage ${uploadRes.status}: ${detail.slice(0, 300)}`,
        },
        { status: 500 }
      );
    }

    const publicUrl = `${projectUrl}/storage/v1/object/public/${BUCKET}/${path}`;

    return NextResponse.json({ ok: true, url: publicUrl });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: "server_error", message }, { status: 500 });
  }
}
