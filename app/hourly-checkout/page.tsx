"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function ymdTodayJst() {
  return new Date().toLocaleDateString("sv-SE", {
    timeZone: "Asia/Tokyo",
  });
}

type HourlyCheckoutCalcResponse = {
  ok: boolean;
  alreadyPaid?: boolean;
  parkingSessionId?: string;
  place?: {
    id: string;
    slug: string;
    name: string;
  };
  spot?: {
    id: string;
    code: string;
    label: string | null;
  };
  session?: {
    id: string;
    plate: string | null;
    phone: string | null;
    customerName: string | null;
    checkInAt: string;
    paidAt?: string | null;
    paymentRef?: string | null;
  };
  pricing?: {
    totalMinutes: number;
    billedHours: number;
    hourlyYen: number;
    totalYen: number;
  };
  date?: string;
  error?: string;
  message?: string;
};

type HourlyStripeCheckoutResponse = {
  ok: boolean;
  url?: string;
  checkoutSessionId?: string;
  parkingSessionId?: string;
  totalMinutes?: number;
  billedHours?: number;
  hourlyYen?: number;
  totalYen?: number;
  error?: string;
  message?: string;
};

export default function HourlyCheckoutPage() {
  const router = useRouter();
  const search = useSearchParams();

  const placeId = search.get("placeId") ?? "";
  const slot = search.get("slot") ?? "";
  const date = search.get("date") ?? ymdTodayJst();

  const gateUrl = `/gate?placeId=${encodeURIComponent(placeId)}&slot=${encodeURIComponent(slot)}&date=${encodeURIComponent(date)}`;

  const [calcLoading, setCalcLoading] = useState(false);
  const [payLoading, setPayLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<HourlyCheckoutCalcResponse | null>(null);

  const missingParams = useMemo(() => {
    return !placeId || !slot;
  }, [placeId, slot]);

  async function handlePreview() {
    setError("");
    setCalcLoading(true);

    try {
      const res = await fetch("/api/hourly-checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          placeId,
          slot,
          date,
        }),
      });

      const json: HourlyCheckoutCalcResponse = await res.json();

      if (!res.ok || !json?.ok) {
        setError(json?.message ?? json?.error ?? "精算計算に失敗しました");
        setResult(null);
        return;
      }

      setResult(json);
    } catch (e: any) {
      setError(e?.message ?? "通信エラーが発生しました");
      setResult(null);
    } finally {
      setCalcLoading(false);
    }
  }

  async function handleStripeCheckout() {
    setError("");
    setPayLoading(true);

    try {
      const res = await fetch("/api/stripe/checkout/hourly", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          placeId,
          slot,
          date,
        }),
      });

      const json: HourlyStripeCheckoutResponse = await res.json();

      if (!res.ok || !json?.ok) {
        setError(json?.message ?? json?.error ?? "Stripe決済の開始に失敗しました");
        return;
      }

      if (!json.url) {
        setError("Stripe Checkout URL が取得できませんでした");
        return;
      }

      window.location.href = json.url;
    } catch (e: any) {
      setError(e?.message ?? "通信エラーが発生しました");
    } finally {
      setPayLoading(false);
    }
  }

  return (
    <main style={pageStyle}>
      <h1 style={titleStyle}>時間貸し精算</h1>

      {missingParams ? (
        <div style={errorBoxStyle}>
          必要なパラメータが不足しています。placeId / slot を確認してください。
        </div>
      ) : (
        <>
          <div style={cardStyle}>
            <p style={rowStyle}>場所: {placeId}</p>
            <p style={rowStyle}>区画: {slot}</p>
            <p style={rowStyle}>日付: {date}</p>
          </div>

          {error ? <div style={errorBoxStyle}>{error}</div> : null}

          {!result ? (
            <>
              <button
                onClick={handlePreview}
                disabled={calcLoading}
                style={{
                  ...primaryButtonStyle,
                  opacity: calcLoading ? 0.7 : 1,
                  cursor: calcLoading ? "not-allowed" : "pointer",
                }}
              >
                {calcLoading ? "計算中..." : "料金を確認する"}
              </button>

              <button
                onClick={() => router.push(gateUrl)}
                style={{ ...secondaryButtonStyle, marginTop: 12 }}
              >
                gateへ戻る
              </button>
            </>
          ) : (
            <>
              {result.alreadyPaid ? (
                <div style={successBoxStyle}>すでに決済済みです。</div>
              ) : null}

              <div style={cardStyle}>
                <p style={rowStyle}>
                  利用時間: {result.pricing?.totalMinutes ?? "-"} 分
                </p>
                <p style={rowStyle}>
                  請求時間: {result.pricing?.billedHours ?? "-"} 時間
                </p>
                <p style={rowStyle}>
                  時間単価: {result.pricing?.hourlyYen ?? "-"} 円
                </p>
                <p style={totalStyle}>
                  合計料金: {result.pricing?.totalYen ?? "-"} 円
                </p>
              </div>

              <div style={{ display: "grid", gap: 12 }}>
                {!result.alreadyPaid ? (
                  <div style={noticeStyle}>
                    領収書をご希望の方は、Stripe決済画面でEメールアドレスを必ずご登録ください。
                  </div>
                ) : null}

                {!result.alreadyPaid ? (
                  <button
                    onClick={handleStripeCheckout}
                    disabled={payLoading}
                    style={{
                      ...primaryButtonStyle,
                      opacity: payLoading ? 0.7 : 1,
                      cursor: payLoading ? "not-allowed" : "pointer",
                    }}
                  >
                    {payLoading ? "Stripeへ接続中..." : "Stripeで精算する"}
                  </button>
                ) : null}

                <button
                  onClick={() => setResult(null)}
                  disabled={payLoading}
                  style={secondaryButtonStyle}
                >
                  料金を再計算する
                </button>

                <button
                  onClick={() => router.push(gateUrl)}
                  style={secondaryButtonStyle}
                >
                  gateへ戻る
                </button>
              </div>
            </>
          )}
        </>
      )}
    </main>
  );
}

const pageStyle: React.CSSProperties = {
  maxWidth: 560,
  margin: "0 auto",
  padding: 24,
};

const titleStyle: React.CSSProperties = {
  fontSize: 28,
  marginBottom: 16,
  fontWeight: 900,
};

const cardStyle: React.CSSProperties = {
  border: "1px solid #ddd",
  borderRadius: 12,
  padding: 16,
  lineHeight: 1.9,
  marginBottom: 16,
  background: "#fff",
};

const rowStyle: React.CSSProperties = {
  margin: 0,
};

const totalStyle: React.CSSProperties = {
  margin: 0,
  fontWeight: 800,
  fontSize: 18,
};

const noticeStyle: React.CSSProperties = {
  border: "1px solid #f59e0b",
  background: "#fffbeb",
  color: "#92400e",
  borderRadius: 8,
  padding: 12,
  lineHeight: 1.7,
  fontSize: 14,
};

const errorBoxStyle: React.CSSProperties = {
  border: "1px solid #f0b3b3",
  background: "#fff5f5",
  color: "#c62828",
  borderRadius: 12,
  padding: 14,
  marginBottom: 16,
};

const successBoxStyle: React.CSSProperties = {
  border: "1px solid #bbf7d0",
  background: "#f0fdf4",
  color: "#166534",
  borderRadius: 12,
  padding: 14,
  marginBottom: 16,
  fontWeight: 700,
};

const primaryButtonStyle: React.CSSProperties = {
  width: "100%",
  padding: "14px 18px",
  borderRadius: 12,
  border: "1px solid #111",
  background: "#111",
  color: "#fff",
  fontWeight: 800,
};

const secondaryButtonStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px 16px",
  borderRadius: 12,
  border: "1px solid #ccc",
  background: "#fff",
  color: "#111",
  fontWeight: 700,
  cursor: "pointer",
};