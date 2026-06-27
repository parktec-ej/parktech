"use client";

import { useState } from "react";

export default function EventDeclineButton({ date }: { date: string }) {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");

  async function onClick() {
    if (
      !window.confirm(
        `${date} のイベント日を「利用しない」にしますか？区画は一般のお客様に開放されます。`
      )
    )
      return;
    setErr("");
    setLoading(true);
    try {
      const res = await fetch("/api/tenant/event-reservation/decline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date }),
      });
      const json = await res.json().catch(() => ({ ok: false }));
      if (!res.ok || !json.ok) {
        setErr(json.message || "手続きに失敗しました");
        return;
      }
      setDone(true);
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return <span style={{ fontSize: 13, color: "#15803d" }}>利用しない（受付済み）</span>;
  }

  return (
    <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
      <button
        type="button"
        onClick={onClick}
        disabled={loading}
        style={{
          fontSize: 13,
          color: "#111",
          background: "#fff",
          padding: "6px 12px",
          borderRadius: 6,
          border: "1px solid #111",
          cursor: loading ? "not-allowed" : "pointer",
          opacity: loading ? 0.6 : 1,
          whiteSpace: "nowrap",
        }}
      >
        {loading ? "処理中..." : "利用しない"}
      </button>
      {err ? <span style={{ fontSize: 11, color: "#b91c1c" }}>{err}</span> : null}
    </span>
  );
}
