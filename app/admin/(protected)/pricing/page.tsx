"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

type EventDayRow = {
  id?: string;
  date: string;
  label?: string;
  fixedYenOverride: number | null;
  hourlyYenOverride: number | null;
  busFixedYen: number | null;
  reservationOpenDaysBefore: number;
};

const OPEN_DAYS_OPTIONS = [0, 7, 14, 30, 60] as const;

function emptyEventDay(): EventDayRow {
  return {
    date: "",
    label: "",
    fixedYenOverride: null,
    hourlyYenOverride: null,
    busFixedYen: null,
    reservationOpenDaysBefore: 0,
  };
}

function toNullableNumber(value: string) {
  if (value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function AdminPricingPageInner() {
  const searchParams = useSearchParams();
  const placeId = String(searchParams.get("placeId") ?? "").trim();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const [placeName, setPlaceName] = useState("");

  const [reservationFixedYen, setReservationFixedYen] = useState<number>(3000);
  const [hourlyYen, setHourlyYen] = useState<number>(500);

  const [eventDays, setEventDays] = useState<EventDayRow[]>([]);

  const sortedPreview = useMemo(() => {
    return [...eventDays]
      .filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.date))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [eventDays]);

  async function loadPricing() {
    if (!placeId) {
      setErr("placeId を選択してください");
      setLoading(false);
      return;
    }

    setLoading(true);
    setErr("");
    setMsg("");

    try {
      const res = await fetch(
        `/api/admin/pricing?placeId=${encodeURIComponent(placeId)}`,
        { cache: "no-store" }
      );
      const json = await res.json();

      if (!json.ok) {
        setErr(json.message ?? json.error ?? "読み込みに失敗しました");
        return;
      }

      setPlaceName(json.place?.name ?? "");
      setReservationFixedYen(Number(json.reservationFixedYen ?? 3000));
      setHourlyYen(Number(json.hourlyYen ?? 500));

      const rows: EventDayRow[] = Array.isArray(json.eventDays)
        ? json.eventDays.map((d: any) => ({
            id: d.id,
            date: String(d.date ?? ""),
            label: String(d.label ?? ""),
            fixedYenOverride:
              d.fixedYenOverride === null || d.fixedYenOverride === undefined
                ? null
                : Number(d.fixedYenOverride),
            hourlyYenOverride:
              d.hourlyYenOverride === null || d.hourlyYenOverride === undefined
                ? null
                : Number(d.hourlyYenOverride),
            busFixedYen:
              d.busFixedYen === null || d.busFixedYen === undefined
                ? null
                : Number(d.busFixedYen),
            reservationOpenDaysBefore: Number(d.reservationOpenDaysBefore ?? 0),
          }))
        : [];

      setEventDays(rows.length > 0 ? rows : [emptyEventDay()]);
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPricing();
  }, [placeId]);

  function updateRow(index: number, patch: Partial<EventDayRow>) {
    setEventDays((prev) =>
      prev.map((row, i) => (i === index ? { ...row, ...patch } : row))
    );
  }

  function addRow() {
    setEventDays((prev) => [...prev, emptyEventDay()]);
  }

  function removeRow(index: number) {
    setEventDays((prev) => {
      const next = prev.filter((_, i) => i !== index);
      return next.length > 0 ? next : [emptyEventDay()];
    });
  }

  async function onSave() {
    if (!placeId) {
      setErr("placeId を選択してください");
      return;
    }

    setSaving(true);
    setErr("");
    setMsg("");

    try {
      const cleanedRows = eventDays
        .map((row) => ({
          id: row.id,
          date: row.date.trim(),
          label: row.label?.trim() || "",
          fixedYenOverride: row.fixedYenOverride,
          hourlyYenOverride: row.hourlyYenOverride,
          busFixedYen: row.busFixedYen,
          reservationOpenDaysBefore: row.reservationOpenDaysBefore,
        }))
        .filter((row) => row.date !== "");

      const duplicateDates = new Set<string>();
      const seen = new Set<string>();

      for (const row of cleanedRows) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date)) {
          setErr(`日付形式が不正です: ${row.date}`);
          setSaving(false);
          return;
        }

        if (seen.has(row.date)) duplicateDates.add(row.date);
        seen.add(row.date);

        if (![0, 7, 14, 30, 60].includes(Number(row.reservationOpenDaysBefore))) {
          setErr(
            `予約開放日は 0 / 7 / 14 / 30 / 60 のいずれかにしてください: ${row.date}`
          );
          setSaving(false);
          return;
        }
      }

      if (duplicateDates.size > 0) {
        setErr(`イベント日が重複しています: ${Array.from(duplicateDates).join(", ")}`);
        setSaving(false);
        return;
      }

      const res = await fetch("/api/admin/pricing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          placeId,
          reservationFixedYen,
          hourlyYen,
          eventDays: cleanedRows,
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
    <main style={{ padding: 24, maxWidth: 1200 }}>
      <h1 style={{ fontSize: 28, marginBottom: 6 }}>料金設定</h1>
      <div style={{ opacity: 0.8, marginBottom: 16 }}>
        対象 Place: {placeName || placeId || "未選択"}
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
                <div style={{ fontWeight: 700, marginBottom: 6 }}>通常予約料金（円）</div>
                <input
                  type="number"
                  value={reservationFixedYen}
                  onChange={(e) => setReservationFixedYen(Number(e.target.value))}
                  style={inputStyle}
                />
              </label>

              <label>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>
                  通常時間貸し料金（円/時）
                </div>
                <input
                  type="number"
                  value={hourlyYen}
                  onChange={(e) => setHourlyYen(Number(e.target.value))}
                  style={inputStyle}
                />
              </label>
            </div>

            <hr style={{ margin: "20px 0" }} />

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
                marginBottom: 12,
              }}
            >
              <div>
                <h2 style={{ fontSize: 18, margin: 0 }}>イベント日ごとの料金設定</h2>
                <div style={{ opacity: 0.75, marginTop: 6 }}>
                  一般予約価格・バス価格・予約開放日数を日付ごとに設定します
                </div>
              </div>

              <button onClick={addRow} type="button" style={addButtonStyle}>
                行を追加
              </button>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  minWidth: 980,
                }}
              >
                <thead>
                  <tr>
                    <th style={thStyle}>日付</th>
                    <th style={thStyle}>ラベル</th>
                    <th style={thStyle}>一般予約料金</th>
                    <th style={thStyle}>イベント時間貸し料金</th>
                    <th style={thStyle}>バス予約料金</th>
                    <th style={thStyle}>予約開放</th>
                    <th style={thStyle}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {eventDays.map((row, index) => (
                    <tr key={`${row.id ?? "new"}-${index}`}>
                      <td style={tdStyle}>
                        <input
                          type="date"
                          value={row.date}
                          onChange={(e) => updateRow(index, { date: e.target.value })}
                          style={inputStyle}
                        />
                      </td>
                      <td style={tdStyle}>
                        <input
                          value={row.label ?? ""}
                          onChange={(e) => updateRow(index, { label: e.target.value })}
                          placeholder="例: 花火大会 / コンサート"
                          style={inputStyle}
                        />
                      </td>
                      <td style={tdStyle}>
                        <input
                          type="number"
                          value={row.fixedYenOverride ?? ""}
                          onChange={(e) =>
                            updateRow(index, {
                              fixedYenOverride: toNullableNumber(e.target.value),
                            })
                          }
                          placeholder="一般予約料金"
                          style={inputStyle}
                        />
                      </td>
                      <td style={tdStyle}>
                        <input
                          type="number"
                          value={row.hourlyYenOverride ?? ""}
                          onChange={(e) =>
                            updateRow(index, {
                              hourlyYenOverride: toNullableNumber(e.target.value),
                            })
                          }
                          placeholder="イベント時間貸し料金"
                          style={inputStyle}
                        />
                      </td>
                      <td style={tdStyle}>
                        <input
                          type="number"
                          value={row.busFixedYen ?? ""}
                          onChange={(e) =>
                            updateRow(index, {
                              busFixedYen: toNullableNumber(e.target.value),
                            })
                          }
                          placeholder="バス予約料金"
                          style={inputStyle}
                        />
                      </td>
                      <td style={tdStyle}>
                        <select
                          value={row.reservationOpenDaysBefore}
                          onChange={(e) =>
                            updateRow(index, {
                              reservationOpenDaysBefore: Number(e.target.value),
                            })
                          }
                          style={inputStyle}
                        >
                          {OPEN_DAYS_OPTIONS.map((days) => (
                            <option key={days} value={days}>
                              {days}日前
                            </option>
                          ))}
                        </select>
                      </td>
                      <td style={tdStyle}>
                        <button
                          type="button"
                          onClick={() => removeRow(index)}
                          style={deleteButtonStyle}
                        >
                          削除
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ marginTop: 16, fontSize: 14 }}>
              登録対象イベント日：<b>{sortedPreview.length}件</b>
              {sortedPreview.length > 0 && (
                <div style={{ marginTop: 8, opacity: 0.85 }}>
                  {sortedPreview.map((row) => row.date).join(", ")}
                </div>
              )}
            </div>

            <div style={{ marginTop: 16, display: "flex", gap: 10, alignItems: "center" }}>
              <button
                onClick={onSave}
                disabled={saving || !placeId}
                style={{
                  padding: "12px 16px",
                  borderRadius: 10,
                  border: "1px solid #111",
                  background: "#111",
                  color: "#fff",
                  fontWeight: 800,
                  cursor: "pointer",
                  opacity: saving || !placeId ? 0.7 : 1,
                }}
              >
                {saving ? "保存中..." : "DBに保存する"}
              </button>

              <span style={{ opacity: 0.75 }}>
                保存後、一般予約・バス予約・時間貸し判定に反映されます
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

export default function AdminPricingPage() {
  return (
    <Suspense fallback={<main style={{ padding: 24, maxWidth: 1200 }}>読み込み中...</main>}>
      <AdminPricingPageInner />
    </Suspense>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: 10,
  border: "1px solid #ccc",
  borderRadius: 10,
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 8px",
  borderBottom: "1px solid #ddd",
  fontSize: 13,
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  padding: "10px 8px",
  borderBottom: "1px solid #f1f1f1",
  verticalAlign: "top",
};

const addButtonStyle: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid #111",
  background: "#111",
  color: "#fff",
  fontWeight: 700,
  cursor: "pointer",
};

const deleteButtonStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #b91c1c",
  background: "#fff",
  color: "#b91c1c",
  fontWeight: 700,
  cursor: "pointer",
};