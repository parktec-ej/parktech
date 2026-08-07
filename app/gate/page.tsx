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
  | "pending_payment"
  | "closed"
  | "unknown";

type OperationMode =
  | "RESERVATION_ONLY"
  | "HOURLY_ONLY"
  | "RESERVATION_THEN_HOURLY"
  | "EVENT_ONLY"
  | "CLOSED"
  | "MONTHLY";

type GateResponse = {
  ok?: boolean;
  mode?: GateMode;
  error?: string;
  message?: string;
  placeId?: string;
  placeSlug?: string;
  placeName?: string;
  hourlyYen?: number;
  dailyYen?: number;
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
  exitDeadlineDate?: string | null;
  scheduledEndAt?: string | null;
  prepaidYen?: number | null;
  isOverstay?: boolean;
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
  if (mode === "EVENT_ONLY") return "イベント予約専用";
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
  const hourlyYen = data?.hourlyYen ?? null;
  const dailyYen = data?.dailyYen ?? null;

  // 翌日に予約がある場合のみ、出庫期限（YYYY-MM-DD）が入る。
  // 期限は当該日の午前0時。猶予なし（利用規約 第6条の2）。
  const exitDeadlineDate = data?.exitDeadlineDate ?? null;

  // 「8/11」形式に整形
  const exitDeadlineLabel = exitDeadlineDate
    ? (() => {
        const [, m, d] = exitDeadlineDate.split("-").map(Number);
        return `${m}/${d}`;
      })()
    : null;

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

  // 事前決済フローへ遷移する。旧・後払いフロー（/hourly-start）は当面残してあり、
  // 問題が起きた場合はこのパスを /hourly-start に戻せば復旧できる。
  const hourlyStartUrl = `/hourly-prepaid?placeId=${encodeURIComponent(
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
      case "pending_payment":
        return "お手続き中です";
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
      case "pending_payment":
        return "この区画は別のお客様がお手続き中です。しばらくお待ちいただくか、他の区画をご利用ください。30分ほどで自動的に解除されます。";
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
        if (data?.effectiveOperationMode === "EVENT_ONLY") {
          return "この区画はイベント予約専用です。ご予約の方はPINコードで入庫してください。";
        }
        return "予約利用、時間貸し、出庫のいずれかを選んでください。";
      default:
        return "状態を確認してから操作してください。";
    }
  })();

  const recommendation = (() => {
    switch (mode) {
      case "pending_payment":
        return "しばらくお待ちください";
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

  const [checkoutDone, setCheckoutDone] = useState(false);
  const [checkoutBusy, setCheckoutBusy] = useState(false);

  const [showExtend, setShowExtend] = useState(false);
  const [extendBusy, setExtendBusy] = useState(false);
  const [extendError, setExtendError] = useState("");

  // 入庫時と同じ7択。API 側の ALLOWED_MINUTES と揃えること。
  const extendOptions = [
    { minutes: 60, label: "1時間" },
    { minutes: 120, label: "2時間" },
    { minutes: 180, label: "3時間" },
    { minutes: 240, label: "4時間" },
    { minutes: 300, label: "5時間" },
    { minutes: 360, label: "6時間" },
    { minutes: 1440, label: "24時間" },
  ];

  const [overstayBusy, setOverstayBusy] = useState(false);
  const [overstayError, setOverstayError] = useState("");

  async function handleOverstay() {
    if (overstayBusy || !data?.sessionId) return;

    setOverstayBusy(true);
    setOverstayError("");

    try {
      const res = await fetch("/api/hourly-prepaid/overstay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: data.sessionId }),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.checkoutUrl) {
        setOverstayError(json?.message || "超過精算の手続きに失敗しました");
        setOverstayBusy(false);
        return;
      }

      window.location.href = json.checkoutUrl;
    } catch {
      setOverstayError("通信エラーが発生しました");
      setOverstayBusy(false);
    }
  }

  async function handleExtend(minutes: number) {
    if (extendBusy || !data?.sessionId) return;

    setExtendBusy(true);
    setExtendError("");

    try {
      const res = await fetch("/api/hourly-prepaid/extend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: data.sessionId, minutes }),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.checkoutUrl) {
        setExtendError(json?.message || "延長手続きに失敗しました");
        setExtendBusy(false);
        return;
      }

      window.location.href = json.checkoutUrl;
    } catch {
      setExtendError("通信エラーが発生しました");
      setExtendBusy(false);
    }
  }

  async function handleCheckout() {
    if (!canUseCheckout || checkoutBusy) return;

    if (mode === "can_checkout_hourly") {
      // 事前決済で期限内なら、その場で出庫を確定する（追加決済なし）。
      // 期限を過ぎている場合と、旧・後払いセッションは精算画面へ。
      if (data?.prepaidYen != null && !data?.isOverstay && data?.sessionId) {
        setCheckoutBusy(true);
        try {
          const res = await fetch("/api/hourly-prepaid/checkout", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionId: data.sessionId }),
          });
          const json = await res.json().catch(() => null);

          if (res.ok && json?.ok) {
            setCheckoutDone(true);
            setCheckoutBusy(false);
            return;
          }

          // 超過していた場合は精算画面へ回す
          setCheckoutBusy(false);
          router.push(hourlyCheckoutUrl);
          return;
        } catch {
          setCheckoutBusy(false);
          router.push(hourlyCheckoutUrl);
          return;
        }
      }

      router.push(hourlyCheckoutUrl);
      return;
    }

    router.push(checkoutUrl);
  }

  if (checkoutDone) {
    return (
      <main style={pageStyle}>
        <h1 style={titleStyle}>ParkTec ゲート</h1>
        <div style={cardStyle}>
          <div style={{ fontSize: 24, fontWeight: 800, marginBottom: 12 }}>
            ご利用ありがとうございました
          </div>
          <div style={{ fontSize: 16, lineHeight: 1.8 }}>
            出庫を確認しました。お支払いは完了しています。
            <br />
            またのご利用をお待ちしております。
          </div>
        </div>
      </main>
    );
  }

  if (loading) {
    return (
      <main style={pageStyle}>
        <h1 style={titleStyle}>ParkTec ゲート</h1>
        <div style={cardStyle}>状態を確認しています...</div>
      </main>
    );
  }

  return (
    <main style={pageStyle}>
      <h1 style={titleStyle}>ParkTec ゲート</h1>

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
          {hourlyYen != null ? (
            <div style={actionButtonPriceStyle}>
              1時間 {hourlyYen.toLocaleString()}円
              {dailyYen != null
                ? ` ・ 1日最大 ${dailyYen.toLocaleString()}円`
                : ""}
            </div>
          ) : null}
        </button>

        {mode === "can_checkout_hourly" && data?.prepaidYen != null ? (
          <div style={exitDeadlineStyle}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>
              出庫期限:{" "}
              {data.scheduledEndAt
                ? new Date(data.scheduledEndAt).toLocaleString("ja-JP", {
                    timeZone: "Asia/Tokyo",
                    month: "numeric",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "-"}
            </div>

            {data.isOverstay ? (
              <div>
                <div style={{ fontSize: 14, lineHeight: 1.7, marginBottom: 10 }}>
                  出庫期限を過ぎています。超過料金のお支払いが必要です。
                </div>

                {overstayError ? (
                  <div style={{ fontSize: 13, marginBottom: 8, color: "#b91c1c" }}>
                    {overstayError}
                  </div>
                ) : null}

                <button
                  type="button"
                  disabled={overstayBusy}
                  onClick={handleOverstay}
                  style={{
                    width: "100%",
                    border: "1px solid #7c2d12",
                    borderRadius: 8,
                    background: "#7c2d12",
                    color: "#fff",
                    padding: "12px",
                    fontSize: 16,
                    fontWeight: 700,
                    cursor: overstayBusy ? "not-allowed" : "pointer",
                    opacity: overstayBusy ? 0.5 : 1,
                  }}
                >
                  {overstayBusy ? "準備中..." : "超過料金を精算して出庫"}
                </button>

                <div style={{ fontSize: 12, marginTop: 8, lineHeight: 1.6 }}>
                  ご不明な点は 050-1793-4785 までご連絡ください。
                </div>
              </div>
            ) : showExtend ? (
              <div>
                <div style={{ fontSize: 14, marginBottom: 8 }}>
                  延長する時間を選んでください
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3, 1fr)",
                    gap: 6,
                  }}
                >
                  {extendOptions.map((opt) => (
                    <button
                      key={opt.minutes}
                      type="button"
                      disabled={extendBusy}
                      onClick={() => handleExtend(opt.minutes)}
                      style={{
                        border: "1px solid #7c2d12",
                        borderRadius: 8,
                        background: "#fff",
                        color: "#7c2d12",
                        padding: "10px 4px",
                        fontSize: 15,
                        fontWeight: 700,
                        cursor: extendBusy ? "not-allowed" : "pointer",
                        opacity: extendBusy ? 0.5 : 1,
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                {extendError ? (
                  <div style={{ fontSize: 13, marginTop: 8, color: "#b91c1c" }}>
                    {extendError}
                  </div>
                ) : null}

                <button
                  type="button"
                  onClick={() => setShowExtend(false)}
                  style={{
                    marginTop: 8,
                    background: "none",
                    border: "none",
                    color: "#7c2d12",
                    textDecoration: "underline",
                    fontSize: 14,
                    cursor: "pointer",
                  }}
                >
                  やめる
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowExtend(true)}
                style={{
                  width: "100%",
                  border: "1px solid #7c2d12",
                  borderRadius: 8,
                  background: "#fff",
                  color: "#7c2d12",
                  padding: "12px",
                  fontSize: 16,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                延長する
              </button>
            )}
          </div>
        ) : null}

        {canUseHourly && exitDeadlineLabel ? (
          <div style={exitDeadlineStyle}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>
              ⚠️ {exitDeadlineLabel} はこの区画にご予約が入っています
            </div>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>
              {exitDeadlineLabel} 0:00 までにご出庫ください
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.7 }}>
              超過された場合、超過分の時間貸し料金に加え、予約者への返金相当額
              および対応費用5,000円を申し受けます（利用規約 第6条の2）。
            </div>
          </div>
        ) : null}

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
            {!canUseCheckout
              ? "現在は出庫対象がありません"
              : mode !== "can_checkout_hourly"
              ? "出庫手続きへ進む"
              : data?.prepaidYen == null
              ? "時間貸し精算へ進む"
              : data?.isOverstay
              ? "超過料金の精算へ進む"
              : "お支払いは完了しています"}
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

const exitDeadlineStyle: React.CSSProperties = {
  background: "#fff7ed",
  border: "1px solid #fdba74",
  borderRadius: 16,
  padding: 16,
  marginTop: -4,
  marginBottom: 16,
  fontSize: 14,
  color: "#7c2d12",
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

const actionButtonPriceStyle: React.CSSProperties = {
  marginTop: 8,
  fontSize: 16,
  fontWeight: 800,
};