"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

const PLACE_ID = "e24a57f5-787f-4c2e-9394-e5f54053a955";

function ymdTodayJst() {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}

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

type GateStatusResponse = {
  ok: boolean;
  mode?:
    | "no_reservation"
    | "unpaid"
    | "need_pin_checkin"
    | "can_checkout"
    | "already_checked_out"
    | "can_start_hourly"
    | "can_checkout_hourly";
  effectiveOperationMode?:
    | "RESERVATION_ONLY"
    | "HOURLY_ONLY"
    | "RESERVATION_THEN_HOURLY";
  placeOperationMode?:
    | "RESERVATION_ONLY"
    | "HOURLY_ONLY"
    | "RESERVATION_THEN_HOURLY";
  spotOperationModeOverride?:
    | "RESERVATION_ONLY"
    | "HOURLY_ONLY"
    | "RESERVATION_THEN_HOURLY"
    | null;
  slot?: string;
  date?: string;
  placeId?: string;
  spotId?: string;
  reservationId?: string;
  sessionId?: string;
  checkedInAt?: string;
  error?: string;
  message?: string;
};

export default function GatePage() {
  const params = useSearchParams();

  const slot = useMemo(
    () => normalizeSlot(params.get("slot") ?? "A-01"),
    [params]
  );
  const date = useMemo(() => params.get("date") ?? ymdTodayJst(), [params]);

  const [status, setStatus] = useState<GateStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [pin, setPin] = useState("");
  const [plate, setPlate] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);

  async function loadStatus() {
    setLoading(true);
    setMsg("");

    try {
      const res = await fetch(
        `/api/gate-status?placeId=${encodeURIComponent(
          PLACE_ID
        )}&slot=${encodeURIComponent(slot)}&date=${encodeURIComponent(date)}`,
        { cache: "no-store" }
      );
      const json = await res.json();
      setStatus(json);
    } catch (e: any) {
      setMsg(`取得エラー: ${String(e?.message ?? e)}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStatus();
  }, [slot, date]);

  async function doCheckin() {
    setBusy(true);
    setMsg("");
    setResult(null);

    try {
      const res = await fetch("/api/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slot, date, pin }),
      });
      const json = await res.json();

      if (!json.ok) {
        setMsg(json.message ?? json.error ?? "チェックイン失敗");
        return;
      }

      setResult(json);
      setPin("");
      await loadStatus();
    } catch (e: any) {
      setMsg(`チェックイン失敗: ${String(e?.message ?? e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function doReservationCheckout() {
    setBusy(true);
    setMsg("");
    setResult(null);

    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slot, date }),
      });
      const json = await res.json();

      if (!json.ok) {
        setMsg(json.message ?? json.error ?? "出庫失敗");
        return;
      }

      setResult(json);
      await loadStatus();
    } catch (e: any) {
      setMsg(`出庫失敗: ${String(e?.message ?? e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function doHourlyStart() {
    setBusy(true);
    setMsg("");
    setResult(null);

    try {
      const res = await fetch("/api/hourly-start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          placeId: PLACE_ID,
          slot,
          date,
          plate: plate.trim() || null,
        }),
      });
      const json = await res.json();

      if (!json.ok) {
        setMsg(json.message ?? json.error ?? "時間貸し入庫失敗");
        return;
      }

      setResult(json);
      setPlate("");
      await loadStatus();
    } catch (e: any) {
      setMsg(`時間貸し入庫失敗: ${String(e?.message ?? e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function doHourlyCheckout() {
    setBusy(true);
    setMsg("");
    setResult(null);

    try {
      const res = await fetch("/api/hourly-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          placeId: PLACE_ID,
          slot,
          date,
        }),
      });
      const json = await res.json();

      if (!json.ok) {
        setMsg(json.message ?? json.error ?? "時間貸し出庫失敗");
        return;
      }

      setResult(json);
      await loadStatus();
    } catch (e: any) {
      setMsg(`時間貸し出庫失敗: ${String(e?.message ?? e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        maxWidth: 560,
        margin: "24px auto",
        padding: 16,
        fontFamily: "system-ui",
      }}
    >
      <h1 style={{ fontSize: 24, fontWeight: 900, marginBottom: 8 }}>
        ゲート案内
      </h1>

      <div
        style={{
          border: "1px solid #eee",
          borderRadius: 14,
          padding: 12,
          background: "#fafafa",
          marginBottom: 14,
        }}
      >
        <div style={{ fontWeight: 900 }}>区画：{slot}</div>
        <div style={{ fontSize: 13, color: "#666", marginTop: 4 }}>
          日付：{date}
        </div>
        <div style={{ fontSize: 13, color: "#666", marginTop: 4 }}>
          Place ID：{PLACE_ID}
        </div>
        <div style={{ fontSize: 13, color: "#666", marginTop: 4 }}>
          実効モード：
          <b style={{ marginLeft: 4 }}>
            {status?.effectiveOperationMode ?? "-"}
          </b>
        </div>
        <div style={{ fontSize: 13, color: "#666", marginTop: 4 }}>
          Place基本モード：
          <b style={{ marginLeft: 4 }}>
            {status?.placeOperationMode ?? "-"}
          </b>
        </div>
        <div style={{ fontSize: 13, color: "#666", marginTop: 4 }}>
          Spot上書き：
          <b style={{ marginLeft: 4 }}>
            {status?.spotOperationModeOverride ?? "継承"}
          </b>
        </div>
      </div>

      {loading ? (
        <div
          style={{
            border: "1px solid #eee",
            borderRadius: 14,
            padding: 16,
            background: "#fff",
          }}
        >
          読み込み中...
        </div>
      ) : (
        <>
          <div
            style={{
              border: "1px solid #eee",
              borderRadius: 14,
              padding: 16,
              background: "#fff",
            }}
          >
            <div style={{ fontWeight: 900, marginBottom: 10 }}>現在の判定</div>

            <div
              style={{
                fontSize: 18,
                fontWeight: 900,
                color: "#111",
                marginBottom: 8,
              }}
            >
              {status?.mode ?? status?.error ?? "unknown"}
            </div>

            {status?.mode === "no_reservation" && (
              <div style={{ color: "#444", lineHeight: 1.7 }}>
                この区画に予約はありません。
                <br />
                予約専用モードなら利用できません。
              </div>
            )}

            {status?.mode === "unpaid" && (
              <div style={{ color: "#444", lineHeight: 1.7 }}>
                予約はありますが、まだ未決済です。
              </div>
            )}

            {status?.mode === "need_pin_checkin" && (
              <div style={{ color: "#444", lineHeight: 1.7 }}>
                予約があります。PINを入力してチェックインしてください。
              </div>
            )}

            {status?.mode === "can_checkout" && (
              <div style={{ color: "#444", lineHeight: 1.7 }}>
                予約利用中です。出庫処理へ進めます。
              </div>
            )}

            {status?.mode === "already_checked_out" && (
              <div style={{ color: "#444", lineHeight: 1.7 }}>
                この予約はすでに出庫済みです。
              </div>
            )}

            {status?.mode === "can_start_hourly" && (
              <div style={{ color: "#444", lineHeight: 1.7 }}>
                この区画は時間貸しで利用可能です。
              </div>
            )}

            {status?.mode === "can_checkout_hourly" && (
              <div style={{ color: "#444", lineHeight: 1.7 }}>
                この区画は時間貸し利用中です。精算して出庫できます。
              </div>
            )}
          </div>

          {status?.mode === "need_pin_checkin" && (
            <div
              style={{
                marginTop: 14,
                border: "1px solid #eee",
                borderRadius: 14,
                padding: 16,
                background: "#fff",
              }}
            >
              <div style={{ fontWeight: 900, marginBottom: 10 }}>
                PINチェックイン
              </div>

              <input
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="4桁PIN"
                style={{
                  width: "100%",
                  padding: 12,
                  borderRadius: 12,
                  border: "1px solid #ddd",
                  marginBottom: 10,
                }}
              />

              <button
                onClick={doCheckin}
                disabled={busy || !pin.trim()}
                style={{
                  width: "100%",
                  padding: "14px 12px",
                  borderRadius: 14,
                  border: "1px solid #111",
                  background: "#111",
                  color: "#fff",
                  fontWeight: 900,
                  cursor: busy ? "wait" : "pointer",
                  opacity: busy ? 0.7 : 1,
                }}
              >
                PINでチェックイン
              </button>
            </div>
          )}

          {status?.mode === "can_checkout" && (
            <div
              style={{
                marginTop: 14,
                border: "1px solid #eee",
                borderRadius: 14,
                padding: 16,
                background: "#fff",
              }}
            >
              <div style={{ fontWeight: 900, marginBottom: 10 }}>
                予約出庫
              </div>

              <button
                onClick={doReservationCheckout}
                disabled={busy}
                style={{
                  width: "100%",
                  padding: "14px 12px",
                  borderRadius: 14,
                  border: "1px solid #111",
                  background: "#111",
                  color: "#fff",
                  fontWeight: 900,
                  cursor: busy ? "wait" : "pointer",
                  opacity: busy ? 0.7 : 1,
                }}
              >
                出庫する
              </button>
            </div>
          )}

          {status?.mode === "can_start_hourly" && (
            <div
              style={{
                marginTop: 14,
                border: "1px solid #eee",
                borderRadius: 14,
                padding: 16,
                background: "#fff",
              }}
            >
              <div style={{ fontWeight: 900, marginBottom: 10 }}>
                時間貸し入庫
              </div>

              <input
                value={plate}
                onChange={(e) => setPlate(e.target.value)}
                placeholder="車両ナンバー（任意）"
                style={{
                  width: "100%",
                  padding: 12,
                  borderRadius: 12,
                  border: "1px solid #ddd",
                  marginBottom: 10,
                }}
              />

              <button
                onClick={doHourlyStart}
                disabled={busy}
                style={{
                  width: "100%",
                  padding: "14px 12px",
                  borderRadius: 14,
                  border: "1px solid #111",
                  background: "#111",
                  color: "#fff",
                  fontWeight: 900,
                  cursor: busy ? "wait" : "pointer",
                  opacity: busy ? 0.7 : 1,
                }}
              >
                時間貸しで入庫する
              </button>
            </div>
          )}

          {status?.mode === "can_checkout_hourly" && (
            <div
              style={{
                marginTop: 14,
                border: "1px solid #eee",
                borderRadius: 14,
                padding: 16,
                background: "#fff",
              }}
            >
              <div style={{ fontWeight: 900, marginBottom: 10 }}>
                時間貸し出庫
              </div>

              <button
                onClick={doHourlyCheckout}
                disabled={busy}
                style={{
                  width: "100%",
                  padding: "14px 12px",
                  borderRadius: 14,
                  border: "1px solid #111",
                  background: "#111",
                  color: "#fff",
                  fontWeight: 900,
                  cursor: busy ? "wait" : "pointer",
                  opacity: busy ? 0.7 : 1,
                }}
              >
                精算して出庫する
              </button>
            </div>
          )}

          {msg && (
            <div
              style={{
                marginTop: 14,
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

          {result && (
            <div
              style={{
                marginTop: 14,
                whiteSpace: "pre-wrap",
                fontSize: 13,
                color: "#111",
                padding: 12,
                background: "#f6f8fa",
                borderRadius: 12,
                border: "1px solid #e5e7eb",
              }}
            >
              <div style={{ fontWeight: 900, marginBottom: 8 }}>結果</div>
              <pre style={{ margin: 0, overflowX: "auto" }}>
                {JSON.stringify(result, null, 2)}
              </pre>
            </div>
          )}
        </>
      )}
    </div>
  );
}