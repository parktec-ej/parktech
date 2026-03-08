"use client";

import { useEffect, useMemo, useState } from "react";

const TOTAL_SLOTS = 20;
const SLOTS = Array.from({ length: TOTAL_SLOTS }).map(
  (_, i) => `S${String(i + 1).padStart(2, "0")}`
);

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
  // カレンダー表示の月
  const [month, setMonth] = useState<Date>(() => startOfMonth(new Date()));
  // 選択日（YYYY-MM-DD）
  const [date, setDate] = useState<string>(() => ymd(new Date()));

  // 予約フォーム
  const [slot, setSlot] = useState<string>("S01");
  const [name, setName] = useState("");
  const [plate, setPlate] = useState("");
  const [email, setEmail] = useState("");

  // 予約状況
  const [reserved, setReserved] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string>("");

  // 成功モーダル（PIN大表示）
  const [success, setSuccess] = useState<null | {
    pin: string;
    price: number;
    slot: string;
    date: string;
  }>(null);

  const remaining = TOTAL_SLOTS - reserved.size;

  // 選択日が変わったら予約済みslotを取得
  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoading(true);
      setMsg("");
      try {
        const res = await fetch(`/api/reservations?date=${encodeURIComponent(date)}`, {
          cache: "no-store",
        });
        const json = await res.json();

        if (!json.ok) {
          if (!cancelled) setMsg(`取得エラー: ${json.error ?? "unknown"}`);
          return;
        }

        const set = new Set<string>((json.reservedSlots ?? []).map((s: string) => String(s)));

        if (!cancelled) {
          setReserved(set);

          // 選択中slotが予約済なら先頭の空きに自動調整
          if (set.has(slot)) {
            const firstFree = SLOTS.find((s) => !set.has(s));
            if (firstFree) setSlot(firstFree);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  // カレンダーの表示用（その月のマスを作る）
  const calendarCells = useMemo(() => {
    const first = startOfMonth(month);
    const firstWeekday = first.getDay(); // 0=日
    const dim = daysInMonth(month);

    const cells: Array<{ label: string; value: string | null }> = [];
    // 前の空白
    for (let i = 0; i < firstWeekday; i++) cells.push({ label: "", value: null });
    // 当月日付
    for (let day = 1; day <= dim; day++) {
      const d = new Date(month.getFullYear(), month.getMonth(), day);
      cells.push({ label: String(day), value: ymd(d) });
    }
    // 週の端を揃える
    while (cells.length % 7 !== 0) cells.push({ label: "", value: null });
    return cells;
  }, [month]);

  async function refreshReserved(ymdStr: string) {
    const res = await fetch(`/api/reservations?date=${encodeURIComponent(ymdStr)}`, {
      cache: "no-store",
    });
    const json = await res.json();
    if (json.ok) {
      setReserved(new Set((json.reservedSlots ?? []).map((s: string) => String(s))));
    }
  }

  async function submit() {
    setMsg("");

    if (!date) return setMsg("日付を選んでください");
    if (!slot) return setMsg("区画を選んでください");
    if (!name.trim()) return setMsg("名前を入力してください");
    if (!plate.trim()) return setMsg("車両ナンバーを入力してください");

    if (reserved.has(slot)) {
      return setMsg("その区画は予約済みです。別の区画を選んでください。");
    }

    setLoading(true);
    try {
      const res = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          slot,
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

      // 成功モーダルへ（PINを大表示）
      setSuccess({
        pin: String(json.pin),
        price: Number(json.price),
        slot,
        date,
      });

      // 予約状況を再取得
      await refreshReserved(date);
    } catch (e: any) {
      setMsg(`予約失敗: ${String(e?.message ?? e)}`);
    } finally {
      setLoading(false);
    }
  }

  const title = `${month.getFullYear()}年${month.getMonth() + 1}月`;

  return (
    <div style={{ maxWidth: 560, margin: "24px auto", padding: 16, fontFamily: "system-ui" }}>
      {/* 成功モーダル */}
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
              区画：{success.slot}　/　日付：{success.date}　/　料金：{success.price}円
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
              <button
                onClick={() => {
                  window.location.href = `/gate?slot=${encodeURIComponent(success.slot)}`;
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

      {/* 残り表示 */}
      <div
        style={{
          border: "1px solid #eee",
          borderRadius: 14,
          padding: 12,
          background: "#fafafa",
          marginBottom: 14,
        }}
      >
        <div style={{ fontWeight: 900, fontSize: 18 }}>
          残り {remaining} / {TOTAL_SLOTS}
          {loading ? "（更新中）" : ""}
        </div>
        <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>選択日：{date}</div>
      </div>

      {/* カレンダー */}
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

      {/* 予約フォーム */}
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
              {SLOTS.map((s) => {
                const isReserved = reserved.has(s);
                const isSelected = slot === s;

                return (
                  <button
                    key={s}
                    disabled={isReserved}
                    onClick={() => setSlot(s)}
                    style={{
                      padding: "10px 0",
                      borderRadius: 12,
                      border: isSelected ? "2px solid #1976d2" : "1px solid #ddd",
                      background: isReserved ? "#f2f2f2" : isSelected ? "#e8f2ff" : "#fff",
                      color: isReserved ? "#999" : "#111",
                      fontWeight: 900,
                      cursor: isReserved ? "not-allowed" : "pointer",
                    }}
                    title={isReserved ? "予約済み" : "選択"}
                  >
                    {s}
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
            disabled={loading || !date || !slot || reserved.has(slot)}
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