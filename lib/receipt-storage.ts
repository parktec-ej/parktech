import { supabase } from "@/lib/supabase";

export async function uploadReceiptPdf(
  buffer: Buffer,
  fileName: string
) {
  const filePath = `receipts/${new Date().toISOString().slice(0, 7)}/${fileName}`;

  const { error } = await supabase.storage
    .from("receipts")
    .upload(filePath, buffer, {
      contentType: "application/pdf",
      upsert: true,
    });

  if (error) {
    console.error("Storage upload error:", error);
    throw error;
  }

  return filePath;
}