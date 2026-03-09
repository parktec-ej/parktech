"use client";

import { useEffect, useMemo, useState } from "react";

const PLACE_ID = "e24a57f5-787f-4c2e-9394-e5f54053a955";

type SpotItem = {
  id: string;
  code: string;
  label: string | null;
  isReserved: boolean;
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function ymd(d: Date) {
  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  return `${y}-${m}-${day}`;
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addMonths(d: Date, delta: number) {
  return new Date(d.getFullYear(), d.getMonth() + delta, 1);
}

function daysInMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

export default function ReservePage() {
  const [month, setMonth] = useState<Date>(() => startOfMonth(new Date()));
  const [date, setDate] = useState<string>(() => ymd(new Date()));

  const [placeName, setPlaceName] = useState<string>("駐車場");
  const [placeAddress, setPlaceAddress] = useState<string>("");

  const [spots, setSpots] = useState<SpotItem[]>([]);
  const [spotId, setSpotId] = useState<string>("");
  const [spotCode, setSpotCode] = useState<string>("");

  const [name, setName] = useState("");
  const [plate, setPlate] = useState("");
  const [email, setEmail] = useState("");

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string>("");

  const [success, setSuccess] = useState<null | {
    pin: string;
    price: number;
    spotCode: string;
    date: string;
  }>(null);

  const reservedCount = spots.filter((s) => s.isReserved).length;
  const remaining = spots.length - reservedCount;

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoading(true);
      setMsg("");

      try {
        const res = await fetch(
          `/api/reservations?date=${encodeURIComponent(date)}&placeId=${encodeURIComponent(
            PLACE_ID
          )}`,
          { cache: "no-store" }
        );

        const json = await res.json();

        if (!json.ok) {
          if (!cancelled) setMsg(`取得エラー: ${json.error ?? "unknown"}`);
          return;
        }

        const fetchedSpots: SpotItem[] = (json.spots ?? []).map((s: any) => ({
          id: String(s.id),
          code: String(s.code),
          label: s.label ? String(s.label) : null,
          isReserved: Boolean(s.isReserved),
        }));

        if (!cancelled) {
          setPlaceName(String(json.place?.name ?? "駐車場"));
          setPlaceAddress(String(json.place?.address ?? ""));
          setSpots(fetchedSpots);

          const currentSelected = fetchedSpots.find((s) => s.id === spotId);
          if (!currentSelected || currentSelected.isReserved) {
            const firstFree = fetchedSpots.find((s) => !s.isReserved);
            setSpotId(firstFree?.id ?? "");
            setSpotCode(firstFree?.code ?? "");
          }
        }
      } catch (e: any) {
        if (!cancelled) setMsg(`取得エラー: ${String(e?.message ?? e)}`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();

    return () => {
      cancelled = true;
    };
  }, [date, spotId]);

  const calendarCells = useMemo(() => {
    const first = startOfMonth(month);
    const firstWeekday = first.getDay();
    const dim = daysInMonth(month);

    const cells: Array<{ label: string; value: string | null }> = [];

    for (let i = 0; i < firstWeekday; i++) cells.push({ label: "", value: null });
    for (let day = 1; day <= dim; day++) {
      const d = new Date(month.getFullYear(), month.getMonth(), day);
      cells.push({ label: String(day), value: ymd(d) });
    }
    while (cells.length % 7 !== 0) cells.push({ label: "", value: null });

    return cells;
  }, [month]);

  async function refreshSpots(ymdStr: string) {
    const res = await fetch(
      `/api/reservations?date=${encodeURIComponent(ymdStr)}&placeId=${encodeURIComponent(
        PLACE_ID
      )}`,
      { cache: "no-store" }
    );
    const json = await res.json();

    if (json.ok) {
      const fetchedSpots: SpotItem[] = (json.spots ?? []).map((s: any) => ({
        id: String(s.id),
        code: String(s.code),
        label: s.label ? String(s.label) : null,
        isReserved: Boolean(s.isReserved),
      }));

      setSpots(fetchedSpots);

      const selected = fetchedSpots.find((s) => s.id === spotId);
      if (!selected || selected.isReserved) {
        const firstFree = fetchedSpots.find((s) => !s.isReserved);
        setSpotId(firstFree?.id ?? "");
        setSpotCode(firstFree?.code ?? "");
      }
    }
  }

  async function submit() {
    setMsg("");

    if (!date) return setMsg("日付を選んでください");
    if (!spotId) return setMsg("区画を選んでください");
    if (!name.trim()) return setMsg("名前を入力してください");
    if (!plate.trim()) return setMsg("車両ナンバーを入力してください");

    const selectedSpot = spots.find((s) => s.id === spotId);
    if (!selectedSpot) return setMsg("区画を選び直してください");
    if (selectedSpot.isReserved) {
      return setMsg("その区画は予約済みです。別の区画を選んでください。");
    }

    setLoading(true);
    try {
      const res = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          slot: selectedSpot.code,
          placeId: PLACE_ID,
          spotId: selectedSpot.id,
          name: name.trim(),
          plate: plate.trim(),
          email: email?.trim() ? email.trim() : null,
        }),
      });

      const json = await res.json();

      if (!json.ok) {
        setMsg(`予約失敗: ${json.error ?? "unknown"}`);
        return;
      }

      setSuccess({
        pin: String(json.pin),
        price: Number(json.price),
        spotCode: selectedSpot.code,
        date,
      });

      await refreshSpots(date);
    } catch (e: any) {
      setMsg(`予約失敗: ${String(e?.message ?? e)}`);
    } finally {
      setLoading(false);
    }
  }

  const title = `${month.getFullYear()}年${month.getMonth() + 1}月`;

  return (
    <div style={{ maxWidth: 560, margin: "24px auto", padding: 16, fontFamily: "system-ui" }}>
      {success && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            zIndex: 9999,
          }}
          onClick={() => setSuccess(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(520px, 100%)",
              background: "#fff",
              borderRadius: 18,
              padding: 18,
              boxShadow: "0 10px 40px rgba(0,0,0,0.2)",
            }}
          >
            <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 8 }}>
              予約手続き完了しました
            </div>

            <div style={{ color: "#333", fontSize: 13, lineHeight: 1.6 }}>
              暗証番号を発行しましたので控えてください。<br />
              メールにも送りましたのでご確認ください。
            </div>

            <div
              style={{
                marginTop: 14,
                border: "2px solid #111",
                borderRadius: 16,
                padding: "18px 14px",
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: 12, color: "#666", fontWeight: 800 }}>
                暗証番号（4桁）
              </div>
              <div
                style={{
                  marginTop: 6,
                  fontSize: 52,
                  fontWeight: 900,
                  letterSpacing: 8,
                }}
              >
                {success.pin}
              </div>
            </div>

            <div style={{ marginTop: 12, fontSize: 12, color: "#666" }}>
              区画：{success.spotCode}　/　日付：{success.date}　/　料金：{success.price}円
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
              <button
                onClick={() => {
                  window.location.href = `/gate?slot=${encodeURIComponent(success.spotCode)}`;
                }}
                style={{
                  flex: 1,
                  padding: "12px 12px",
                  borderRadius: 14,
                  border: "1px solid #ddd",
                  cursor: "pointer",
                  fontWeight: 900,
                }}
              >
                現地QR画面へ（テスト）
              </button>

              <button
                onClick={() => setSuccess(null)}
                style={{
                  flex: 1,
                  padding: "12px 12px",
                  borderRadius: 14,
                  border: "1px solid #111",
                  background: "#111",
                  color: "#fff",
                  cursor: "pointer",
                  fontWeight: 900,
                }}
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}

      <h1 style={{ fontSize: 22, fontWeight: 900, marginBottom: 10 }}>駐車場予約</h1>

      <div
        style={{
          border: "1px solid #eee",
          borderRadius: 14,
          padding: 12,
          background: "#fafafa",
          marginBottom: 14,
        }}
      >
        <div style={{ fontWeight: 900, fontSize: 18 }}>{placeName}</div>
        <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>{placeAddress}</div>
        <div style={{ fontWeight: 900, fontSize: 18, marginTop: 8 }}>
          残り {remaining} / {spots.length || 0}
          {loading ? "（更新中）" : ""}
        </div>
        <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>選択日：{date}</div>
      </div>

      <div style={{ border: "1px solid #eee", borderRadius: 14, padding: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <button
            onClick={() => setMonth(addMonths(month, -1))}
            style={{
              padding: "8px 10px",
              borderRadius: 10,
              border: "1px solid #ddd",
              cursor: "pointer",
            }}
          >
            ◀
          </button>

          <div style={{ fontWeight: 900 }}>{title}</div>

          <button
            onClick={() => setMonth(addMonths(month, 1))}
            style={{
              padding: "8px 10px",
              borderRadius: 10,
              border: "1px solid #ddd",
              cursor: "pointer",
            }}
          >
            ▶
          </button>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, 1fr)",
            gap: 6,
            marginTop: 10,
          }}
        >
          {["日", "月", "火", "水", "木", "金", "土"].map((w) => (
            <div
              key={w}
              style={{ textAlign: "center", fontSize: 12, color: "#666", fontWeight: 800 }}
            >
              {w}
            </div>
          ))}

          {calendarCells.map((c, idx) => {
            const isSelected = c.value === date;
            const isEmpty = !c.value;

            return (
              <button
                key={idx}
                disabled={isEmpty}
                onClick={() => c.value && setDate(c.value)}
                style={{
                  height: 44,
                  borderRadius: 12,
                  border: isSelected ? "2px solid #1976d2" : "1px solid #eee",
                  background: isSelected ? "#e8f2ff" : isEmpty ? "transparent" : "#fff",
                  cursor: isEmpty ? "default" : "pointer",
                  fontWeight: isSelected ? 900 : 700,
                  color: isEmpty ? "transparent" : "#111",
                }}
              >
                {c.label || "0"}
              </button>
            );
          })}
        </div>

        <div style={{ marginTop: 10, fontSize: 12, color: "#666" }}>
          ※日付を選ぶと、その日の予約状況と残り台数が更新されます
        </div>
      </div>

      <div style={{ marginTop: 14, border: "1px solid #eee", borderRadius: 14, padding: 12 }}>
        <div style={{ fontWeight: 900, marginBottom: 10 }}>予約内容</div>

        <div style={{ display: "grid", gap: 10 }}>
          <div>
            <div style={{ fontSize: 12, color: "#666" }}>区画</div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(5, 1fr)",
                gap: 8,
                marginTop: 6,
              }}
            >
              {spots.map((s) => {
                const isSelected = spotId === s.id;

                return (
                  <button
                    key={s.id}
                    disabled={s.isReserved}
                    onClick={() => {
                      setSpotId(s.id);
                      setSpotCode(s.code);
                    }}
                    style={{
                      padding: "10px 0",
                      borderRadius: 12,
                      border: isSelected ? "2px solid #1976d2" : "1px solid #ddd",
                      background: s.isReserved ? "#f2f2f2" : isSelected ? "#e8f2ff" : "#fff",
                      color: s.isReserved ? "#999" : "#111",
                      fontWeight: 900,
                      cursor: s.isReserved ? "not-allowed" : "pointer",
                    }}
                    title={s.isReserved ? "予約済み" : "選択"}
                  >
                    {s.label || s.code}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 12, color: "#666" }}>名前（必須）</div>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{ width: "100%", padding: 12, borderRadius: 12, border: "1px solid #ddd" }}
              placeholder="例：阿部 龍昇"
            />
          </div>

          <div>
            <div style={{ fontSize: 12, color: "#666" }}>車両ナンバー（必須）</div>
            <input
              value={plate}
              onChange={(e) => setPlate(e.target.value)}
              style={{ width: "100%", padding: 12, borderRadius: 12, border: "1px solid #ddd" }}
              placeholder="例：宮城300 あ 1234"
            />
          </div>

          <div>
            <div style={{ fontSize: 12, color: "#666" }}>メール（任意：PIN送信先）</div>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{ width: "100%", padding: 12, borderRadius: 12, border: "1px solid #ddd" }}
              placeholder="例：test@example.com"
            />
          </div>

          <button
            onClick={submit}
            disabled={loading || !date || !spotId}
            style={{
              padding: "14px 12px",
              borderRadius: 14,
              border: "1px solid #ddd",
              fontWeight: 900,
              cursor: loading ? "wait" : "pointer",
              background: "#111",
              color: "#fff",
              opacity: loading ? 0.7 : 1,
            }}
          >
            この内容で予約する
          </button>

          {msg && (
            <div
              style={{
                whiteSpace: "pre-wrap",
                fontSize: 13,
                color: "#b00020",
                padding: 10,
                background: "#fff3f5",
                borderRadius: 12,
                border: "1px solid #ffd0d8",
              }}
            >
              {msg}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}