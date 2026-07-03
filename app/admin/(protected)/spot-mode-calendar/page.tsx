"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type OperationMode =
  | "RESERVATION_ONLY"
  | "HOURLY_ONLY"
  | "RESERVATION_THEN_HOURLY"
  | "EVENT_ONLY"
  | "CLOSED"
  | "MONTHLY";

type CalendarItem = {
  spotId: string;
  code: string;
  label: string | null;
  date: string;
  operationMode: OperationMode | null;
  inheritedOperationMode: OperationMode | null;
  calendarId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

type ApiResponse = {
  ok: boolean;
  place?: {
    id: string;
    slug: string;
    name: string;
  };
  date?: string;
  items?: CalendarItem[];
  error?: string;
  message?: string;
};

const MODE_OPTIONS: { value: OperationMode; label: string }[] = [
  { value: "RESERVATION_ONLY", label: "予約専用" },
  { value: "HOURLY_ONLY", label: "時間貸し専用" },
  { value: "RESERVATION_THEN_HOURLY", label: "予約優先→時間貸し" },
  { value: "EVENT_ONLY", label: "イベント日のみ予約営業" },
  { value: "CLOSED", label: "CLOSED" },
];

function ymdTodayJst() {
  return new Date().toLocaleDateString("sv-SE", {
    timeZone: "Asia/Tokyo",
  });
}

function modeLabel(v: string | null | undefined) {
  if (!v) return "継承";
  if (v === "RESERVATION_ONLY") return "予約専用";
  if (v === "HOURLY_ONLY") return "時間貸し専用";
  if (v === "RESERVATION_THEN_HOURLY") return "予約優先→時間貸し";
  if (v === "EVENT_ONLY") return "イベント日のみ予約営業";
  if (v === "CLOSED") return "CLOSED";
  if (v === "MONTHLY") return "月極専用";
  return v;
}

function SpotModeCalendarPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const placeId = useMemo(
    () => String(searchParams.get("placeId") ?? "rifu-main").trim(),
    [searchParams]
  );

  const date = useMemo(
    () => String(searchParams.get("date") ?? ymdTodayJst()).trim(),
    [searchParams]
  );

  const [loading, setLoading] = useState(true);
  const [savingSpotId, setSavingSpotId] = useState<string | null>(null);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [placeName, setPlaceName] = useState("");
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [draftMap, setDraftMap] = useState<Record<string, string>>({});
  const [originalMap, setOriginalMap] = useState<Record<string, string>>({});

  async function load() {
    setLoading(true);
    setError("");
    setMessage("");

    try {
      const qs = new URLSearchParams({
        placeId,
        date,
      });

      const res = await fetch(`/api/admin/spot-mode-calendar?${qs.toString()}`, {
        cache: "no-store",
      });

      const json: ApiResponse = await res.json();

      if (!res.ok || !json.ok) {
        setError(json.message ?? json.error ?? "取得に失敗しました");
        setItems([]);
        return;
      }

      setPlaceName(json.place?.name ?? "");
      const nextItems = json.items ?? [];
      setItems(nextItems);

      const nextDrafts: Record<string, string> = {};
      const nextOriginals: Record<string, string> = {};

      for (const item of nextItems) {
        const value = item.operationMode ?? "";
        nextDrafts[item.spotId] = value;
        nextOriginals[item.spotId] = value;
      }

      setDraftMap(nextDrafts);
      setOriginalMap(nextOriginals);
    } catch (e: any) {
      setError(String(e?.message ?? "取得に失敗しました"));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [placeId, date]);

  async function saveOne(item: CalendarItem, value: string) {
    if (!value) {
      const res = await fetch("/api/admin/spot-mode-calendar", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          placeId,
          spotId: item.spotId,
          date,
        }),
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(
          json.message ?? json.error ?? `${item.code} の削除に失敗しました`
        );
      }

      return;
    }

    const res = await fetch("/api/admin/spot-mode-calendar", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        placeId,
        spotId: item.spotId,
        date,
        operationMode: value,
      }),
    });

    const json = await res.json();

    if (!res.ok || !json.ok) {
      throw new Error(
        json.message ?? json.error ?? `${item.code} の保存に失敗しました`
      );
    }
  }

  async function handleSave(item: CalendarItem) {
    const value = draftMap[item.spotId] ?? "";

    setSavingSpotId(item.spotId);
    setError("");
    setMessage("");

    try {
      await saveOne(item, value);
      setMessage(`${item.code} を保存しました`);
      await load();
    } catch (e: any) {
      setError(String(e?.message ?? "保存に失敗しました"));
    } finally {
      setSavingSpotId(null);
    }
  }

  async function handleBulkSave() {
    const changedItems = items.filter(
      (item) =>
        (draftMap[item.spotId] ?? "") !== (originalMap[item.spotId] ?? "")
    );

    if (changedItems.length === 0) {
      setMessage("変更されたSLOTはありません");
      setError("");
      return;
    }

    setBulkSaving(true);
    setError("");
    setMessage("");

    try {
      for (const item of changedItems) {
        const value = draftMap[item.spotId] ?? "";
        await saveOne(item, value);
      }

      setMessage(`${changedItems.length}件のSLOT設定を一括保存しました`);
      await load();
    } catch (e: any) {
      setError(String(e?.message ?? "一括保存に失敗しました"));
    } finally {
      setBulkSaving(false);
    }
  }

  function moveDate(nextDate: string) {
    router.push(
      `/admin/spot-mode-calendar?placeId=${encodeURIComponent(
        placeId
      )}&date=${encodeURIComponent(nextDate)}`
    );
  }

  function shiftDate(days: number) {
    const base = new Date(`${date}T00:00:00`);

    if (Number.isNaN(base.getTime())) return;

    base.setDate(base.getDate() + days);
    moveDate(base.toISOString().slice(0, 10));
  }

  const changedCount = items.filter(
    (item) => (draftMap[item.spotId] ?? "") !== (originalMap[item.spotId] ?? "")
  ).length;

  return (
    <main
      style={{
        maxWidth: 960,
        margin: "0 auto",
        padding: "24px 16px 56px",
        fontFamily:
          'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <h1 style={{ fontSize: 30, fontWeight: 800, marginBottom: 12 }}>
        日付別SLOT営業モード設定
      </h1>

      <div
        style={{
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          alignItems: "end",
          marginBottom: 16,
          background: "#fff",
          border: "1px solid #e5e5e5",
          borderRadius: 16,
          padding: 16,
        }}
      >
        <div>
          <div style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>
            対象日
          </div>
          <input
            type="date"
            value={date}
            onChange={(e) => moveDate(e.target.value)}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #ccc",
              background: "#fff",
            }}
          />
        </div>

        <button onClick={() => shiftDate(-1)} style={subButtonStyle}>
          前日
        </button>

        <button onClick={() => moveDate(ymdTodayJst())} style={subButtonStyle}>
          今日
        </button>

        <button onClick={() => shiftDate(1)} style={subButtonStyle}>
          翌日
        </button>

        <div style={{ marginLeft: "auto", textAlign: "right" }}>
          <div style={{ fontSize: 12, color: "#666" }}>対象PLACE</div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>
            {placeName || placeId}
          </div>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "center",
          marginBottom: 16,
          flexWrap: "wrap",
        }}
      >
        <button
          onClick={handleBulkSave}
          disabled={bulkSaving || changedCount === 0}
          style={{
            ...primaryButtonStyle,
            opacity: bulkSaving || changedCount === 0 ? 0.55 : 1,
            cursor:
              bulkSaving || changedCount === 0 ? "not-allowed" : "pointer",
          }}
        >
          {bulkSaving ? "一括保存中..." : `変更を一括保存 (${changedCount})`}
        </button>

        <button onClick={() => router.push(`/admin/places`)} style={subButtonStyle}>
          Place一覧へ戻る
        </button>
      </div>

      {message ? (
        <div
          style={{
            background: "#f0fff4",
            border: "1px solid #b7ebc6",
            color: "#166534",
            borderRadius: 14,
            padding: 14,
            marginBottom: 16,
          }}
        >
          {message}
        </div>
      ) : null}

      {error ? (
        <div
          style={{
            background: "#fff5f5",
            border: "1px solid #f0b3b3",
            color: "#b00020",
            borderRadius: 14,
            padding: 14,
            marginBottom: 16,
          }}
        >
          {error}
        </div>
      ) : null}

      {loading ? (
        <div
          style={{
            background: "#fff",
            border: "1px solid #e5e5e5",
            borderRadius: 16,
            padding: 16,
          }}
        >
          読み込み中...
        </div>
      ) : (
        <div
          style={{
            background: "#fff",
            border: "1px solid #e5e5e5",
            borderRadius: 16,
            overflow: "hidden",
          }}
        >
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
            }}
          >
            <thead>
              <tr style={{ background: "#fafafa" }}>
                <th style={thStyle}>SLOT</th>
                <th style={thStyle}>ラベル</th>
                <th style={thStyle}>固定設定</th>
                <th style={thStyle}>日付別設定</th>
                <th style={thStyle}>保存</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const value = draftMap[item.spotId] ?? "";
                const saving = savingSpotId === item.spotId;
                const changed = value !== (originalMap[item.spotId] ?? "");

                return (
                  <tr key={item.spotId}>
                    <td style={tdStyle}>{item.code}</td>
                    <td style={tdStyle}>{item.label ?? "-"}</td>
                    <td style={tdStyle}>
                      {modeLabel(item.inheritedOperationMode)}
                    </td>
                    <td style={tdStyle}>
                      <div style={{ display: "grid", gap: 6 }}>
                        <select
                          value={value}
                          onChange={(e) =>
                            setDraftMap((prev) => ({
                              ...prev,
                              [item.spotId]: e.target.value,
                            }))
                          }
                          style={{
                            width: "100%",
                            padding: "10px 12px",
                            borderRadius: 10,
                            border: changed
                              ? "1px solid #2563eb"
                              : "1px solid #ccc",
                            background: "#fff",
                          }}
                        >
                          <option value="">継承に戻す</option>
                          {MODE_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>

                        {changed ? (
                          <span
                            style={{
                              fontSize: 12,
                              color: "#2563eb",
                              fontWeight: 700,
                            }}
                          >
                            未保存の変更
                          </span>
                        ) : (
                          <span style={{ fontSize: 12, color: "#666" }}>
                            現在: {modeLabel(item.operationMode)}
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={tdStyle}>
                      <button
                        onClick={() => handleSave(item)}
                        disabled={saving || !changed}
                        style={{
                          ...primaryButtonStyle,
                          opacity: saving || !changed ? 0.55 : 1,
                          cursor: saving || !changed ? "not-allowed" : "pointer",
                          padding: "10px 14px",
                        }}
                      >
                        {saving ? "保存中..." : "保存"}
                      </button>
                    </td>
                  </tr>
                );
              })}

              {items.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    style={{
                      textAlign: "center",
                      padding: 24,
                      color: "#666",
                    }}
                  >
                    対象SLOTがありません
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

export default function SpotModeCalendarPage() {
  return (
    <Suspense
      fallback={
        <main
          style={{
            maxWidth: 960,
            margin: "0 auto",
            padding: "24px 16px 56px",
          }}
        >
          読み込み中...
        </main>
      }
    >
      <SpotModeCalendarPageInner />
    </Suspense>
  );
}

const primaryButtonStyle: React.CSSProperties = {
  border: "none",
  background: "#111827",
  color: "#fff",
  borderRadius: 12,
  padding: "12px 18px",
  fontWeight: 700,
};

const subButtonStyle: React.CSSProperties = {
  border: "1px solid #d0d5dd",
  background: "#fff",
  color: "#111827",
  borderRadius: 12,
  padding: "12px 18px",
  fontWeight: 700,
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "14px 16px",
  borderBottom: "1px solid #eee",
  fontSize: 13,
  color: "#555",
};

const tdStyle: React.CSSProperties = {
  padding: "14px 16px",
  borderBottom: "1px solid #f2f2f2",
  verticalAlign: "top",
};