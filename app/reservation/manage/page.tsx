"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

type ReservationView = {
  id: string;
  date: string;
  slot: string;
  name: string;
  plate: string;
  email: string | null;
  price: number;
  pin: string | null;
  status: string;
  checkedIn: boolean;
  checkedInAt?: string | null;
  checkedOutAt?: string | null;
  canceledAt?: string | null;
  refundStatus?: string | null;
  refundAmount?: number | null;
  placeName?: string | null;
  spotLabel?: string | null;
};

type PolicyView = {
  rule: string | null;
  canCancel: boolean;
  cancelFee: number;
  refundFee: number;
  refundAmount: number;
};

const COLOR = {
  ink: "#111827",
  inkSoft: "#4b5563",
  border: "#e5e7eb",
  bg: "#ffffff",
  bgSoft: "#f6f7f9",
  primary: "#111827",
  danger: "#b91c1c",
  dangerBg: "#fef2f2",
  ok: "#047857",
  okBg: "#ecfdf5",
};

const styles: Record<string, React.CSSProperties> = {
  main: {
    maxWidth: 560,
    margin: "0 auto",
    padding: "20px 16px 80px",
    fontFamily: "system-ui, -apple-system, 'Helvetica Neue', sans-serif",
    color: COLOR.ink,
    fontSize: 17,
    lineHeight: 1.7,
  },
  h1: {
    fontSize: 26,
    fontWeight: 900,
    margin: "8px 0 20px",
    letterSpacing: "0.02em",
  },
  card: {
    background: COLOR.bg,
    border: `1px solid ${COLOR.border}`,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 15,
    color: COLOR.inkSoft,
    marginBottom: 12,
    fontWeight: 700,
  },
  row: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: 12,
    padding: "10px 0",
    borderBottom: `1px dashed ${COLOR.border}`,
  },
  rowLast: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: 12,
    padding: "10px 0",
  },
  label: {
    fontSize: 15,
    color: COLOR.inkSoft,
    flexShrink: 0,
  },
  value: {
    fontSize: 18,
    fontWeight: 700,
    textAlign: "right",
    wordBreak: "break-all",
  },
  pinBlock: {
    margin: "16px 0 4px",
    padding: "16px 20px",
    border: `2px solid ${COLOR.ink}`,
    borderRadius: 12,
    textAlign: "center",
    background: "#fafafa",
  },
  pinLabel: {
    fontSize: 14,
    color: COLOR.inkSoft,
    marginBottom: 4,
    fontWeight: 700,
  },
  pinCode: {
    fontSize: 32,
    fontWeight: 900,
    letterSpacing: "0.3em",
  },
  notice: {
    fontSize: 15,
    padding: "12px 14px",
    borderRadius: 10,
    marginTop: 12,
    lineHeight: 1.7,
  },
  noticeOk: {
    background: COLOR.okBg,
    color: COLOR.ok,
  },
  noticeDanger: {
    background: COLOR.dangerBg,
    color: COLOR.danger,
  },
  button: {
    display: "block",
    width: "100%",
    padding: "16px 20px",
    border: "none",
    borderRadius: 12,
    fontSize: 17,
    fontWeight: 800,
    cursor: "pointer",
    marginTop: 12,
    textAlign: "center",
  },
  buttonPrimary: {
    background: COLOR.primary,
    color: "#fff",
  },
  buttonDanger: {
    background: COLOR.danger,
    color: "#fff",
  },
  buttonDisabled: {
    background: "#e5e7eb",
    color: "#9ca3af",
    cursor: "not-allowed",
  },
  policyBox: {
    background: COLOR.bgSoft,
    border: `1px solid ${COLOR.border}`,
    borderRadius: 12,
    padding: 14,
    fontSize: 14,
    color: COLOR.inkSoft,
    lineHeight: 1.8,
    marginTop: 8,
  },
  statusBadge: {
    display: "inline-block",
    padding: "4px 12px",
    borderRadius: 999,
    fontSize: 14,
    fontWeight: 800,
  },
  errorBox: {
    border: `1px solid #fecaca`,
    background: COLOR.dangerBg,
    color: COLOR.danger,
    borderRadius: 12,
    padding: 20,
    fontSize: 16,
    lineHeight: 1.7,
  },
};

function statusLabel(s: string) {
  if (s === "CONFIRMED") return { label: "予約確定", bg: COLOR.okBg, color: COLOR.ok };
  if (s === "CANCELED") return { label: "キャンセル済み", bg: "#f3f4f6", color: COLOR.inkSoft };
  return { label: s, bg: "#f3f4f6", color: COLOR.inkSoft };
}

function ReservationManagePageInner() {
  const searchParams = useSearchParams();

  const token = useMemo(() => {
    return String(searchParams.get("token") ?? "").trim();
  }, [searchParams]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("予約情報を読み込んでいます...");
  const [canCancel, setCanCancel] = useState(false);
  const [reservation, setReservation] = useState<ReservationView | null>(null);
  const [policy, setPolicy] = useState<PolicyView | null>(null);

  async function loadReservation() {
    if (!token) {
      setMsg("予約管理用のURLが正しくありません。\nメールに記載のリンクから再度アクセスしてください。");
      setReservation(null);
      setCanCancel(false);
      setPolicy(null);
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const res = await fetch(
        `/api/reservations/manage?token=${encodeURIComponent(token)}`,
        { cache: "no-store" }
      );

      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.ok) {
        setMsg(json?.message ?? "予約が見つかりません");
        setReservation(null);
        setCanCancel(false);
        setPolicy(null);
        return;
      }

      setReservation(json.reservation);
      setCanCancel(Boolean(json.canCancel));
      setPolicy(json.policy ?? null);
      setMsg(json.message ?? "");
    } catch (error) {
      setMsg(error instanceof Error ? error.message : String(error));
      setReservation(null);
      setCanCancel(false);
      setPolicy(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadReservation();
  }, [token]);

  async function handleCancel() {
    if (!token) return;

    const ok = window.confirm(
      `本当に予約をキャンセルしますか？\n\nキャンセル手数料: ${policy?.cancelFee ?? 0}円\n返金予定額: ${policy?.refundAmount ?? 0}円`
    );
    if (!ok) return;

    setSaving(true);

    try {
      const res = await fetch("/api/reservations/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.ok) {
        window.alert(json?.message ?? "キャンセルに失敗しました");
        return;
      }

      window.alert(json?.message ?? "キャンセルが完了しました");
      await loadReservation();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <main style={styles.main}>
      <h1 style={styles.h1}>予約の確認・変更・キャンセル</h1>

      {loading ? (
        <div style={styles.card}>{msg}</div>
      ) : reservation ? (
        <>
          {/* 予約情報 */}
          <div style={styles.card}>
            <div style={styles.cardTitle}>予約内容</div>

            <div style={styles.row}>
              <span style={styles.label}>状態</span>
              <span style={styles.value}>
                <span
                  style={{
                    ...styles.statusBadge,
                    background: statusLabel(reservation.status).bg,
                    color: statusLabel(reservation.status).color,
                  }}
                >
                  {statusLabel(reservation.status).label}
                </span>
              </span>
            </div>

            <div style={styles.row}>
              <span style={styles.label}>駐車場</span>
              <span style={styles.value}>{reservation.placeName || "-"}</span>
            </div>

            <div style={styles.row}>
              <span style={styles.label}>区画</span>
              <span style={styles.value}>{reservation.spotLabel || reservation.slot}</span>
            </div>

            <div style={styles.row}>
              <span style={styles.label}>利用日</span>
              <span style={styles.value}>{reservation.date}</span>
            </div>

            <div style={styles.row}>
              <span style={styles.label}>利用時間</span>
              <span style={styles.value}>{reservation.slot}</span>
            </div>

            <div style={styles.row}>
              <span style={styles.label}>氏名</span>
              <span style={styles.value}>{reservation.name}</span>
            </div>

            <div style={styles.row}>
              <span style={styles.label}>車両ナンバー</span>
              <span style={styles.value}>{reservation.plate}</span>
            </div>

            <div style={styles.rowLast}>
              <span style={styles.label}>お支払い金額</span>
              <span style={styles.value}>{reservation.price.toLocaleString("ja-JP")} 円</span>
            </div>

            {reservation.pin && reservation.status !== "CANCELED" && (
              <div style={styles.pinBlock}>
                <div style={styles.pinLabel}>入出庫用 PINコード</div>
                <div style={styles.pinCode}>{reservation.pin}</div>
              </div>
            )}
          </div>

          {/* 日付変更 (Phase 2) */}
          {reservation.status === "CONFIRMED" && !reservation.checkedIn && (
            <div style={styles.card}>
              <div style={styles.cardTitle}>日付を変更する</div>
              <button
                type="button"
                disabled
                style={{ ...styles.button, ...styles.buttonDisabled }}
              >
                日付を変更する（準備中）
              </button>
              <div style={{ fontSize: 13, color: COLOR.inkSoft, marginTop: 8, textAlign: "center" }}>
                ※ 日付変更機能はまもなく公開予定です
              </div>
            </div>
          )}

          {/* キャンセル */}
          <div style={styles.card}>
            <div style={styles.cardTitle}>キャンセル</div>

            {reservation.status === "CANCELED" ? (
              <>
                <div style={{ ...styles.notice, ...styles.noticeOk }}>
                  この予約はキャンセル済みです。
                </div>
                <div style={{ marginTop: 12 }}>
                  <div style={styles.row}>
                    <span style={styles.label}>キャンセル料</span>
                    <span style={styles.value}>{(policy?.cancelFee ?? 0).toLocaleString("ja-JP")} 円</span>
                  </div>
                  <div style={styles.rowLast}>
                    <span style={styles.label}>返金額</span>
                    <span style={styles.value}>{(policy?.refundAmount ?? 0).toLocaleString("ja-JP")} 円</span>
                  </div>
                </div>
              </>
            ) : canCancel ? (
              <>
                <div style={{ marginTop: 4 }}>
                  <div style={styles.row}>
                    <span style={styles.label}>キャンセル手数料</span>
                    <span style={styles.value}>{(policy?.cancelFee ?? 0).toLocaleString("ja-JP")} 円</span>
                  </div>
                  <div style={styles.rowLast}>
                    <span style={styles.label}>返金予定額</span>
                    <span style={styles.value}>{(policy?.refundAmount ?? 0).toLocaleString("ja-JP")} 円</span>
                  </div>
                </div>

                <div style={styles.policyBox}>
                  <strong style={{ color: COLOR.ink }}>キャンセルポリシー</strong>
                  <br />
                  ・利用日の48時間前まで: 手数料320円
                  <br />
                  ・利用日の48時間以内: キャンセル不可（全額請求）
                </div>

                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={saving}
                  style={{
                    ...styles.button,
                    ...(saving ? styles.buttonDisabled : styles.buttonDanger),
                  }}
                >
                  {saving ? "処理中..." : "予約をキャンセルする"}
                </button>
              </>
            ) : (
              <>
                <div style={{ ...styles.notice, ...styles.noticeDanger }}>
                  {msg || "この予約はキャンセルできません"}
                </div>
                <div style={styles.policyBox}>
                  <strong style={{ color: COLOR.ink }}>キャンセルポリシー</strong>
                  <br />
                  ・利用日の48時間前まで: 手数料320円
                  <br />
                  ・利用日の48時間以内: キャンセル不可（全額請求）
                </div>
              </>
            )}
          </div>
        </>
      ) : (
        <div style={styles.errorBox}>{msg || "予約が見つかりません"}</div>
      )}
    </main>
  );
}

export default function Page() {
  return (
    <Suspense
      fallback={
        <main style={styles.main}>
          <div style={styles.card}>予約情報を読み込んでいます...</div>
        </main>
      }
    >
      <ReservationManagePageInner />
    </Suspense>
  );
}
