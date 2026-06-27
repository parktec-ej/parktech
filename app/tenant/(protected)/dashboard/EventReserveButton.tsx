"use client";

import { useState } from "react";

export default function EventReserveButton({ date }: { date: string }) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  async function onClick() {
    setErr("");
    setLoading(true);
    try {
      const res = await fetch("/api/tenant/event-reservation/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date }),
      });
      const json = await res.json().catch(() => ({ ok: false }));
      if (!res.ok || !json.ok || !json.url) {
        setErr(json.message || "予約手続きを開始できませんでした");
        return;
      }
      window.location.href = json.url;
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
      <button
        type="button"
        onClick={onClick}
        disabled={loading}
        style={{
          fontSize: 13,
          color: "#fff",
          background: "#111",
          padding: "6px 12px",
          borderRadius: 6,
          border: "none",
          cursor: loading ? "not-allowed" : "pointer",
          opacity: loading ? 0.6 : 1,
          whiteSpace: "nowrap",
        }}
      >
        {loading ? "処理中..." : "このイベント日に予約する"}
      </button>
      {err ? <span style={{ fontSize: 11, color: "#b91c1c" }}>{err}</span> : null}
    </span>
  );
}
