"use client";

import { useEffect, useState } from "react";

function normalizeSlot(input: string) {
  const m = (input || "").match(/^S(\d{1,2})$/i);
  if (!m) return input || "";
  return `S${String(Number(m[1])).padStart(2, "0")}`;
}

function ymdTodayJst() {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}

export default function CheckoutPage() {
  const [slot, setSlot] = useState("");
  const [date, setDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setSlot(normalizeSlot(params.get("slot") ?? ""));
    setDate(params.get("date") ?? ymdTodayJst());
  }, []);

  async function submit() {
    setErr("");
    setMsg("");

    if (!slot) {
      setErr("slot が見つかりません");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, slot }),
      });
      const json = await res.json();

      if (json.ok) {
        setMsg("出庫処理が完了しました。");
      } else {
        setErr(json.message ?? json.error ?? "エラーが発生しました");
      }
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 520, margin: "0 auto", padding: 24 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800 }}>チェックアウト</h1>

      <div style={{ marginTop: 10, padding: 12, border: "1px solid #eee", borderRadius: 12 }}>
        <div style={{ fontWeight: 700 }}>区画: {slot || "（不明）"}</div>
        <div style={{ marginTop: 6, fontSize: 12, color: "#666" }}>
          日付: {date || "読込中"}
        </div>
      </div>

      <button
        onClick={submit}
        disabled={loading}
        style={{
          width: "100%",
          marginTop: 16,
          padding: 12,
          borderRadius: 12,
          border: "1px solid #ddd",
          cursor: "pointer",
          fontWeight: 800,
        }}
      >
        {loading ? "処理中..." : "出庫する"}
      </button>

      {msg ? <div style={{ marginTop: 12, color: "green", fontWeight: 700 }}>{msg}</div> : null}
      {err ? <div style={{ marginTop: 12, color: "crimson", fontWeight: 700 }}>{err}</div> : null}
    </div>
  );
}