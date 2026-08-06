"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

// 事前決済で選べる時間。API 側の ALLOWED_MINUTES と揃えること。
const DURATION_OPTIONS = [
  { minutes: 60, label: "1時間" },
  { minutes: 120, label: "2時間" },
  { minutes: 180, label: "3時間" },
  { minutes: 240, label: "4時間" },
  { minutes: 300, label: "5時間" },
  { minutes: 360, label: "6時間" },
  { minutes: 1440, label: "24時間" },
];

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
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}

// 時間貸し料金。100円/時の切り上げ、日額上限あり。
// lib/pricing-core.ts の calcHourlyFee と同じ計算。表示用の概算。
function calcFee(
  minutes: number,
  hourlyYen: number,
  dailyYen: number | null
): number {
  const totalHours = Math.ceil(minutes / 60);
  if (!dailyYen) return totalHours * hourlyYen;
  const days = Math.floor(totalHours / 24);
  const remainingHours = totalHours % 24;
  const remainingFee = Math.min(remainingHours * hourlyYen, dailyYen);
  return days * dailyYen + remainingFee;
}

function formatLimit(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function HourlyPrepaidInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const placeId = String(searchParams.get("placeId") ?? "").trim();
  const slot = normalizeSlot(searchParams.get("slot") ?? "");
  const date = normalizeDate(searchParams.get("date") ?? ymdTodayJst());

  const gateUrl = `/gate?placeId=${encodeURIComponent(
    placeId
  )}&slot=${encodeURIComponent(slot)}&date=${encodeURIComponent(date)}`;

  const [plate, setPlate] = useState("");
  const [phone, setPhone] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [minutes, setMinutes] = useState<number | null>(null);

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [placeName, setPlaceName] = useState("");
  const [hourlyYen, setHourlyYen] = useState<number | null>(null);
  const [dailyYen, setDailyYen] = useState<number | null>(null);
  const [limitMinutes, setLimitMinutes] = useState<number | null>(null);
  const [limitAt, setLimitAt] = useState<string | null>(null);
  const [hasReservationLimit, setHasReservationLimit] = useState(false);

  useEffect(() => {
    if (!placeId || !slot) return;
    const qs = new URLSearchParams({ placeId, slot, date });
    fetch(`/api/gate-status?${qs.toString()}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (j?.placeName) setPlaceName(j.placeName);
        if (typeof j?.hourlyYen === "number") setHourlyYen(j.hourlyYen);
        if (typeof j?.dailyYen === "number") setDailyYen(j.dailyYen);
        if (typeof j?.prepaidLimitMinutes === "number") {
          setLimitMinutes(j.prepaidLimitMinutes);
        }
        if (typeof j?.prepaidLimitAt === "string") setLimitAt(j.prepaidLimitAt);
        setHasReservationLimit(Boolean(j?.exitDeadlineDate));
      })
      .catch(() => {});
  }, [placeId, slot, date]);

  const canSubmit = useMemo(() => {
    return (
      !!placeId &&
      !!slot &&
      !!date &&
      !!plate.trim() &&
      normalizePhone(phone).length >= 10 &&
      minutes != null
    );
  }, [placeId, slot, date, plate, phone, minutes]);

  async function handleSubmit() {
    if (!canSubmit || loading) return;

    setLoading(true);
    setMessage("");

    try {
      const res = await fetch("/api/hourly-prepaid/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          placeId,
          slot,
          date,
          plate: plate.trim(),
          phone: normalizePhone(phone),
          customerName: customerName.trim() || null,
          minutes,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.checkoutUrl) {
        setMessage(data?.message || "決済画面の準備に失敗しました");
        setLoading(false);
        return;
      }

      window.location.href = data.checkoutUrl;
    } catch {
      setMessage("通信エラーが発生しました");
      setLoading(false);
    }
  }

  const selectedFee =
    minutes != null && hourlyYen != null
      ? calcFee(minutes, hourlyYen, dailyYen)
      : null;

  return (
    <main style={pageStyle}>
      <div style={titleStyle}>時間貸し入庫</div>

      <div style={cardStyle}>
        <div style={infoRowStyle}>場所: {placeName || placeId || "-"}</div>
        <div style={infoRowStyle}>区画: {slot || "-"}</div>
        <div style={infoRowStyle}>日付: {date || "-"}</div>
      </div>

      {hasReservationLimit && limitAt ? (
        <div style={noticeStyle}>
          この区画には後続のご予約があるため、
          <strong>{formatLimit(limitAt)}</strong> までのご利用となります。
        </div>
      ) : null}

      <div style={sectionTitleStyle}>駐車時間を選んでください</div>

      <div style={gridStyle}>
        {DURATION_OPTIONS.map((opt) => {
          const overLimit =
            limitMinutes != null && opt.minutes > limitMinutes;
          const fee =
            hourlyYen != null ? calcFee(opt.minutes, hourlyYen, dailyYen) : null;
          const selected = minutes === opt.minutes;

          return (
            <button
              key={opt.minutes}
              type="button"
              disabled={overLimit}
              onClick={() => setMinutes(opt.minutes)}
              style={{
                ...durationButtonStyle,
                ...(selected ? durationSelectedStyle : {}),
                ...(overLimit ? durationDisabledStyle : {}),
              }}
            >
              <div style={{ fontSize: 18, fontWeight: 800 }}>{opt.label}</div>
              <div style={{ fontSize: 14, marginTop: 4 }}>
                {overLimit
                  ? "選択できません"
                  : fee != null
                  ? `${fee.toLocaleString()}円`
                  : "-"}
              </div>
            </button>
          );
        })}
      </div>

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
          placeholder="例: 山田 太郎"
          style={inputStyle}
        />
      </label>

      <div style={noticeStyle}>
        お支払いは前払いです。ご出庫が早まった場合の払い戻しはございません。
        出庫期限を過ぎますと超過料金が発生します。
      </div>

      {message ? <div style={errorStyle}>{message}</div> : null}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={!canSubmit || loading}
        style={{
          ...primaryButtonStyle,
          opacity: !canSubmit || loading ? 0.5 : 1,
          cursor: !canSubmit || loading ? "not-allowed" : "pointer",
        }}
      >
        {loading
          ? "準備中..."
          : selectedFee != null
          ? `${selectedFee.toLocaleString()}円を支払って入庫`
          : "駐車時間を選んでください"}
      </button>

      <button
        type="button"
        onClick={() => router.push(gateUrl)}
        style={{ ...secondaryButtonStyle, marginTop: 12 }}
      >
        gateへ戻る
      </button>
    </main>
  );
}

export default function HourlyPrepaidPage() {
  return (
    <Suspense fallback={<main style={pageStyle}>読み込み中...</main>}>
      <HourlyPrepaidInner />
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

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 800,
  marginBottom: 12,
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, 1fr)",
  gap: 8,
  marginBottom: 20,
};

const durationButtonStyle: React.CSSProperties = {
  border: "1px solid #999",
  borderRadius: 8,
  background: "#fff",
  color: "#111",
  padding: "12px 4px",
  cursor: "pointer",
};

const durationSelectedStyle: React.CSSProperties = {
  border: "2px solid #111",
  background: "#111",
  color: "#fff",
};

const durationDisabledStyle: React.CSSProperties = {
  border: "1px solid #ddd",
  background: "#f5f5f5",
  color: "#aaa",
  cursor: "not-allowed",
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
