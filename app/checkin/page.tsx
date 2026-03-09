"use client";

import { useEffect, useState } from "react";

function normalizeSlot(input: string): string {
  if (!input) return input.trim();

  const v = input.trim().toUpperCase();

  const s = v.match(/^S(\d{1,2})$/i);
  if (s) {
    return `S${String(Number(s[1])).padStart(2, "0")}`;
  }

  const a = v.match(/^([A-Z])[- ]?(\d{1,2})$/i);
  if (a) {
    return `${a[1].toUpperCase()}-${String(Number(a[2])).padStart(2, "0")}`;
  }

  return v;
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
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setSlot(normalizeSlot(params.get("slot") ?? ""));
    setDate(params.get("date") ?? ymdTodayJst());
  }, []);

  async function submit() {
    setErr("");
    setMsg("");
    setResult(null);

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
        body: JSON.stringify({ date, slot, pin }),
      });

      const json = await res.json();
      setResult(json);

      if (json.ok) {
        if (json.status === "checked_in") {
          setMsg("チェックイン完了しました。駐車を完了してください。");
        } else if (json.status === "already_checked_in") {
          setMsg("すでにチェックイン済みです。");
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

      <div
        style={{
          marginTop: 10,
          padding: 12,
          border: "1px solid #eee",
          borderRadius: 12,
          background: "#fafafa",
        }}
      >
        <div style={{ fontWeight: 700 }}>区画: {slot || "（不明）"}</div>
        <div style={{ marginTop: 6, fontSize: 12, color: "#666" }}>
          日付: {date || "読込中"}
        </div>

        <div style={{ marginTop: 10 }}>
          <label style={{ fontSize: 12, color: "#666" }}>日付</label>
          <input
            value={date}
            onChange={(e) => setDate(e.target.value)}
            style={{
              width: "100%",
              marginTop: 4,
              padding: 10,
              borderRadius: 10,
              border: "1px solid #ddd",
            }}
            placeholder="YYYY-MM-DD"
          />
        </div>
      </div>

      <div
        style={{
          marginTop: 16,
          padding: 12,
          border: "1px solid #eee",
          borderRadius: 12,
          background: "#fff",
        }}
      >
        <div style={{ fontWeight: 800, marginBottom: 6 }}>PINチェックイン</div>
        <div style={{ fontSize: 13, color: "#444" }}>
          予約者はメールで受け取った <b>4桁コード</b> を入力してください。
        </div>

        <div style={{ marginTop: 12 }}>
          <input
            value={pin}
            onChange={(e) =>
              setPin(e.target.value.replace(/[^\d]/g, "").slice(0, 4))
            }
            inputMode="numeric"
            placeholder="4桁コード"
            style={{
              width: "100%",
              padding: 12,
              borderRadius: 12,
              border: "1px solid #ddd",
              fontSize: 18,
            }}
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
            border: "1px solid #111",
            background: "#111",
            color: "#fff",
            cursor: "pointer",
            fontWeight: 800,
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? "確認中..." : "チェックインする"}
        </button>

        {msg ? (
          <div style={{ marginTop: 12, color: "green", fontWeight: 700 }}>
            {msg}
          </div>
        ) : null}

        {err ? (
          <div style={{ marginTop: 12, color: "crimson", fontWeight: 700 }}>
            {err}
          </div>
        ) : null}
      </div>

      {result ? (
        <div
          style={{
            marginTop: 16,
            padding: 12,
            border: "1px solid #eee",
            borderRadius: 12,
            background: "#f6f8fa",
          }}
        >
          <div style={{ fontWeight: 800, marginBottom: 8 }}>結果</div>
          <pre style={{ margin: 0, whiteSpace: "pre-wrap", overflowX: "auto" }}>
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      ) : null}
    </div>
  );
}