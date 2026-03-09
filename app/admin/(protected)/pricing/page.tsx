"use client";

import { useEffect, useMemo, useState } from "react";

const PLACE_ID = "e24a57f5-787f-4c2e-9394-e5f54053a955";

export default function AdminPricingPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const [placeName, setPlaceName] = useState("");

  const [reservationFixedYen, setReservationFixedYen] = useState<number>(3000);
  const [hourlyYen, setHourlyYen] = useState<number>(500);
  const [eventFixedYen, setEventFixedYen] = useState<number>(3000);
  const [eventHourlyYen, setEventHourlyYen] = useState<number>(800);
  const [eventDaysText, setEventDaysText] = useState<string>("");

  const parsedEventDays = useMemo(() => {
    const lines = eventDaysText
      .split("\n")
      .map((x) => x.trim())
      .filter(Boolean);

    const ymd = lines.filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x));

    return Array.from(new Set(ymd)).sort();
  }, [eventDaysText]);

  async function loadPricing() {
    setLoading(true);
    setErr("");
    setMsg("");

    try {
      const res = await fetch(
        `/api/admin/pricing?placeId=${encodeURIComponent(PLACE_ID)}`,
        { cache: "no-store" }
      );
      const json = await res.json();

      if (!json.ok) {
        setErr(json.message ?? json.error ?? "読み込みに失敗しました");
        return;
      }

      setPlaceName(json.place?.name ?? "");
      setReservationFixedYen(Number(json.pricing?.reservationFixedYen ?? 3000));
      setHourlyYen(Number(json.pricing?.hourlyYen ?? 500));
      setEventFixedYen(Number(json.pricing?.eventFixedYen ?? 3000));
      setEventHourlyYen(Number(json.pricing?.eventHourlyYen ?? 800));
      setEventDaysText(
        Array.isArray(json.pricing?.eventDays)
          ? json.pricing.eventDays.map((d: any) => d.date).join("\n")
          : ""
      );
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPricing();
  }, []);

  async function onSave() {
    setSaving(true);
    setErr("");
    setMsg("");

    try {
      const res = await fetch("/api/admin/pricing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          placeId: PLACE_ID,
          reservationFixedYen,
          hourlyYen,
          eventFixedYen,
          eventHourlyYen,
          eventDays: parsedEventDays,
        }),
      });

      const json = await res.json();

      if (!json.ok) {
        setErr(json.message ?? json.error ?? "保存に失敗しました");
        return;
      }

      setMsg("料金設定をDBに保存しました");
      await loadPricing();
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <main style={{ padding: 24, maxWidth: 920 }}>
      <h1 style={{ fontSize: 28, marginBottom: 6 }}>料金設定</h1>
      <div style={{ opacity: 0.8, marginBottom: 16 }}>
        対象 Place: {placeName || PLACE_ID}
      </div>

      <section
        style={{
          border: "1px solid #ddd",
          borderRadius: 12,
          padding: 16,
          background: "#fff",
        }}
      >
        {loading ? (
          <div>読み込み中...</div>
        ) : (
          <>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
              }}
            >
              <label>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>予約固定料金（円）</div>
                <input
                  type="number"
                  value={reservationFixedYen}
                  onChange={(e) => setReservationFixedYen(Number(e.target.value))}
                  style={{
                    width: "100%",
                    padding: 10,
                    border: "1px solid #ccc",
                    borderRadius: 10,
                  }}
                />
              </label>

              <label>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>通常時間貸し料金（円/時）</div>
                <input
                  type="number"
                  value={hourlyYen}
                  onChange={(e) => setHourlyYen(Number(e.target.value))}
                  style={{
                    width: "100%",
                    padding: 10,
                    border: "1px solid #ccc",
                    borderRadius: 10,
                  }}
                />
              </label>

              <label>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>イベント予約料金（円）</div>
                <input
                  type="number"
                  value={eventFixedYen}
                  onChange={(e) => setEventFixedYen(Number(e.target.value))}
                  style={{
                    width: "100%",
                    padding: 10,
                    border: "1px solid #ccc",
                    borderRadius: 10,
                  }}
                />
              </label>

              <label>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>イベント時間貸し料金（円/時）</div>
                <input
                  type="number"
                  value={eventHourlyYen}
                  onChange={(e) => setEventHourlyYen(Number(e.target.value))}
                  style={{
                    width: "100%",
                    padding: 10,
                    border: "1px solid #ccc",
                    borderRadius: 10,
                  }}
                />
              </label>
            </div>

            <hr style={{ margin: "16px 0" }} />

            <h2 style={{ fontSize: 18, marginTop: 0 }}>イベント日（YYYY-MM-DD）</h2>
            <div style={{ opacity: 0.75, marginBottom: 8 }}>
              1行に1日。保存時に EventDay を作り直します。
            </div>

            <textarea
              value={eventDaysText}
              onChange={(e) => setEventDaysText(e.target.value)}
              rows={8}
              style={{
                width: "100%",
                padding: 12,
                border: "1px solid #ccc",
                borderRadius: 10,
                fontFamily:
                  "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
              }}
            />

            <div style={{ marginTop: 10, fontSize: 14 }}>
              認識したイベント日：<b>{parsedEventDays.length}件</b>
              {parsedEventDays.length > 0 && (
                <div style={{ marginTop: 6, opacity: 0.85 }}>
                  {parsedEventDays.join(", ")}
                </div>
              )}
            </div>

            <div style={{ marginTop: 16, display: "flex", gap: 10, alignItems: "center" }}>
              <button
                onClick={onSave}
                disabled={saving}
                style={{
                  padding: "12px 16px",
                  borderRadius: 10,
                  border: "1px solid #111",
                  background: "#111",
                  color: "#fff",
                  fontWeight: 800,
                  cursor: "pointer",
                  opacity: saving ? 0.7 : 1,
                }}
              >
                {saving ? "保存中..." : "DBに保存する"}
              </button>

              <span style={{ opacity: 0.75 }}>
                保存後、予約・時間貸し料金に反映されます
              </span>
            </div>

            {msg ? (
              <div style={{ marginTop: 12, color: "green", fontWeight: 700 }}>{msg}</div>
            ) : null}

            {err ? (
              <div style={{ marginTop: 12, color: "crimson", fontWeight: 700 }}>{err}</div>
            ) : null}
          </>
        )}
      </section>
    </main>
  );
}