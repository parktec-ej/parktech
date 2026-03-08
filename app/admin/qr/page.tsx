"use client";

import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";

const SLOTS = ["S01", "S02", "S03", "S04", "S05"]; // 必要数に合わせて増やす

function getBaseUrl() {
  // ローカルは固定でOK。将来本番は env に置き換え。
  return typeof window === "undefined" ? "" : window.location.origin;
}

export default function AdminQrPage() {
  const baseUrl = useMemo(() => getBaseUrl(), []);
  const [dataUrls, setDataUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const next: Record<string, string> = {};
      for (const slot of SLOTS) {
        const url = `${baseUrl}/checkin?slot=${encodeURIComponent(slot)}`;
        const png = await QRCode.toDataURL(url, { margin: 1, width: 256 });
        next[slot] = png;
      }
      if (!cancelled) setDataUrls(next);
    }

    if (baseUrl) run();
    return () => {
      cancelled = true;
    };
  }, [baseUrl]);

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 20, fontWeight: 800 }}>区画QR 一括生成</h1>

      <div style={{ margin: "12px 0" }}>
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
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 16,
        }}
      >
        {SLOTS.map((slot) => {
          const img = dataUrls[slot];
          const url = `${baseUrl}/checkin?slot=${encodeURIComponent(slot)}`;
          return (
            <div
              key={slot}
              style={{
                border: "1px solid #e5e5e5",
                borderRadius: 14,
                padding: 16,
              }}
            >
              <div style={{ fontSize: 18, fontWeight: 800 }}>区画 {slot}</div>
              <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>{url}</div>

              <div style={{ marginTop: 12 }}>
                {img ? (
                  <img src={img} alt={slot} style={{ width: 220, height: 220 }} />
                ) : (
                  <div>生成中...</div>
                )}
              </div>

              <div style={{ marginTop: 10, fontSize: 12, color: "#666" }}>
                ※これを印刷して現地に貼ればOK
              </div>
            </div>
          );
        })}
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