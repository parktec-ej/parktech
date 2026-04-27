"use client";

import { useEffect, useMemo, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import QRCode from "qrcode";

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "http://localhost:3000";

function QrContent() {
  const searchParams = useSearchParams();
  const place = searchParams.get("place") ?? "";
  const slot = searchParams.get("slot") ?? "";

  const checkinUrl = useMemo(() => {
    if (!place || !slot) return "";
    return `${APP_URL}/gate?placeId=${encodeURIComponent(place)}&slot=${encodeURIComponent(slot)}`;
  }, [place, slot]);

  const [dataUrl, setDataUrl] = useState("");

  useEffect(() => {
    if (!checkinUrl) return;
    let cancelled = false;
    QRCode.toDataURL(checkinUrl, { margin: 1, width: 256 }).then((png) => {
      if (!cancelled) setDataUrl(png);
    });
    return () => {
      cancelled = true;
    };
  }, [checkinUrl]);

  if (!place || !slot) {
    return (
      <div style={{ padding: 24, color: "#b91c1c" }}>
        URLに <code>place</code> と <code>slot</code> パラメータが必要です。
        <br />
        例: <code>/admin/qr?place=rifu-main&slot=A-01</code>
      </div>
    );
  }

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 16 }}>
        区画QR生成
      </h1>

      <div style={{ marginBottom: 12 }}>
        <button
          onClick={() => window.print()}
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid #ddd",
            cursor: "pointer",
          }}
        >
          印刷する
        </button>
      </div>

      <div
        style={{
          display: "inline-block",
          border: "1px solid #e5e5e5",
          borderRadius: 14,
          padding: 20,
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 800 }}>
          {place} / 区画 {slot}
        </div>
        <div style={{ fontSize: 12, color: "#666", marginTop: 6, wordBreak: "break-all" }}>
          {checkinUrl}
        </div>

        <div style={{ marginTop: 12 }}>
          {dataUrl ? (
            <img src={dataUrl} alt={`${place}-${slot}`} style={{ width: 220, height: 220 }} />
          ) : (
            <div>生成中...</div>
          )}
        </div>

        <div style={{ marginTop: 10, fontSize: 12, color: "#666" }}>
          ※これを印刷して現地に貼ればOK
        </div>
      </div>

      <style jsx global>{`
        @media print {
          button {
            display: none !important;
          }
          body {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }
      `}</style>
    </div>
  );
}

export default function AdminQrPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24 }}>読み込み中...</div>}>
      <QrContent />
    </Suspense>
  );
}
