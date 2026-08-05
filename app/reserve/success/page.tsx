"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import CarrierMailSaveNotice from "./CarrierMailSaveNotice";

type ReservationData = {
  id: string;
  placeId: string;
  spotId: string;
  date: string;
  slot: string;
  name: string;
  plate: string;
  email: string | null;
  price?: number;
  pin: string;
  paid: boolean;
  paidAt?: string | null;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function SuccessInner() {
  const searchParams = useSearchParams();
  const sessionId = useMemo(
    () => String(searchParams.get("session_id") ?? "").trim(),
    [searchParams]
  );

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("予約情報を読み込んでいます...");
  const [reservation, setReservation] = useState<ReservationData | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!sessionId) {
        setMsg("session_id が見つかりません。");
        setLoading(false);
        return;
      }

      setLoading(true);
      setMsg("予約情報を読み込んでいます...");

      // webhook反映待ちで最大10回リトライ
      for (let i = 0; i < 10; i++) {
        try {
          const res = await fetch(
            `/api/reservation-by-session?session_id=${encodeURIComponent(sessionId)}`,
            { cache: "no-store" }
          );

          const json = await res.json().catch(() => null);

          if (cancelled) return;

          if (res.ok && json?.ok && json?.reservation) {
            setReservation(json.reservation);
            setMsg("");
            setLoading(false);
            return;
          }

          if (res.status !== 404) {
            setMsg(json?.message ?? json?.error ?? "予約情報の取得に失敗しました。");
            setLoading(false);
            return;
          }

          // 404 のときは webhook 未反映の可能性が高いので待つ
          setMsg(`予約情報を確認中です... (${i + 1}/10)`);
          await sleep(1000);
        } catch (e: any) {
          if (cancelled) return;
          setMsg(String(e?.message ?? e));
          setLoading(false);
          return;
        }
      }

      if (!cancelled) {
        setMsg("予約情報の反映に時間がかかっています。少し待って再読み込みしてください。");
        setLoading(false);
      }
    }

    run();

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  return (
    <div
      style={{
        maxWidth: 720,
        margin: "40px auto",
        padding: 20,
        fontFamily: "system-ui",
      }}
    >
      <h1 style={{ fontSize: 28, fontWeight: 900, marginBottom: 12 }}>
        決済が完了しました
      </h1>

      {loading && (
        <div
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: 16,
            padding: 16,
            background: "#fafafa",
            color: "#444",
          }}
        >
          {msg}
        </div>
      )}

      {!loading && reservation && (
        <div
          style={{
            display: "grid",
            gap: 14,
          }}
        >
          <div
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: 16,
              padding: 18,
              background: "#f8fafc",
            }}
          >
            <div style={{ fontSize: 14, color: "#666", marginBottom: 8 }}>
              ご予約が確定しました
            </div>

            <div
              style={{
                fontSize: 40,
                fontWeight: 900,
                letterSpacing: 6,
                textAlign: "center",
                padding: "18px 12px",
                borderRadius: 16,
                background: "#fff",
                border: "2px solid #111",
                marginBottom: 14,
              }}
            >
              {reservation.pin}
            </div>

            <div style={{ fontSize: 14, color: "#444", lineHeight: 1.8 }}>
              <div>利用日: {reservation.date}</div>
              <div>区画: {reservation.slot || reservation.spotId}</div>
              <div>氏名: {reservation.name}</div>
              <div>車両ナンバー: {reservation.plate}</div>
            </div>
          </div>

          <CarrierMailSaveNotice
            email={reservation.email}
            pin={reservation.pin}
          />

          <div
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: 16,
              padding: 16,
              background: "#fff",
              lineHeight: 1.8,
              fontSize: 14,
              color: "#444",
            }}
          >
            <div style={{ fontWeight: 800, marginBottom: 6 }}>入庫方法</div>
            <div>1. 現地のQRを読み取ってください</div>
            <div>2. 「予約利用」を選択してください</div>
            <div>3. 上記PINコードを入力してください</div>
          </div>

          {reservation.email && (
            <div
              style={{
                border: "1px solid #d1e7dd",
                borderRadius: 16,
                padding: 16,
                background: "#f0fdf4",
                fontSize: 14,
                color: "#166534",
                lineHeight: 1.8,
              }}
            >
              📩 予約内容は <strong>{reservation.email}</strong> にお送りしました。ご確認ください。
            </div>
          )}
        </div>
      )}

      {!loading && !reservation && (
        <div
          style={{
            border: "1px solid #ffd0d8",
            borderRadius: 16,
            padding: 16,
            background: "#fff3f5",
            color: "#b00020",
            whiteSpace: "pre-wrap",
          }}
        >
          {msg}
        </div>
      )}
    </div>
  );
}

export default function ReserveSuccessPage() {
  return (
    <Suspense
      fallback={
        <div style={{ maxWidth: 720, margin: "40px auto", padding: 20 }}>
          読み込み中...
        </div>
      }
    >
      <SuccessInner />
    </Suspense>
  );
}