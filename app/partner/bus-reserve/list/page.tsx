"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type BusReservation = {
  id: string;
  date: string;
  eventName: string | null;
  name: string;
  vehicleType: "bus" | "car" | null;
  hasExtraCar: boolean | null;
  price: number;
  status: string;
  slot: string;
  arrivalTime: string | null;
  cancelToken: string | null;
  createdAt: string;
  manageUrl: string | null;
};

function formatYen(value: number | null | undefined) {
  if (!Number.isFinite(value ?? NaN)) return "-";
  return `${Number(value).toLocaleString("ja-JP")}円`;
}

function vehicleTypeLabel(v: string | null | undefined, hasExtraCar: boolean | null | undefined) {
  if (v === "bus") return hasExtraCar ? "バス（＋普通車）" : "バス";
  if (v === "car") return "普通車";
  return "-";
}

function parkingLocationLabel(slot: string) {
  if (slot === "A-20") return "バス専用レーン ＋ A-20";
  return "バス専用レーン";
}

export default function PartnerBusReservationListPage() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [reservations, setReservations] = useState<BusReservation[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setErr("");
      try {
        const res = await fetch("/api/partner/bus-reservations", {
          cache: "no-store",
        });

        if (cancelled) return;

        if (res.status === 401) {
          window.location.href = "/partner/login";
          return;
        }

        const json = await res.json().catch(() => null);

        if (!res.ok || !json?.ok) {
          setReservations([]);
          setErr(json?.message || json?.error || "予約一覧の取得に失敗しました");
          return;
        }

        setReservations(Array.isArray(json.reservations) ? json.reservations : []);
      } catch (e) {
        if (!cancelled) {
          setReservations([]);
          setErr("通信エラーが発生しました");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main style={pageStyle}>
      <div style={containerStyle}>
        <div style={headerRowStyle}>
          <div>
            <h1 style={titleStyle}>バス予約一覧</h1>
            <p style={descStyle}>
              バス予約の一覧です。各予約の「管理する」から、キャンセルや日付変更ができます。
            </p>
          </div>
          <div style={headerActionsStyle}>
            <Link href="/partner/bus-reserve" style={newReserveLinkStyle}>
              ＋ 新規予約
            </Link>
            <a
              href="/bus-manual.pdf"
              target="_blank"
              rel="noopener"
              style={manualLinkStyle}
            >
              📄 操作マニュアル
            </a>
            <form method="post" action="/api/partner/logout">
              <button type="submit" style={logoutButtonStyle}>
                ログアウト
              </button>
            </form>
          </div>
        </div>

        {loading ? (
          <div style={infoBoxStyle}>読み込み中です...</div>
        ) : err ? (
          <div style={errorBoxStyle}>{err}</div>
        ) : reservations.length === 0 ? (
          <div style={infoBoxStyle}>バス予約はまだありません。</div>
        ) : (
          <div style={cardStyle}>
            <div style={tableWrapStyle}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>利用日</th>
                    <th style={thStyle}>イベント名</th>
                    <th style={thStyle}>予約名</th>
                    <th style={thStyle}>車両タイプ</th>
                    <th style={thStyle}>駐車場所</th>
                    <th style={thStyleRight}>料金</th>
                    <th style={thStyle}>状態</th>
                    <th style={thStyle}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {reservations.map((r) => {
                    const isCanceled = r.status === "CANCELED";
                    return (
                      <tr key={r.id}>
                        <td style={tdStyle}>{r.date}</td>
                        <td style={tdStyle}>{r.eventName || "-"}</td>
                        <td style={tdStyle}>{r.name}</td>
                        <td style={tdStyle}>
                          {vehicleTypeLabel(r.vehicleType, r.hasExtraCar)}
                        </td>
                        <td style={tdStyle}>{parkingLocationLabel(r.slot)}</td>
                        <td style={tdStyleRight}>{formatYen(r.price)}</td>
                        <td style={tdStyle}>
                          <span
                            style={{
                              ...badgeStyle,
                              background: isCanceled ? "#fee2e2" : "#dcfce7",
                              color: isCanceled ? "#991b1b" : "#166534",
                            }}
                          >
                            {isCanceled ? "キャンセル済み" : "予約確定"}
                          </span>
                        </td>
                        <td style={tdStyle}>
                          {r.manageUrl ? (
                            <Link href={r.manageUrl} style={manageButtonStyle}>
                              管理する
                            </Link>
                          ) : (
                            <button
                              type="button"
                              disabled
                              style={manageButtonDisabledStyle}
                              title="この予約は管理リンクを発行できません"
                            >
                              管理不可
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "#f9fafb",
  padding: 24,
};

const containerStyle: React.CSSProperties = {
  maxWidth: 1100,
  margin: "0 auto",
};

const headerRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 16,
  marginBottom: 20,
  flexWrap: "wrap",
};

const headerActionsStyle: React.CSSProperties = {
  display: "flex",
  gap: 10,
  alignItems: "center",
  flexWrap: "wrap",
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 28,
  fontWeight: 900,
  color: "#111827",
};

const descStyle: React.CSSProperties = {
  marginTop: 8,
  marginBottom: 0,
  color: "#6b7280",
  lineHeight: 1.7,
};

const newReserveLinkStyle: React.CSSProperties = {
  display: "inline-block",
  border: "1px solid #111827",
  borderRadius: 12,
  background: "#111827",
  color: "#fff",
  padding: "10px 14px",
  fontWeight: 800,
  textDecoration: "none",
};

const manualLinkStyle: React.CSSProperties = {
  display: "inline-block",
  border: "1px solid #d1d5db",
  borderRadius: 12,
  background: "#fff",
  color: "#111827",
  padding: "10px 14px",
  fontWeight: 700,
  textDecoration: "none",
};

const logoutButtonStyle: React.CSSProperties = {
  border: "1px solid #d1d5db",
  borderRadius: 12,
  background: "#fff",
  color: "#111827",
  padding: "10px 14px",
  fontWeight: 700,
};

const cardStyle: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 20,
  background: "#fff",
  padding: 8,
};

const tableWrapStyle: React.CSSProperties = {
  overflowX: "auto",
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 14,
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "12px 14px",
  color: "#6b7280",
  fontWeight: 700,
  borderBottom: "1px solid #e5e7eb",
  whiteSpace: "nowrap",
};

const thStyleRight: React.CSSProperties = {
  ...thStyle,
  textAlign: "right",
};

const tdStyle: React.CSSProperties = {
  padding: "12px 14px",
  color: "#111827",
  borderBottom: "1px solid #f3f4f6",
  verticalAlign: "middle",
  whiteSpace: "nowrap",
};

const tdStyleRight: React.CSSProperties = {
  ...tdStyle,
  textAlign: "right",
  fontWeight: 700,
};

const badgeStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "4px 10px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 800,
};

const manageButtonStyle: React.CSSProperties = {
  display: "inline-block",
  border: "1px solid #111827",
  borderRadius: 10,
  background: "#fff",
  color: "#111827",
  padding: "8px 14px",
  fontWeight: 800,
  fontSize: 13,
  textDecoration: "none",
};

const manageButtonDisabledStyle: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 10,
  background: "#f3f4f6",
  color: "#9ca3af",
  padding: "8px 14px",
  fontWeight: 700,
  fontSize: 13,
  cursor: "not-allowed",
};

const infoBoxStyle: React.CSSProperties = {
  border: "1px solid #dbeafe",
  background: "#eff6ff",
  color: "#1d4ed8",
  borderRadius: 14,
  padding: "14px 16px",
  fontWeight: 700,
};

const errorBoxStyle: React.CSSProperties = {
  border: "1px solid #fecaca",
  background: "#fef2f2",
  color: "#991b1b",
  borderRadius: 14,
  padding: "14px 16px",
  fontWeight: 700,
  lineHeight: 1.7,
};
