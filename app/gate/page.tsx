"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

type GateMode =
  | "loading"
  | "no_reservation"
  | "unpaid"
  | "need_pin_checkin"
  | "can_checkout"
  | "already_checked_out"
  | "error";

function normalizeSlot(input: string): string {
  if (!input) return input;
  const m = input.match(/^S(\d{1,2})$/i);
  if (!m) return input;
  return `S${String(Number(m[1])).padStart(2, "0")}`;
}

function useQuerySlot() {
  const [slot, setSlot] = useState<string>("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const s = normalizeSlot(params.get("slot") ?? "");
    setSlot(s);
  }, []);

  return slot;
}

export default function GatePage() {
  const slot = useQuerySlot();

  const [mode, setMode] = useState<GateMode>("loading");
  const [date, setDate] = useState<string>("");
  const [reservationId, setReservationId] = useState<string | null>(null);

  // PIN 4桁（下線4本を必ず出す）
  const [pinDigits, setPinDigits] = useState<string[]>(["", "", "", ""]);
  const pin = pinDigits.join("");

  const [busy, setBusy] = useState(false);
  const [errorText, setErrorText] = useState<string>("");

  // ✅ PINと同じくらい大きい完了メッセージ（alertは使わない）
  const [bigMessage, setBigMessage] = useState<string | null>(null);

  // 4つのinput参照（入力の自動移動用）
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);

  const canPressCheckin = useMemo(() => {
    return mode === "need_pin_checkin" && pinDigits.every((d) => d.length === 1);
  }, [mode, pinDigits]);

  async function fetchStatus() {
    if (!slot) return;
    setBusy(true);
    setErrorText("");
    try {
      const res = await fetch(`/api/gate-status?slot=${encodeURIComponent(slot)}`, {
        cache: "no-store",
      });

      // JSONじゃない(HTMLなど)が返ってきたときの保険
      const text = await res.text();
      let json: any;
      try {
        json = JSON.parse(text);
      } catch {
        setMode("error");
        setErrorText(`JSONではない応答が返りました。\n${text.slice(0, 200)}`);
        return;
      }

      if (!json.ok) {
        setMode("error");
        setErrorText(json.error ?? "status_error");
        return;
      }

      setMode(json.mode as GateMode);
      setDate(String(json.date ?? ""));
      setReservationId(json.reservationId ?? null);
    } catch (e: any) {
      setMode("error");
      setErrorText(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    fetchStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slot]);

  function setDigit(i: number, raw: string) {
    const d = raw.replace(/\D/g, "").slice(-1);
    setPinDigits((prev) => {
      const next = [...prev];
      next[i] = d;
      return next;
    });

    // 1文字入ったら次へ
    if (d && i < 3) {
      inputRefs.current[i + 1]?.focus();
    }
  }

  function onKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace") {
      if (!pinDigits[i] && i > 0) {
        inputRefs.current[i - 1]?.focus();
      }
    }
  }

  function clearPin() {
    setPinDigits(["", "", "", ""]);
    setTimeout(() => inputRefs.current[0]?.focus(), 0);
  }

  async function doCheckin() {
    if (!slot) return;
    if (!canPressCheckin) return;

    setBusy(true);
    setErrorText("");

    try {
      const res = await fetch("/api/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slot, pin }),
      });

      const json = await res.json();

      if (!json.ok) {
        setErrorText(json.message ?? json.error ?? "checkin_failed");
        return;
      }

      // ✅ 指定文言に固定
      setBigMessage("チェックイン完了\nコーンを車の前に戻してください");
      clearPin();
      await fetchStatus();
    } catch (e: any) {
      setErrorText(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  async function doCheckout() {
    if (!slot) return;

    setBusy(true);
    setErrorText("");

    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slot }),
      });

      const json = await res.json();

      if (!json.ok) {
        setErrorText(json.message ?? json.error ?? "checkout_failed");
        return;
      }

      // ✅ 指定文言に固定（ここを希望の文章に）
      setBigMessage("出庫完了\nコーンを元の位置に戻してください。\nご利用ありがとうございました。");
      await fetchStatus();
    } catch (e: any) {
      setErrorText(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  const title = slot ? `区画 ${slot}` : "区画";

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        justifyContent: "center",
        padding: 16,
        fontFamily: "system-ui",
        background: "#fff",
      }}
    >
      {/* ✅ 大きいメッセージ（PIN級の大きさ） */}
      {bigMessage && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.60)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            zIndex: 9999,
          }}
          onClick={() => setBigMessage(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(640px, 100%)",
              background: "#fff",
              borderRadius: 20,
              padding: 22,
              boxShadow: "0 12px 50px rgba(0,0,0,0.25)",
              textAlign: "center",
            }}
          >
            <div
              style={{
                fontSize: 44,
                fontWeight: 900,
                lineHeight: 1.25,
                whiteSpace: "pre-line",
              }}
            >
              {bigMessage}
            </div>

            <button
              onClick={() => setBigMessage(null)}
              style={{
                marginTop: 18,
                width: "100%",
                padding: "16px 14px",
                borderRadius: 14,
                border: "1px solid #111",
                background: "#111",
                color: "#fff",
                fontSize: 20,
                fontWeight: 900,
                cursor: "pointer",
              }}
            >
              OK
            </button>
          </div>
        </div>
      )}

      <div style={{ width: "min(720px, 100%)", textAlign: "center" }}>
        <div style={{ color: "#777", fontWeight: 800, marginTop: 10 }}>ParkTech</div>

        <div style={{ marginTop: 10, fontSize: 48, fontWeight: 900 }}>{title}</div>
        <div style={{ marginTop: 6, fontSize: 14, color: "#666" }}>入庫・出庫 共通QR</div>

        {errorText && (
          <div
            style={{
              margin: "14px auto 0",
              maxWidth: 560,
              padding: 12,
              borderRadius: 14,
              border: "1px solid #ffd0d8",
              background: "#fff3f5",
              color: "#b00020",
              fontWeight: 800,
              whiteSpace: "pre-wrap",
            }}
          >
            {errorText}
          </div>
        )}

        <div style={{ marginTop: 18 }}>
          {mode === "loading" && <div style={{ color: "#666" }}>読み込み中...</div>}

          {mode === "no_reservation" && (
            <div style={{ marginTop: 18 }}>
              <div style={{ fontSize: 18, fontWeight: 900 }}>予約がありません</div>
              <div style={{ marginTop: 10, color: "#666" }}>
                予約なし入庫の場合は、支払い案内に従って手続きしてください
              </div>

              <a
                href="/reserve"
                style={{
                  display: "inline-block",
                  marginTop: 16,
                  padding: "16px 18px",
                  borderRadius: 14,
                  border: "1px solid #111",
                  background: "#111",
                  color: "#fff",
                  fontWeight: 900,
                  textDecoration: "none",
                }}
              >
                支払い・予約へ進む
              </a>
            </div>
          )}

          {mode === "unpaid" && (
            <div style={{ marginTop: 18 }}>
              <div style={{ fontSize: 18, fontWeight: 900 }}>未決済です</div>
              <div style={{ marginTop: 10, color: "#666" }}>
                お支払い完了後にチェックインできます
              </div>

              <a
                href="/reserve"
                style={{
                  display: "inline-block",
                  marginTop: 16,
                  padding: "16px 18px",
                  borderRadius: 14,
                  border: "1px solid #111",
                  background: "#111",
                  color: "#fff",
                  fontWeight: 900,
                  textDecoration: "none",
                }}
              >
                支払いへ進む
              </a>
            </div>
          )}

          {mode === "need_pin_checkin" && (
            <div style={{ marginTop: 22 }}>
              {/* ✅ 四角枠 + 4本線（必ず枠内に収める） */}
              <div
                style={{
                  border: "3px solid #0b4ea2",
                  borderRadius: 16,
                  padding: "18px 16px",
                  maxWidth: 560,
                  margin: "0 auto",
                  boxSizing: "border-box",
                  overflow: "hidden", // ← はみ出し防止
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 900, color: "#333" }}>
                  4桁コードを入力
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(4, 1fr)",
                    gap: 14,
                    marginTop: 18,
                    alignItems: "end",
                    width: "100%",
                    boxSizing: "border-box",
                  }}
                >
                  {pinDigits.map((v, i) => (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        width: "100%",
                        minWidth: 0, // ← これがないと横に押し出されることがある
                      }}
                    >
                      <input
                        ref={(el) => {
                          inputRefs.current[i] = el;
                        }}
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={1}
                        value={v}
                        onChange={(e) => setDigit(i, e.target.value)}
                        onKeyDown={(e) => onKeyDown(i, e)}
                        style={{
                          width: "100%",
                          minWidth: 0,
                          textAlign: "center",
                          fontSize: 46,
                          fontWeight: 900,
                          border: "none",
                          outline: "none",
                          background: "transparent",
                          padding: "6px 0",
                          boxSizing: "border-box",
                        }}
                      />

                      {/* ✅ 4本線（枠から絶対はみ出さない） */}
                      <div
                        style={{
                          width: "100%",
                          maxWidth: "100%",
                          height: 3,
                          background: "#999",
                          borderRadius: 2,
                          marginTop: 6,
                          boxSizing: "border-box",
                        }}
                      />
                    </div>
                  ))}
                </div>

                <div style={{ marginTop: 10, fontSize: 12, color: "#666" }}>
                  ※予約時の4桁コード
                </div>
              </div>

              {/* ✅ 4桁揃うまで押せない */}
              <button
                onClick={doCheckin}
                disabled={!canPressCheckin || busy}
                style={{
                  marginTop: 18,
                  width: "min(560px, 100%)",
                  padding: "18px 18px",
                  borderRadius: 16,
                  border: "1px solid #0b4ea2",
                  background: canPressCheckin ? "#0b4ea2" : "#b9c9e2",
                  color: "#fff",
                  fontSize: 22,
                  fontWeight: 900,
                  cursor: canPressCheckin && !busy ? "pointer" : "not-allowed",
                }}
              >
                チェックイン
              </button>
            </div>
          )}

          {mode === "can_checkout" && (
            <div style={{ marginTop: 22 }}>
              <button
                onClick={doCheckout}
                disabled={busy}
                style={{
                  width: "min(560px, 100%)",
                  padding: "18px 18px",
                  borderRadius: 16,
                  border: "1px solid #111",
                  background: "#111",
                  color: "#fff",
                  fontSize: 22,
                  fontWeight: 900,
                  cursor: busy ? "wait" : "pointer",
                }}
              >
                出庫する
              </button>
            </div>
          )}

          {mode === "already_checked_out" && (
            <div style={{ marginTop: 18 }}>
              <div style={{ fontSize: 18, fontWeight: 900 }}>出庫済み</div>
              <div style={{ marginTop: 10, color: "#666", whiteSpace: "pre-line" }}>
                {"コーンを元の位置に戻してください。\nご利用ありがとうございました。"}
              </div>
            </div>
          )}
        </div>

        <div style={{ marginTop: 18 }}>
          <button
            onClick={fetchStatus}
            disabled={busy || !slot}
            style={{
              padding: "10px 14px",
              borderRadius: 12,
              border: "1px solid #ddd",
              background: "#fff",
              cursor: busy ? "wait" : "pointer",
              fontWeight: 900,
            }}
          >
            状態を更新
          </button>
        </div>

        {/* デバッグ表示：不要なら削除OK */}
        <div style={{ marginTop: 14, fontSize: 11, color: "#999" }}>
          {slot ? `slot=${slot}` : "slotが指定されていません"}
          {date ? ` / date=${date}` : ""}
          {reservationId ? ` / reservation=${reservationId}` : ""}
        </div>
      </div>
    </div>
  );
}