export const runtime = "nodejs";
export const preferredRegion = "hnd1";

import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getAdminSession } from "@/lib/admin-auth";
import { supabase } from "@/lib/supabase";

const BUCKET = "sns-media";
const MAX_BYTES = 8 * 1024 * 1024; // 8MB（Instagram要件）
const ALLOWED: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
};

async function ensureBucket() {
  // 既に存在すれば "already exists" 系エラーになるので無視する
  const { error } = await supabase.storage.createBucket(BUCKET, {
    public: true,
  });
  if (error && !/exist/i.test(error.message)) {
    throw new Error(`createBucket failed: ${error.message}`);
  }
}

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

    await ensureBucket();

    const path = `uploads/${randomUUID()}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json(
        { ok: false, error: "upload_failed", message: uploadError.message },
        { status: 500 }
      );
    }

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);

    return NextResponse.json({ ok: true, url: data.publicUrl });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: "server_error", message }, { status: 500 });
  }
}
