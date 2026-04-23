"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

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

function formatYen(value: number | null | undefined) {
  if (!Number.isFinite(value ?? NaN)) return "-";
  return `${Number(value).toLocaleString("ja-JP")}円`;
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

      // ZIP実物の reserve/success と同じく webhook反映待ちで最大10回リトライ
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
    <div style={pageStyle}>
      <div style={containerStyle}>
        <h1 style={titleStyle}>バス予約の決済が完了しました</h1>

        {loading && <div style={infoBoxStyle}>{msg}</div>}

        {!loading && reservation && (
          <div style={gridStyle}>
            <div style={pinCardStyle}>
              <div style={subTitleStyle}>ご予約が確定しました</div>

              <div style={pinStyle}>{reservation.pin}</div>

              <div style={detailListStyle}>
                <div>利用日: {reservation.date}</div>
                <div>区画: {reservation.slot || reservation.spotId}</div>
                <div>予約名: {reservation.name}</div>
                <div>車両ナンバー: {reservation.plate}</div>
                <div>料金: {formatYen(reservation.price)}</div>
              </div>
            </div>

            <div style={cardStyle}>
              <div style={sectionTitleStyle}>ご利用方法</div>
              <div style={lineTextStyle}>1. 現地のQRを読み取ってください</div>
              <div style={lineTextStyle}>2. 「予約利用」を選択してください</div>
              <div style={lineTextStyle}>3. 上記PINコードを入力してください</div>
            </div>

            <div style={cardStyle}>
              <div style={sectionTitleStyle}>ご案内</div>
              <div style={lineTextStyle}>
                決済完了後、予約情報が反映されるまで数秒かかる場合があります。
              </div>
              <div style={lineTextStyle}>
                メールアドレスを入力している場合は、PIN案内メールも送信されます。
              </div>
            </div>

            <div style={footerButtonRowStyle}>
              <Link href="/partner/bus-reserve" style={secondaryLinkStyle}>
                別日程を予約する
              </Link>
              <Link href="/" style={primaryLinkStyle}>
                トップへ戻る
              </Link>
            </div>
          </div>
        )}

        {!loading && !reservation && (
          <div style={errorBoxStyle}>{msg}</div>
        )}
      </div>
    </div>
  );
}

export default function PartnerBusReserveSuccessPage() {
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

const pageStyle: React.CSSProperties = {
  maxWidth: 820,
  margin: "40px auto",
  padding: 20,
  fontFamily: "system-ui",
};

const containerStyle: React.CSSProperties = {
  display: "grid",
  gap: 14,
};

const titleStyle: React.CSSProperties = {
  fontSize: 28,
  fontWeight: 900,
  margin: 0,
  marginBottom: 4,
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gap: 14,
};

const infoBoxStyle: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 16,
  padding: 16,
  background: "#fafafa",
  color: "#444",
};

const pinCardStyle: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 16,
  padding: 18,
  background: "#f8fafc",
};

const subTitleStyle: React.CSSProperties = {
  fontSize: 14,
  color: "#666",
  marginBottom: 8,
};

const pinStyle: React.CSSProperties = {
  fontSize: 40,
  fontWeight: 900,
  letterSpacing: 6,
  textAlign: "center",
  padding: "18px 12px",
  borderRadius: 16,
  background: "#fff",
  border: "2px solid #111",
  marginBottom: 14,
};

const detailListStyle: React.CSSProperties = {
  fontSize: 14,
  color: "#444",
  lineHeight: 1.8,
};

const cardStyle: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 16,
  padding: 16,
  background: "#fff",
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 800,
  marginBottom: 8,
};

const lineTextStyle: React.CSSProperties = {
  fontSize: 14,
  color: "#444",
  lineHeight: 1.8,
};

const errorBoxStyle: React.CSSProperties = {
  border: "1px solid #ffd0d8",
  borderRadius: 16,
  padding: 16,
  background: "#fff3f5",
  color: "#b00020",
  whiteSpace: "pre-wrap",
};

const footerButtonRowStyle: React.CSSProperties = {
  display: "flex",
  gap: 12,
  flexWrap: "wrap",
};

const primaryLinkStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "12px 16px",
  borderRadius: 12,
  background: "#111",
  color: "#fff",
  textDecoration: "none",
  fontWeight: 800,
};

const secondaryLinkStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "12px 16px",
  borderRadius: 12,
  background: "#fff",
  color: "#111",
  textDecoration: "none",
  fontWeight: 700,
  border: "1px solid #d1d5db",
};