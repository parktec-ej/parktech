"use client";

import type { ReactNode } from "react";
import CarrierMailBadge from "./CarrierMailBadge";

export type ReservationCardStatus =
  | "UNPAID"
  | "RESERVED"
  | "CHECKED_IN"
  | "CHECKED_OUT"
  | "CANCELED";

export type ReservationCardChangeLog = {
  id: string;
  oldDate: string;
  newDate: string;
  field?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
  changedAt: string;
  changedBy: string;
  reason: string | null;
};

/**
 * 予約一覧と緊急対応で共有するカード。
 * 緊急対応側は一覧APIより取得項目が少ないため、
 * 一覧にしか無い項目（金額・作成日時・未出庫の各時刻・変更履歴）は任意にしている。
 */
export type ReservationCardItem = {
  id: string;
  date: string;
  slot: string;
  customerName: string;
  plate: string;
  email: string | null;
  phone: string | null;
  price?: number | null;
  pin: string;
  paid: boolean;
  checkedIn: boolean;
  checkedInAt: string | null;
  checkedOutAt: string | null;
  unexitNoticeSentAt?: string | null;
  unexitAckAt?: string | null;
  selfCheckedOut?: boolean | null;
  createdAt?: string | null;
  status: ReservationCardStatus;
  spot: { id: string; code: string; label: string | null } | null;
  changeLogs?: ReservationCardChangeLog[];
};

export function statusLabel(status: ReservationCardStatus) {
  switch (status) {
    case "UNPAID":
      return "未決済";
    case "RESERVED":
      return "予約済み";
    case "CHECKED_IN":
      return "入庫中";
    case "CHECKED_OUT":
      return "出庫済み";
    case "CANCELED":
      return "キャンセル済み";
    default:
      return status;
  }
}

// 未出庫対応の進捗バッジ（該当しない予約は null）
export function unexitBadge(r: {
  selfCheckedOut?: boolean | null;
  checkedOutAt: string | null;
  unexitAckAt?: string | null;
  unexitNoticeSentAt?: string | null;
}): { label: string; bg: string; color: string } | null {
  // 自己申告で出庫確定（実QRではないので念のため確認推奨）
  if (r.selfCheckedOut) {
    return { label: "🟢 自己申告で出庫", bg: "#dcfce7", color: "#166534" };
  }
  // 実QR出庫済みなら対応不要
  if (r.checkedOutAt) return null;
  // お客様が「まだ駐車中」と回答（要フォロー）
  if (r.unexitAckAt) {
    return { label: "🟠 まだ駐車中と回答", bg: "#ffedd5", color: "#9a3412" };
  }
  // 確認メール送信済み・返信待ち
  if (r.unexitNoticeSentAt) {
    return { label: "🔵 通知済み・返信待ち", bg: "#dbeafe", color: "#1e40af" };
  }
  return null;
}

function fmtJst(value: string) {
  return new Date(value).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
}

export type DateChangeControls = {
  openId: string | null;
  value: string;
  reason: string;
  onOpen: (id: string) => void;
  onClose: () => void;
  onChangeValue: (value: string) => void;
  onChangeReason: (value: string) => void;
  onSubmit: (id: string) => void;
};

type Props = {
  item: ReservationCardItem;
  busy?: boolean;
  onCancel?: (id: string) => void;
  onForceCheckout?: (id: string) => void;
  onEditEmail?: (item: ReservationCardItem) => void;
  onEditPlate?: (item: ReservationCardItem) => void;
  dateChange?: DateChangeControls;
  /** 緊急対応固有のボタン（PIN再送 / GATE URL送信 / 強制出庫）を差し込む */
  extraActions?: ReactNode;
};

export default function ReservationCard({
  item: r,
  busy = false,
  onCancel,
  onForceCheckout,
  onEditEmail,
  onEditPlate,
  dateChange,
  extraActions,
}: Props) {
  const editBtnStyle: React.CSSProperties = {
    padding: "10px 14px",
    borderRadius: 10,
    border: "1px solid #6b7280",
    background: "#fff",
    color: "#374151",
    fontWeight: 800,
    cursor: "pointer",
  };

  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 16,
        background: "#fff",
        padding: 16,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div style={{ fontSize: 20, fontWeight: 900 }}>
            {r.spot?.label || r.slot}
          </div>
          <div style={{ marginTop: 4, color: "#666", fontSize: 13 }}>
            {r.date} / {r.customerName}
          </div>
        </div>

        <div
          style={{
            padding: "8px 12px",
            borderRadius: 999,
            background: r.status === "CANCELED" ? "#fef2f2" : "#f3f4f6",
            color: r.status === "CANCELED" ? "#b91c1c" : undefined,
            fontWeight: 800,
            height: "fit-content",
          }}
        >
          {statusLabel(r.status)}
        </div>
      </div>

      <div
        style={{
          marginTop: 14,
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(220px, 1fr))",
          gap: 10,
        }}
      >
        <div>ナンバー: {r.plate}</div>
        {r.price != null && <div>金額: {r.price} 円</div>}
        <div>PIN: {r.pin}</div>
        <div>
          メール: {r.email || "未入力"}
          <CarrierMailBadge email={r.email} />
        </div>
        <div>電話: {r.phone || "未入力"}</div>
        {r.createdAt && <div>作成: {fmtJst(r.createdAt)}</div>}
        <div>決済: {r.paid ? "済み" : "未決済"}</div>
        <div>入庫: {r.checkedInAt ? fmtJst(r.checkedInAt) : "未"}</div>
        <div>
          出庫: {r.checkedOutAt ? fmtJst(r.checkedOutAt) : "未"}
          {r.checkedOutAt
            ? r.selfCheckedOut
              ? "（自己申告）"
              : "（QR）"
            : ""}
        </div>
        {(() => {
          const badge = unexitBadge(r);
          if (!badge) return null;
          return (
            <div style={{ marginTop: 2 }}>
              未出庫対応:{" "}
              <span
                style={{
                  display: "inline-block",
                  padding: "2px 8px",
                  borderRadius: 999,
                  fontWeight: 800,
                  fontSize: 12,
                  background: badge.bg,
                  color: badge.color,
                }}
              >
                {badge.label}
              </span>
            </div>
          );
        })()}
      </div>

      <div
        style={{
          marginTop: 14,
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        {onCancel && (r.status === "RESERVED" || r.status === "UNPAID") && (
          <button
            onClick={() => onCancel(r.id)}
            disabled={busy}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid #b91c1c",
              background: "#fff",
              color: "#b91c1c",
              fontWeight: 800,
              cursor: "pointer",
              opacity: busy ? 0.7 : 1,
            }}
          >
            {busy ? "処理中..." : "予約キャンセル"}
          </button>
        )}

        {onForceCheckout && r.status === "CHECKED_IN" && (
          <button
            onClick={() => onForceCheckout(r.id)}
            disabled={busy}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid #111",
              background: "#111",
              color: "#fff",
              fontWeight: 800,
              cursor: "pointer",
              opacity: busy ? 0.7 : 1,
            }}
          >
            {busy ? "処理中..." : "強制出庫"}
          </button>
        )}

        {dateChange &&
          (r.status === "RESERVED" || r.status === "UNPAID") && (
            <>
              {dateChange.openId === r.id ? (
                <div style={{ marginTop: 10, padding: 12, border: "1px solid #d1d5db", borderRadius: 10, background: "#f9fafb", width: "100%" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>代理日付変更</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end" }}>
                    <div>
                      <div style={{ fontSize: 11, color: "#666", marginBottom: 4 }}>新しい日付</div>
                      <input
                        type="date"
                        value={dateChange.value}
                        onChange={(e) => dateChange.onChangeValue(e.target.value)}
                        style={{ padding: 8, borderRadius: 6, border: "1px solid #d1d5db", fontSize: 14 }}
                      />
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: "#666", marginBottom: 4 }}>理由（任意）</div>
                      <input
                        value={dateChange.reason}
                        onChange={(e) => dateChange.onChangeReason(e.target.value)}
                        placeholder="電話依頼 等"
                        style={{ padding: 8, borderRadius: 6, border: "1px solid #d1d5db", fontSize: 14, width: 180 }}
                      />
                    </div>
                    <button
                      onClick={() => dateChange.onSubmit(r.id)}
                      disabled={busy || !dateChange.value}
                      style={{
                        padding: "8px 14px",
                        borderRadius: 8,
                        border: "none",
                        background: busy || !dateChange.value ? "#d1d5db" : "#111",
                        color: "#fff",
                        fontWeight: 700,
                        fontSize: 13,
                        cursor: busy || !dateChange.value ? "not-allowed" : "pointer",
                      }}
                    >
                      {busy ? "変更中..." : "変更確定"}
                    </button>
                    <button
                      onClick={() => dateChange.onClose()}
                      style={{
                        padding: "8px 14px",
                        borderRadius: 8,
                        border: "1px solid #d1d5db",
                        background: "#fff",
                        fontWeight: 700,
                        fontSize: 13,
                        cursor: "pointer",
                      }}
                    >
                      キャンセル
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => dateChange.onOpen(r.id)}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 10,
                    border: "1px solid #2563eb",
                    background: "#fff",
                    color: "#2563eb",
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  📅 代理日付変更
                </button>
              )}
            </>
          )}

        {onEditEmail && r.status !== "CANCELED" && (
          <button onClick={() => onEditEmail(r)} style={editBtnStyle}>
            ✉️ メール編集
          </button>
        )}

        {onEditPlate && r.status !== "CANCELED" && (
          <button onClick={() => onEditPlate(r)} style={editBtnStyle}>
            🚗 ナンバー変更
          </button>
        )}

        {extraActions}
      </div>

      {r.changeLogs && r.changeLogs.length > 0 && (
        <div style={{ marginTop: 14, padding: 12, border: "1px solid #e5e7eb", borderRadius: 10, background: "#f9fafb" }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: "#666" }}>
            📋 変更履歴
          </div>
          {r.changeLogs.map((log) => {
            // field が date 以外（email/plate）は oldValue/newValue を出す。
            // 旧レコードは field が未設定なので従来どおり oldDate/newDate にフォールバック。
            const useValues =
              log.field && log.field !== "date" && log.newValue != null;
            const shownOld = useValues ? log.oldValue || "(未設定)" : log.oldDate;
            const shownNew = useValues ? log.newValue : log.newDate;
            const fieldLabel =
              log.field === "email"
                ? "メール"
                : log.field === "plate"
                  ? "ナンバー"
                  : null;

            return (
              <div key={log.id} style={{ fontSize: 13, lineHeight: 1.8, borderBottom: "1px solid #e5e7eb", paddingBottom: 6, marginBottom: 6 }}>
                {fieldLabel && (
                  <span style={{ color: "#666", marginRight: 6 }}>{fieldLabel}:</span>
                )}
                <span style={{ textDecoration: "line-through", color: "#999" }}>{shownOld}</span>
                {" → "}
                <span style={{ fontWeight: 700 }}>{shownNew}</span>
                <span style={{ color: "#888", marginLeft: 8 }}>
                  ({log.changedBy === "admin" ? "管理者" : log.changedBy === "customer" ? "お客様" : log.changedBy})
                </span>
                <span style={{ color: "#aaa", marginLeft: 8, fontSize: 12 }}>
                  {fmtJst(log.changedAt)}
                </span>
                {log.reason && (
                  <span style={{ color: "#888", marginLeft: 8, fontSize: 12 }}>
                    — {log.reason}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
