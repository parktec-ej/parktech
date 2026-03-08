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

export default function CheckinPage() {
  const [slot, setSlot] = useState("");
  const [date, setDate] = useState("");
  const [pin, setPin] = useState("");
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
      setErr("slot が見つかりません（QRが不正です）");
      return;
    }

    if (!/^\d{4}$/.test(pin)) {
      setErr("4桁のコードを入力してください");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, slot, pin, action: "in" }),
      });

      const json = await res.json();

      if (json.ok) {
        if (json.status === "checked_in" || json.status === "already_checked_in") {
          setMsg("チェックイン完了しました。駐車を完了してコーンを車の前に置いてください。");
        } else {
          setMsg("処理が完了しました。");
        }
      } else {
        if (json.error === "invalid_pin") {
          setErr("コードが違います。もう一度入力してください。");
        } else {
          setErr(json.message ?? json.error ?? "エラーが発生しました");
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
      <h1 style={{ fontSize: 22, fontWeight: 800 }}>チェックイン</h1>

      <div style={{ marginTop: 10, padding: 12, border: "1px solid #eee", borderRadius: 12 }}>
        <div style={{ fontWeight: 700 }}>区画: {slot || "（不明）"}</div>
        <div style={{ marginTop: 6, fontSize: 12, color: "#666" }}>
          ※本日は {date || "読込中"} として扱います
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
      </div>

      <div style={{ marginTop: 16, padding: 12, border: "1px solid #eee", borderRadius: 12 }}>
        <div style={{ fontWeight: 800, marginBottom: 6 }}>この場所は予約中です</div>
        <div style={{ fontSize: 13, color: "#444" }}>
          予約者は、メールで受け取った <b>4桁コード</b> を入力してください。
        </div>

        <div style={{ marginTop: 12 }}>
          <input
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/[^\d]/g, "").slice(0, 4))}
            inputMode="numeric"
            placeholder="4桁コード"
            style={{ width: "100%", padding: 12, borderRadius: 12, border: "1px solid #ddd", fontSize: 18 }}
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
          {loading ? "確認中..." : "チェックインする"}
        </button>

        {msg ? <div style={{ marginTop: 12, color: "green", fontWeight: 700 }}>{msg}</div> : null}
        {err ? <div style={{ marginTop: 12, color: "crimson", fontWeight: 700 }}>{err}</div> : null}
      </div>
    </div>
  );
}