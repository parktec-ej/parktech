"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type GateMode =
  | "need_pin_checkin"
  | "can_checkout"
  | "already_checked_out"
  | "no_reservation"
  | "unpaid"
  | "can_start_hourly"
  | "can_checkout_hourly"
  | "closed"
  | "unknown";

type OperationMode =
  | "RESERVATION_ONLY"
  | "HOURLY_ONLY"
  | "RESERVATION_THEN_HOURLY"
  | "EVENT_ONLY"
  | "CLOSED";

type GateResponse = {
  ok?: boolean;
  mode?: GateMode;
  error?: string;
  message?: string;
  placeId?: string;
  placeSlug?: string;
  placeName?: string;
  spotId?: string;
  spotLabel?: string;
  slot?: string;
  date?: string;
  reservationId?: string;
  reservationPriority?: boolean;
  sessionId?: string;
  checkedInAt?: string | null;
  effectiveOperationMode?: OperationMode;
  dayOperationMode?: OperationMode | null;
  spotOperationModeOverride?: OperationMode | null;
  placeOperationMode?: OperationMode | null;
};

function ymdTodayJst() {
  return new Date().toLocaleDateString("sv-SE", {
    timeZone: "Asia/Tokyo",
  });
}

function modeLabel(mode?: string | null) {
  if (!mode) return "-";
  if (mode === "RESERVATION_ONLY") return "予約専用";
  if (mode === "HOURLY_ONLY") return "時間貸し専用";
  if (mode === "RESERVATION_THEN_HOURLY") return "予約優先 → 空きは時間貸し";
  if (mode === "EVENT_ONLY") return "イベント時のみ時間貸し";
  if (mode === "CLOSED") return "利用停止";
  return mode;
}

function GateInner() {
  const router = useRouter();
  const search = useSearchParams();

  const placeId = useMemo(
    () => String(search.get("placeId") ?? "").trim(),
    [search]
  );
  const slot = useMemo(
    () => String(search.get("slot") ?? "").trim(),
    [search]
  );
  const date = useMemo(
    () => String(search.get("date") ?? ymdTodayJst()).trim(),
    [search]
  );

  const [loading, setLoading] = useState(true);
  const [reloading, setReloading] = useState(false);
  const [data, setData] = useState<GateResponse | null>(null);
  const [error, setError] = useState("");

  const missingParams = !placeId || !slot;

  async function loadStatus(withReloadState = false) {
    if (missingParams) {
      setLoading(false);
      setError("QRコードが正しくありません。placeId または slot が不足しています。");
      return;
    }

    if (withReloadState) setReloading(true);
    else setLoading(true);

    setError("");

    try {
      const qs = new URLSearchParams({
        placeId,
        slot,
        date,
      });

      const res = await fetch(`/api/gate-status?${qs.toString()}`, {
        cache: "no-store",
      });

      const json = await res.json().catch(() => null);

      if (!json) {
        setError("状態取得に失敗しました");
        setData(null);
        return;
      }

      if (!res.ok || json.ok === false) {
        setError(String(json.message ?? json.error ?? "状態取得に失敗しました"));
        setData(json);
        return;
      }

      setData(json);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "通信エラーが発生しました");
      setData(null);
    } finally {
      setLoading(false);
      setReloading(false);
    }
  }

  useEffect(() => {
    void loadStatus(false);
  }, [placeId, slot, date]);

  const resolvedPlaceId = data?.placeSlug ?? data?.placeId ?? placeId;
  const resolvedDate = data?.date ?? date;
  const resolvedSlot = data?.slot ?? slot;
  const placeName = data?.placeName ?? resolvedPlaceId;
  const spotLabel = data?.spotLabel ?? resolvedSlot;
  const mode = data?.mode ?? "unknown";

  const checkinUrl = `/checkin?placeId=${encodeURIComponent(
    resolvedPlaceId
  )}&slot=${encodeURIComponent(resolvedSlot)}&date=${encodeURIComponent(
    resolvedDate
  )}`;

  const checkoutUrl = `/checkout?placeId=${encodeURIComponent(
    resolvedPlaceId
  )}&slot=${encodeURIComponent(resolvedSlot)}&date=${encodeURIComponent(
    resolvedDate
  )}`;

  const hourlyStartUrl = `/hourly-start?placeId=${encodeURIComponent(
    resolvedPlaceId
  )}&slot=${encodeURIComponent(resolvedSlot)}&date=${encodeURIComponent(
    resolvedDate
  )}`;

  const hourlyCheckoutUrl = `/hourly-checkout?placeId=${encodeURIComponent(
    resolvedPlaceId
  )}&slot=${encodeURIComponent(resolvedSlot)}&date=${encodeURIComponent(
    resolvedDate
  )}`;

  const statusTitle = (() => {
    switch (mode) {
      case "need_pin_checkin":
        return "この区画は予約済みです";
      case "can_checkout":
        return "現在ご利用中です";
      case "already_checked_out":
        return "このご利用は出庫済みです";
      case "unpaid":
        return "未決済の予約があります";
      case "can_start_hourly":
        return "今すぐ利用できます";
      case "can_checkout_hourly":
        return "現在ご利用中です";
      case "closed":
        return "現在ご利用いただけません";
      case "no_reservation":
        return "ご利用方法を選んでください";
      default:
        return "状態を確認しています";
    }
  })();

  const statusMessage = (() => {
    if (error) return error;

    switch (mode) {
      case "need_pin_checkin":
        return "このスロットは予約済みです。予約者はPINコードを入力してください。";
      case "can_checkout":
        return "予約車両が利用中です。出庫される方は下のボタンからお進みください。";
      case "already_checked_out":
        return "この予約はすでに出庫済みです。";
      case "unpaid":
        return "未決済の予約があります。管理者へご確認ください。";
      case "can_start_hourly":
        return "この区画は現在空いています。時間貸し利用を開始できます。";
      case "can_checkout_hourly":
        return "時間貸し利用中です。精算して出庫してください。";
      case "closed":
        return "この区画は現在停止中です。別の区画をご利用ください。";
      case "no_reservation":
        if (data?.effectiveOperationMode === "RESERVATION_ONLY") {
          return "この区画は予約専用です。予約者の方のみご利用いただけます。";
        }
        return "予約利用、時間貸し、出庫のいずれかを選んでください。";
      default:
        return "状態を確認してから操作してください。";
    }
  })();

  const recommendation = (() => {
    switch (mode) {
      case "need_pin_checkin":
        return "予約者の方はこちらから入庫してください";
      case "can_checkout":
        return "出庫される方はこちらからお進みください";
      case "can_checkout_hourly":
        return "精算して出庫してください";
      case "can_start_hourly":
        return "時間貸しを開始できます";
      default:
        return null;
    }
  })();

  const disableAll =
    !!error ||
    data?.error === "spot_not_found" ||
    data?.error === "place_not_found" ||
    mode === "closed";

  const canUseReservation =
    !disableAll &&
    (mode === "need_pin_checkin" ||
      mode === "unpaid" ||
      mode === "no_reservation");

  const canUseHourly = !disableAll && mode === "can_start_hourly";

  const canUseCheckout =
    !disableAll && (mode === "can_checkout" || mode === "can_checkout_hourly");

  function handleCheckin() {
    if (!canUseReservation) return;
    router.push(checkinUrl);
  }

  function handleHourlyStart() {
    if (!canUseHourly) return;
    router.push(hourlyStartUrl);
  }

  function handleCheckout() {
    if (!canUseCheckout) return;

    if (mode === "can_checkout_hourly") {
      router.push(hourlyCheckoutUrl);
      return;
    }

    router.push(checkoutUrl);
  }

  if (loading) {
    return (
      <main style={pageStyle}>
        <h1 style={titleStyle}>ParkTech ゲート</h1>
        <div style={cardStyle}>状態を確認しています...</div>
      </main>
    );
  }

  return (
    <main style={pageStyle}>
      <h1 style={titleStyle}>ParkTech ゲート</h1>

      <div style={heroCardStyle}>
        <div style={heroPlaceStyle}>{placeName || "-"}</div>
        <div style={heroSlotStyle}>{spotLabel}</div>
        <div style={heroDateStyle}>利用日: {resolvedDate || "-"}</div>
      </div>

      <div style={cardStyle}>
        <div style={statusTitleStyle}>{statusTitle}</div>
        <div style={statusMessageStyle}>{statusMessage}</div>

        {recommendation ? (
          <div style={recommendStyle}>
            <strong>{recommendation}</strong>
          </div>
        ) : null}

        {data?.effectiveOperationMode === "RESERVATION_ONLY" &&
        mode !== "need_pin_checkin" ? (
          <div style={noticeStyle}>
            この区画は予約専用です。時間貸しは利用できません。
          </div>
        ) : null}

        {data?.reservationPriority ? (
          <div style={priorityStyle}>既存予約を優先して案内しています</div>
        ) : null}
      </div>

      <div style={buttonGridStyle}>
        <button
          type="button"
          style={{
            ...actionButtonStyle,
            ...(mode === "need_pin_checkin" ? actionButtonPrimaryStyle : {}),
            ...(!canUseReservation ? disabledButtonStyle : {}),
          }}
          onClick={handleCheckin}
          disabled={!canUseReservation}
        >
          <div style={actionButtonTitleStyle}>予約利用</div>
          <div style={actionButtonSubStyle}>
            {canUseReservation
              ? "PINコードを入力して入庫"
              : "現在は利用できません"}
          </div>
        </button>

        <button
          type="button"
          style={{
            ...actionButtonStyle,
            ...(mode === "can_start_hourly" ? actionButtonPrimaryStyle : {}),
            ...(!canUseHourly ? disabledButtonStyle : {}),
          }}
          onClick={handleHourlyStart}
          disabled={!canUseHourly}
        >
          <div style={actionButtonTitleStyle}>時間貸し</div>
          <div style={actionButtonSubStyle}>
            {canUseHourly ? "今から利用を開始" : "現在は利用できません"}
          </div>
        </button>

        <button
          type="button"
          style={{
            ...actionButtonStyle,
            ...((mode === "can_checkout" || mode === "can_checkout_hourly")
              ? actionButtonPrimaryStyle
              : {}),
            ...(!canUseCheckout ? disabledButtonStyle : {}),
          }}
          onClick={handleCheckout}
          disabled={!canUseCheckout}
        >
          <div style={actionButtonTitleStyle}>出庫する</div>
          <div style={actionButtonSubStyle}>
            {canUseCheckout
              ? mode === "can_checkout_hourly"
                ? "時間貸し精算へ進む"
                : "出庫手続きへ進む"
              : "現在は出庫対象がありません"}
          </div>
        </button>
      </div>

      <div style={subInfoStyle}>
        <div>
          <strong>現在の営業モード:</strong>{" "}
          {modeLabel(data?.effectiveOperationMode)}
        </div>
        <div>
          <strong>日付別設定:</strong> {modeLabel(data?.dayOperationMode)}
        </div>
        <div>
          <strong>区画別上書き:</strong>{" "}
          {modeLabel(data?.spotOperationModeOverride)}
        </div>
      </div>

      <div style={{ display: "grid", gap: 12 }}>
        <button
          type="button"
          style={secondaryButtonStyle}
          onClick={() => loadStatus(true)}
          disabled={reloading}
        >
          {reloading ? "再確認中..." : "状態を再確認"}
        </button>

        <button
          type="button"
          style={secondaryButtonStyle}
          onClick={() => router.push("/")}
        >
          トップへ戻る
        </button>
      </div>
    </main>
  );
}

export default function GatePage() {
  return (
    <Suspense fallback={<main style={pageStyle}>状態を確認しています...</main>}>
      <GateInner />
    </Suspense>
  );
}

const pageStyle: React.CSSProperties = {
  maxWidth: 620,
  margin: "0 auto",
  padding: "24px 16px 56px",
  fontFamily:
    'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
};

const titleStyle: React.CSSProperties = {
  fontSize: 30,
  fontWeight: 900,
  marginBottom: 16,
};

const heroCardStyle: React.CSSProperties = {
  background: "#0f172a",
  color: "#fff",
  borderRadius: 18,
  padding: 20,
  marginBottom: 16,
};

const heroPlaceStyle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 700,
  marginBottom: 8,
};

const heroSlotStyle: React.CSSProperties = {
  fontSize: 42,
  fontWeight: 900,
  lineHeight: 1.1,
  marginBottom: 8,
};

const heroDateStyle: React.CSSProperties = {
  fontSize: 14,
  opacity: 0.9,
};

const cardStyle: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e5e5e5",
  borderRadius: 16,
  padding: 16,
  marginBottom: 16,
};

const statusTitleStyle: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 800,
  marginBottom: 10,
};

const statusMessageStyle: React.CSSProperties = {
  lineHeight: 1.8,
  color: "#333",
};

const recommendStyle: React.CSSProperties = {
  marginTop: 12,
  padding: 10,
  borderRadius: 10,
  background: "#eff6ff",
  color: "#1d4ed8",
  fontSize: 14,
};

const noticeStyle: React.CSSProperties = {
  marginTop: 12,
  padding: 10,
  borderRadius: 10,
  background: "#fff7ed",
  color: "#c2410c",
  fontSize: 14,
  fontWeight: 700,
};

const priorityStyle: React.CSSProperties = {
  marginTop: 12,
  padding: 10,
  borderRadius: 10,
  background: "#eef6ff",
  color: "#1d4ed8",
  fontWeight: 700,
  fontSize: 13,
};

const buttonGridStyle: React.CSSProperties = {
  display: "grid",
  gap: 12,
  marginBottom: 16,
};

const actionButtonStyle: React.CSSProperties = {
  width: "100%",
  padding: "18px 18px",
  borderRadius: 16,
  border: "1px solid #d1d5db",
  background: "#fff",
  color: "#111",
  textAlign: "left",
  cursor: "pointer",
};

const actionButtonPrimaryStyle: React.CSSProperties = {
  border: "2px solid #111827",
  background: "#111827",
  color: "#fff",
};

const disabledButtonStyle: React.CSSProperties = {
  background: "#f3f4f6",
  color: "#9ca3af",
  border: "1px solid #e5e7eb",
  cursor: "not-allowed",
};

const actionButtonTitleStyle: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 900,
  marginBottom: 6,
};

const actionButtonSubStyle: React.CSSProperties = {
  fontSize: 14,
  opacity: 0.9,
};

const subInfoStyle: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e5e5e5",
  borderRadius: 16,
  padding: 16,
  marginBottom: 16,
  lineHeight: 1.9,
  fontSize: 14,
  color: "#555",
};

const secondaryButtonStyle: React.CSSProperties = {
  width: "100%",
  padding: "14px 18px",
  borderRadius: 14,
  border: "1px solid #ddd",
  background: "#fff",
  color: "#111",
  fontWeight: 700,
  cursor: "pointer",
};