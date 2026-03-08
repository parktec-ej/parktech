"use client";

import { useMemo, useState } from "react";

function normalizeSlot(input: string) {
  const m = (input || "").match(/^S(\d{1,2})$/i);
  if (!m) return input;
  return `S${String(Number(m[1])).padStart(2, "0")}`;
}

function ymdTodayJst() {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}

export default function CheckoutPage() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const slot = normalizeSlot(params.get("slot") ?? "");
  const dateDefault = params.get("date") ?? ymdTodayJst();

  const [date, setDate] = useState(dateDefault);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  async function submit() {
    setErr("");
    setMsg("");
    if (!slot) {
      setErr("slot が見つかりません（QRが不正です）");
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
        setMsg("出庫処理が完了しました。お気をつけてお帰りください。");
      } else {
        if (json.error === "no_reservation") {
          setErr("予約がありません。精算（現地決済）へ進んでください。");
        } else if (json.error === "not_checked_in") {
          setErr("チェックインが完了していません。入口QRから手続きをしてください。");
        } else {
          setErr(json.message ?? "エラーが発生しました");
        }
      }
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 520, margin: "0 auto", padding: 24 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800 }}>出庫</h1>

      <div style={{ marginTop: 10, padding: 12, border: "1px solid #eee", borderRadius: 12 }}>
        <div style={{ fontWeight: 700 }}>区画: {slot || "（不明）"}</div>
        <div style={{ marginTop: 6, fontSize: 12, color: "#666" }}>
          ※本日は {date} として扱います（必要なら変更できます）
        </div>

        <div style={{ marginTop: 10 }}>
          <label style={{ fontSize: 12, color: "#666" }}>日付</label>
          <input
            value={date}
            onChange={(e) => setDate(e.target.value)}
            style={{ width: "100%", marginTop: 4, padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
            placeholder="YYYY-MM-DD"
          />
        </div>

        <button
          onClick={submit}
          disabled={loading}
          style={{
            width: "100%",
            marginTop: 12,
            padding: 12,
            borderRadius: 12,
            border: "1px solid #ddd",
            cursor: "pointer",
            fontWeight: 800,
          }}
        >
          {loading ? "処理中..." : "出庫手続きをする"}
        </button>

        {msg && <div style={{ marginTop: 12, color: "green", fontWeight: 700 }}>{msg}</div>}
        {err && <div style={{ marginTop: 12, color: "crimson", fontWeight: 700 }}>{err}</div>}
      </div>
    </div>
  );
}