"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type SuccessResponse = {
  ok: boolean;
  parkingSession?: {
    id: string;
    placeId: string;
    spotId: string;
    totalMinutes: number | null;
    totalYen: number | null;
    paid: boolean;
    paidAt: string | null;
    paymentRef: string | null;
    checkOutAt: string | null;
    status: "IN" | "OUT";
    spot?: {
      code: string;
      label: string | null;
    } | null;
    place?: {
      slug: string;
      name: string;
    } | null;
  };
  error?: string;
  message?: string;
};

export default function HourlyCheckoutSuccessPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<SuccessResponse | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const params = new URLSearchParams(window.location.search);
        const sessionId = params.get("session_id");

        if (!sessionId) {
          setError("session_id が見つかりません");
          setLoading(false);
          return;
        }

        const res = await fetch(
          `/api/hourly-checkout-by-session?session_id=${encodeURIComponent(sessionId)}`,
          { cache: "no-store" }
        );

        const json: SuccessResponse = await res.json();

        if (!res.ok || !json?.ok) {
          setError(json?.message ?? json?.error ?? "精算結果の取得に失敗しました");
          setLoading(false);
          return;
        }

        setData(json);
      } catch (e: any) {
        setError(String(e?.message ?? "通信エラーが発生しました"));
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  const placeLabel =
    data?.parkingSession?.place?.name ??
    data?.parkingSession?.place?.slug ??
    data?.parkingSession?.placeId ??
    "-";

  const slotLabel =
    data?.parkingSession?.spot?.label ??
    data?.parkingSession?.spot?.code ??
    "-";

  return (
    <main style={{ maxWidth: 560, margin: "0 auto", padding: 24 }}>
      <h1 style={{ fontSize: 28, marginBottom: 16 }}>時間貸し精算完了</h1>

      {loading ? (
        <div
          style={{
            border: "1px solid #ddd",
            borderRadius: 12,
            padding: 16,
            background: "#fff",
          }}
        >
          決済結果を確認しています...
        </div>
      ) : error ? (
        <div
          style={{
            border: "1px solid #f0b3b3",
            background: "#fff5f5",
            color: "#c62828",
            borderRadius: 12,
            padding: 16,
          }}
        >
          {error}
        </div>
      ) : (
        <>
          <div
            style={{
              border: "1px solid #d9ead3",
              background: "#f3fff1",
              color: "#1b5e20",
              borderRadius: 12,
              padding: 16,
              marginBottom: 16,
              fontWeight: 700,
            }}
          >
            決済が完了しました。出庫可能です。
          </div>

          <div
            style={{
              border: "1px solid #ddd",
              borderRadius: 12,
              padding: 16,
              lineHeight: 1.9,
              marginBottom: 16,
              background: "#fff",
            }}
          >
            <p style={{ margin: 0 }}>場所: {placeLabel}</p>
            <p style={{ margin: 0 }}>区画: {slotLabel}</p>
            <p style={{ margin: 0 }}>
              利用時間: {data?.parkingSession?.totalMinutes ?? "-"} 分
            </p>
            <p style={{ margin: 0, fontWeight: 800, fontSize: 18 }}>
              合計料金: {data?.parkingSession?.totalYen ?? "-"} 円
            </p>
            <p style={{ margin: 0 }}>
              決済時刻:{" "}
              {data?.parkingSession?.paidAt
                ? new Date(data.parkingSession.paidAt).toLocaleString("ja-JP")
                : "-"}
            </p>
            <p style={{ margin: 0 }}>
              出庫時刻:{" "}
              {data?.parkingSession?.checkOutAt
                ? new Date(data.parkingSession.checkOutAt).toLocaleString("ja-JP")
                : "-"}
            </p>
            <p style={{ margin: 0 }}>
              ステータス: {data?.parkingSession?.status ?? "-"}
            </p>
          </div>

          <div style={{ display: "grid", gap: 12 }}>
            <button
              onClick={() => router.push("/")}
              style={{
                width: "100%",
                padding: "12px 16px",
                borderRadius: 12,
                border: "1px solid #111",
                background: "#111",
                color: "#fff",
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              トップへ戻る
            </button>

            <button
              onClick={() => router.push("/admin/reservations")}
              style={{
                width: "100%",
                padding: "12px 16px",
                borderRadius: 12,
                border: "1px solid #ccc",
                background: "#fff",
                color: "#111",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              管理画面で確認する
            </button>
          </div>
        </>
      )}
    </main>
  );
}