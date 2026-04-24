"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function normalizeDate(input: string) {
  const value = String(input ?? "").trim();
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  if (/^\d{8}$/.test(value)) {
    return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  }
  return value;
}

function normalizeSlot(input: string) {
  return String(input ?? "").trim().toUpperCase();
}

function normalizePhone(input: string) {
  return String(input ?? "").replace(/[^\d]/g, "");
}

function ymdTodayJst() {
  return new Date().toLocaleDateString("sv-SE", {
    timeZone: "Asia/Tokyo",
  });
}

function HourlyStartPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const placeId = String(searchParams.get("placeId") ?? "").trim();
  const slot = normalizeSlot(searchParams.get("slot") ?? "");
  const date = normalizeDate(searchParams.get("date") ?? ymdTodayJst());

  const gateUrl = `/gate?placeId=${encodeURIComponent(placeId)}&slot=${encodeURIComponent(slot)}&date=${encodeURIComponent(date)}`;
  const hourlyCheckoutUrl = `/hourly-checkout?placeId=${encodeURIComponent(placeId)}&slot=${encodeURIComponent(slot)}&date=${encodeURIComponent(date)}`;

  const [plate, setPlate] = useState("");
  const [phone, setPhone] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [message, setMessage] = useState("");

  const canSubmit = useMemo(() => {
    return (
      !!placeId &&
      !!slot &&
      !!date &&
      !!plate.trim() &&
      normalizePhone(phone).length >= 10
    );
  }, [placeId, slot, date, plate, phone]);

  async function handleStart() {
    if (!canSubmit || loading) return;

    setLoading(true);
    setMessage("");

    try {
      const res = await fetch("/api/hourly-start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          placeId,
          slot,
          date,
          plate: plate.trim(),
          phone: normalizePhone(phone),
          customerName: customerName.trim() || null,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setMessage(data?.message || "入庫開始に失敗しました");
        setLoading(false);
        return;
      }

      setDone(true);
      setLoading(false);
    } catch (e) {
      setMessage("通信エラーが発生しました");
      setLoading(false);
    }
  }

  return (
    <main style={pageStyle}>
      <div style={titleStyle}>時間貸し入庫</div>

      <div style={cardStyle}>
        <div style={infoRowStyle}>場所: {placeId || "-"}</div>
        <div style={infoRowStyle}>区画: {slot || "-"}</div>
        <div style={infoRowStyle}>日付: {date || "-"}</div>
      </div>

      {done ? (
        <div style={cardStyle}>
          <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 12 }}>
            入庫を受け付けました。
          </div>
          <div style={infoRowStyle}>場所: {placeId}</div>
          <div style={infoRowStyle}>区画: {slot}</div>
          <div style={infoRowStyle}>日付: {date}</div>
          <div style={infoRowStyle}>車番: {plate}</div>
          <div style={infoRowStyle}>電話: {normalizePhone(phone)}</div>
          {customerName.trim() ? (
            <div style={infoRowStyle}>氏名: {customerName.trim()}</div>
          ) : null}

          <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
            <button
              type="button"
              onClick={() => router.push(hourlyCheckoutUrl)}
              style={primaryButtonStyle}
            >
              精算画面へ
            </button>

            <button
              type="button"
              onClick={() => router.push(gateUrl)}
              style={secondaryButtonStyle}
            >
              gateへ戻る
            </button>
          </div>
        </div>
      ) : (
        <>
          <label style={labelStyle}>
            <div style={labelTextStyle}>車番（必須）</div>
            <input
              value={plate}
              onChange={(e) => setPlate(e.target.value)}
              placeholder="例: 宮城300 あ 1234"
              style={inputStyle}
            />
          </label>

          <label style={labelStyle}>
            <div style={labelTextStyle}>電話番号（必須）</div>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
              placeholder="例: 09012345678"
              style={inputStyle}
            />
          </label>

          <label style={labelStyle}>
            <div style={labelTextStyle}>氏名（任意）</div>
            <input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="例: 阿部龍昇"
              style={inputStyle}
            />
          </label>

          <div style={noticeStyle}>
            出庫時に精算が必要です。未精算の場合はご連絡することがあります。
          </div>

          {message ? <div style={errorStyle}>{message}</div> : null}

          <button
            type="button"
            onClick={handleStart}
            disabled={!canSubmit || loading}
            style={{
              ...primaryButtonStyle,
              opacity: !canSubmit || loading ? 0.5 : 1,
              cursor: !canSubmit || loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "送信中..." : "入庫する"}
          </button>

          <button
            type="button"
            onClick={() => router.push(gateUrl)}
            style={{ ...secondaryButtonStyle, marginTop: 12 }}
          >
            gateへ戻る
          </button>
        </>
      )}
    </main>
  );
}

export default function HourlyStartPage() {
  return (
    <Suspense fallback={<main style={pageStyle}>読み込み中...</main>}>
      <HourlyStartPageInner />
    </Suspense>
  );
}

const pageStyle: React.CSSProperties = {
  maxWidth: 560,
  margin: "0 auto",
  padding: 24,
};

const titleStyle: React.CSSProperties = {
  fontSize: 28,
  fontWeight: 900,
  marginBottom: 20,
};

const cardStyle: React.CSSProperties = {
  border: "1px solid #222",
  borderRadius: 8,
  padding: 16,
  marginBottom: 16,
  background: "#fff",
};

const infoRowStyle: React.CSSProperties = {
  fontSize: 18,
  lineHeight: 1.9,
};

const labelStyle: React.CSSProperties = {
  display: "block",
  marginBottom: 12,
};

const labelTextStyle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 700,
  marginBottom: 8,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 44,
  borderRadius: 8,
  border: "1px solid #999",
  padding: "0 12px",
  fontSize: 18,
  background: "#fff",
};

const noticeStyle: React.CSSProperties = {
  border: "1px solid #f59e0b",
  background: "#fffbeb",
  color: "#92400e",
  borderRadius: 8,
  padding: 12,
  marginBottom: 12,
  lineHeight: 1.7,
};

const errorStyle: React.CSSProperties = {
  border: "1px solid #fca5a5",
  background: "#fef2f2",
  color: "#b91c1c",
  borderRadius: 8,
  padding: 12,
  marginBottom: 12,
};

const primaryButtonStyle: React.CSSProperties = {
  width: "100%",
  height: 48,
  borderRadius: 8,
  border: "1px solid #111",
  background: "#111",
  color: "#fff",
  fontSize: 18,
  fontWeight: 800,
};

const secondaryButtonStyle: React.CSSProperties = {
  width: "100%",
  height: 44,
  borderRadius: 8,
  border: "1px solid #ccc",
  background: "#fff",
  color: "#111",
  fontSize: 18,
  fontWeight: 700,
};