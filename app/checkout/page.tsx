"use client";

import { useEffect, useState } from "react";

const PLACE_ID = "e24a57f5-787f-4c2e-9394-e5f54053a955";

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

export default function CheckoutPage() {
  const [slot, setSlot] = useState("");
  const [date, setDate] = useState("");
  const [mode, setMode] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setSlot(normalizeSlot(params.get("slot") ?? ""));
    setDate(params.get("date") ?? ymdTodayJst());
  }, []);

  useEffect(() => {
    if (!slot || !date) return;

    let cancelled = false;

    async function run() {
      setChecking(true);
      setErr("");
      try {
        const res = await fetch(
          `/api/gate-status?placeId=${encodeURIComponent(
            PLACE_ID
          )}&slot=${encodeURIComponent(slot)}&date=${encodeURIComponent(date)}`,
          { cache: "no-store" }
        );
        const json = await res.json();
        if (!cancelled) {
          setMode(json.mode ?? "");
        }
      } catch (e: any) {
        if (!cancelled) setErr(String(e?.message ?? e));
      } finally {
        if (!cancelled) setChecking(false);
      }
    }

    run();

    return () => {
      cancelled = true;
    };
  }, [slot, date]);

  async function submitReservationCheckout() {
    setErr("");
    setMsg("");
    setResult(null);

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
      setResult(json);

      if (json.ok) {
        setMsg("予約出庫が完了しました。");
      } else {
        setErr(json.message ?? json.error ?? "エラーが発生しました");
      }
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }

  async function submitHourlyCheckout() {
    setErr("");
    setMsg("");
    setResult(null);

    if (!slot) {
      setErr("slot が見つかりません");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/hourly-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placeId: PLACE_ID, slot, date }),
      });
      const json = await res.json();
      setResult(json);

      if (json.ok) {
        setMsg(
          `時間貸し出庫が完了しました。料金は ${json.totalYen ?? "-"} 円です。`
        );
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
        <div style={{ marginTop: 6, fontSize: 12, color: "#666" }}>
          判定: {checking ? "確認中..." : mode || "不明"}
        </div>
      </div>

      {!checking && mode === "can_checkout" && (
        <button
          onClick={submitReservationCheckout}
          disabled={loading}
          style={{
            width: "100%",
            marginTop: 16,
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
          {loading ? "処理中..." : "予約出庫する"}
        </button>
      )}

      {!checking && mode === "can_checkout_hourly" && (
        <button
          onClick={submitHourlyCheckout}
          disabled={loading}
          style={{
            width: "100%",
            marginTop: 16,
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
          {loading ? "処理中..." : "時間貸しを精算して出庫する"}
        </button>
      )}

      {!checking &&
        mode !== "can_checkout" &&
        mode !== "can_checkout_hourly" && (
          <div
            style={{
              marginTop: 16,
              padding: 12,
              border: "1px solid #eee",
              borderRadius: 12,
              background: "#fff",
              color: "#444",
            }}
          >
            現在この区画は出庫可能状態ではありません。
          </div>
        )}

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