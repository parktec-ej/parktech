"use client";
import { useEffect, useMemo, useState } from "react";

type Settings = {
  normalPrice: number;
  eventPrice: number;
  eventDays: string[]; // "YYYY-MM-DD"
};

const STORAGE_KEY = "parking_settings_v1";

function loadSettings(): Settings {
  if (typeof window === "undefined") {
    return { normalPrice: 1000, eventPrice: 3000, eventDays: [] };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { normalPrice: 1000, eventPrice: 3000, eventDays: [] };
    const parsed = JSON.parse(raw);
    return {
      normalPrice: Number(parsed.normalPrice ?? 1000),
      eventPrice: Number(parsed.eventPrice ?? 3000),
      eventDays: Array.isArray(parsed.eventDays) ? parsed.eventDays : [],
    };
  } catch {
    return { normalPrice: 1000, eventPrice: 3000, eventDays: [] };
  }
}

function saveSettings(s: Settings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

export default function AdminPage() {
  const [normalPrice, setNormalPrice] = useState<number>(1000);
  const [eventPrice, setEventPrice] = useState<number>(3000);
  const [eventDaysText, setEventDaysText] = useState<string>("");

  // 初回ロード
  useEffect(() => {
    const s = loadSettings();
    setNormalPrice(s.normalPrice);
    setEventPrice(s.eventPrice);
    setEventDaysText(s.eventDays.join("\n"));
  }, []);

  const parsedEventDays = useMemo(() => {
    // 改行区切りで入力 → 正規化
    const lines = eventDaysText
      .split("\n")
      .map((x) => x.trim())
      .filter(Boolean);

    // YYYY-MM-DDっぽいものだけ
    const ymd = lines.filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x));

    // 重複排除＆ソート
    return Array.from(new Set(ymd)).sort();
  }, [eventDaysText]);

  const onSave = () => {
    const s: Settings = {
      normalPrice: Number(normalPrice || 0),
      eventPrice: Number(eventPrice || 0),
      eventDays: parsedEventDays,
    };
    saveSettings(s);
    alert("保存しました（予約画面に反映されます）");
  };

  return (
    <main style={{ padding: 24, maxWidth: 860 }}>
      <h1 style={{ fontSize: 28, marginBottom: 6 }}>管理画面</h1>
      <div style={{ opacity: 0.8, marginBottom: 16 }}>ログイン成功 ✅</div>

      <section style={{ border: "1px solid #ddd", borderRadius: 12, padding: 16 }}>
        <h2 style={{ fontSize: 18, marginTop: 0 }}>料金設定</h2>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <label>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>通常料金（円）</div>
            <input
              type="number"
              value={normalPrice}
              onChange={(e) => setNormalPrice(Number(e.target.value))}
              style={{ width: "100%", padding: 10, border: "1px solid #ccc", borderRadius: 10 }}
            />
          </label>

          <label>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>イベント料金（円）</div>
            <input
              type="number"
              value={eventPrice}
              onChange={(e) => setEventPrice(Number(e.target.value))}
              style={{ width: "100%", padding: 10, border: "1px solid #ccc", borderRadius: 10 }}
            />
          </label>
        </div>

        <hr style={{ margin: "16px 0" }} />

        <h2 style={{ fontSize: 18, marginTop: 0 }}>イベント日（YYYY-MM-DD）</h2>
        <div style={{ opacity: 0.75, marginBottom: 8 }}>
          1行に1日。例：2026-02-11
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
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
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
            style={{
              padding: "12px 16px",
              borderRadius: 10,
              border: "1px solid #111",
              background: "#111",
              color: "#fff",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            保存する
          </button>

          <span style={{ opacity: 0.75 }}>
            保存後、/reserve を更新すると反映されます
          </span>
        </div>
      </section>
    </main>
  );
}