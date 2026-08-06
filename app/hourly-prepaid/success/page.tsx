"use client";

import { Suspense, useEffect, useState } from "react";

type ParkingSession = {
  id: string;
  status: "PENDING" | "IN" | "OUT";
  paid: boolean;
  checkInAt: string;
  scheduledEndAt: string | null;
  prepaidYen: number | null;
  plate: string | null;
  spot?: { code: string; label: string | null } | null;
  place?: { slug: string; name: string } | null;
};

function formatJst(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function SuccessInner() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [session, setSession] = useState<ParkingSession | null>(null);

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;

    async function load() {
      const params = new URLSearchParams(window.location.search);
      const sessionId = params.get("session_id");

      if (!sessionId) {
        setError("session_id が見つかりません");
        setLoading(false);
        return;
      }

      while (!cancelled && attempts < 10) {
        attempts++;

        try {
          const res = await fetch(
            `/api/hourly-prepaid/by-session?session_id=${encodeURIComponent(sessionId)}`,
            { cache: "no-store" }
          );
          const json = await res.json();

          if (res.ok && json?.ok) {
            const ps: ParkingSession = json.parkingSession;

            if (!cancelled) setSession(ps);

            // webhook 処理が完了したら終了
            if (ps.status === "IN") {
              if (!cancelled) setLoading(false);
              return;
            }
          }
        } catch {
          // 通信エラーはリトライ対象
        }

        await new Promise((r) => setTimeout(r, 1500));
      }

      if (!cancelled) {
        setLoading(false);
        setError(
          "入庫処理の確認に時間がかかっています。決済は完了していますので、しばらくお待ちください。"
        );
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  const gateUrl = session?.place?.slug
    ? `/gate?placeId=${encodeURIComponent(
        session.place.slug
      )}&slot=${encodeURIComponent(session.spot?.code ?? "")}`
    : "/gate";

  return (
    <main style={pageStyle}>
      <h1 style={titleStyle}>
        {loading ? "入庫手続きを確認しています" : "入庫が完了しました"}
      </h1>

      {loading ? (
        <p style={noteStyle}>決済は完了しています。少しお待ちください。</p>
      ) : null}

      {error ? <div style={errorStyle}>{error}</div> : null}

      {session ? (
        <div style={cardStyle}>
          <div style={rowStyle}>
            <span style={labelStyle}>駐車場</span>
            <span>{session.place?.name ?? "-"}</span>
          </div>
          <div style={rowStyle}>
            <span style={labelStyle}>区画</span>
            <span>{session.spot?.label ?? session.spot?.code ?? "-"}</span>
          </div>
          <div style={rowStyle}>
            <span style={labelStyle}>車番</span>
            <span>{session.plate ?? "-"}</span>
          </div>
          <div style={rowStyle}>
            <span style={labelStyle}>入庫</span>
            <span>{formatJst(session.checkInAt)}</span>
          </div>
          <div style={{ ...rowStyle, ...emphasisStyle }}>
            <span style={labelStyle}>出庫期限</span>
            <span>{formatJst(session.scheduledEndAt)}</span>
          </div>
          <div style={rowStyle}>
            <span style={labelStyle}>お支払い</span>
            <span>
              {session.prepaidYen != null
                ? `${session.prepaidYen.toLocaleString()}円`
                : "-"}
            </span>
          </div>
        </div>
      ) : null}

      {!loading && session?.status === "IN" ? (
        <div style={warnStyle}>
          出庫期限を過ぎますと超過料金が発生します。
          延長・出庫は下のボタンからお進みください。
        </div>
      ) : null}

      <a href={gateUrl} style={buttonStyle}>
        延長・出庫はこちら
      </a>
    </main>
  );
}

export default function HourlyPrepaidSuccessPage() {
  return (
    <Suspense fallback={<main style={pageStyle}>読み込み中...</main>}>
      <SuccessInner />
    </Suspense>
  );
}

const pageStyle: React.CSSProperties = {
  maxWidth: 480,
  margin: "0 auto",
  padding: 20,
  fontFamily: "system-ui, sans-serif",
};

const titleStyle: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 700,
  marginBottom: 16,
};

const noteStyle: React.CSSProperties = {
  fontSize: 14,
  color: "#555",
  marginBottom: 16,
};

const cardStyle: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e5e5e5",
  borderRadius: 16,
  padding: 16,
  marginBottom: 16,
};

const rowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  padding: "8px 0",
  fontSize: 15,
};

const labelStyle: React.CSSProperties = {
  color: "#666",
  fontSize: 14,
};

const emphasisStyle: React.CSSProperties = {
  fontWeight: 700,
  fontSize: 17,
  borderTop: "1px solid #eee",
  borderBottom: "1px solid #eee",
};

const errorStyle: React.CSSProperties = {
  background: "#fef2f2",
  border: "1px solid #fecaca",
  borderRadius: 12,
  padding: 12,
  fontSize: 14,
  color: "#991b1b",
  marginBottom: 16,
};

const warnStyle: React.CSSProperties = {
  background: "#fff7ed",
  border: "1px solid #fdba74",
  borderRadius: 12,
  padding: 12,
  fontSize: 14,
  color: "#7c2d12",
  marginBottom: 16,
  lineHeight: 1.7,
};

const buttonStyle: React.CSSProperties = {
  display: "block",
  textAlign: "center",
  background: "#111827",
  color: "#fff",
  borderRadius: 12,
  padding: "14px 16px",
  fontWeight: 700,
  textDecoration: "none",
};
