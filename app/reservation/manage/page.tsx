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
  status: string;
  pin?: string | null;
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
  refundAmount: number;
};

type DateChangeView = {
  canChange: boolean;
  rule: string;
  dateChangeCount: number;
};

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    CONFIRMED: { bg: "#dcfce7", color: "#166534", label: "確定済み" },
    CANCELED: { bg: "#fee2e2", color: "#991b1b", label: "キャンセル済み" },
    COMPLETED: { bg: "#dbeafe", color: "#1e40af", label: "利用済み" },
  };
  const s = map[status] ?? { bg: "#f3f4f6", color: "#374151", label: status };
  return (
    <span
      style={{
        display: "inline-block",
        padding: "4px 12px",
        borderRadius: 999,
        fontSize: 13,
        fontWeight: 700,
        background: s.bg,
        color: s.color,
      }}
    >
      {s.label}
    </span>
  );
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
  const [dateChange, setDateChange] = useState<DateChangeView | null>(null);

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [newDate, setNewDate] = useState("");
  const [changingDate, setChangingDate] = useState(false);

  async function loadReservation() {
    if (!token) {
      setMsg("token が見つかりません。");
      setReservation(null);
      setCanCancel(false);
      setPolicy(null);
      setDateChange(null);
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
        setMsg(json?.message ?? "予約情報の取得に失敗しました。");
        setReservation(null);
        setCanCancel(false);
        setPolicy(null);
        setDateChange(null);
        return;
      }

      setReservation(json.reservation);
      setCanCancel(Boolean(json.canCancel));
      setPolicy(json.policy ?? null);
      setDateChange(json.dateChange ?? null);
      setMsg(json.message ?? "");
    } catch (error) {
      setMsg(error instanceof Error ? error.message : String(error));
      setReservation(null);
      setCanCancel(false);
      setPolicy(null);
      setDateChange(null);
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
      `キャンセル手数料320円が発生します。返金額は${policy?.refundAmount ?? 0}円です。\n\nキャンセルしますか？`
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

      window.alert("キャンセルが完了しました。返金は数日以内に処理されます。");
      await loadReservation();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }

  async function handleDateChange() {
    if (!token || !newDate) return;

    const ok = window.confirm(
      `利用日を ${newDate} に変更します。\n日付変更は1回のみです。よろしいですか？`
    );
    if (!ok) return;

    setChangingDate(true);

    try {
      const res = await fetch("/api/reservations/change-date", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newDate }),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.ok) {
        window.alert(json?.message ?? "日付変更に失敗しました");
        return;
      }

      window.alert(
        `日付を ${json.newDate} に変更しました。${
          json.newSpotLabel ? `\n区画: ${json.newSpotLabel}` : ""
        }`
      );
      setShowDatePicker(false);
      setNewDate("");
      await loadReservation();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
    } finally {
      setChangingDate(false);
    }
  }

  const isCanceled = reservation?.status === "CANCELED";

  const minDate = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split("T")[0];
  })();

  return (
    <main
      style={{
        maxWidth: 560,
        margin: "0 auto",
        padding: "24px 16px",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <h1
        style={{
          fontSize: 22,
          fontWeight: 900,
          marginBottom: 20,
          letterSpacing: "-0.02em",
        }}
      >
        予約管理
      </h1>

      {loading ? (
        <div
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: 16,
            padding: 20,
            background: "#fafafa",
            color: "#444",
            fontSize: 15,
          }}
        >
          {msg}
        </div>
      ) : reservation ? (
        <div style={{ display: "grid", gap: 16 }}>
          {reservation.pin && !isCanceled && (
            <section
              style={{
                border: "2px solid #111",
                borderRadius: 16,
                padding: 20,
                background: "#fff",
                textAlign: "center",
              }}
            >
              <div
                style={{
                  fontSize: 13,
                  color: "#666",
                  marginBottom: 8,
                  fontWeight: 600,
                }}
              >
                入庫PIN
              </div>
              <div
                style={{
                  fontSize: 40,
                  fontWeight: 900,
                  letterSpacing: "0.15em",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {reservation.pin}
              </div>
              <div style={{ fontSize: 12, color: "#888", marginTop: 6 }}>
                入庫時にこの番号を入力してください
              </div>
            </section>
          )}

          <section
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: 16,
              padding: 20,
              background: "#fff",
            }}
          >
            <div
              style={{
                fontSize: 13,
                color: "#666",
                marginBottom: 12,
                fontWeight: 600,
              }}
            >
              予約内容
            </div>

            <div style={{ fontSize: 15, lineHeight: 2 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>駐車場</span>
                <span style={{ fontWeight: 600 }}>
                  {reservation.placeName || "-"}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>区画</span>
                <span style={{ fontWeight: 600 }}>
                  {reservation.spotLabel || reservation.slot}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>利用日</span>
                <span style={{ fontWeight: 600 }}>{reservation.date}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>氏名</span>
                <span style={{ fontWeight: 600 }}>{reservation.name}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>車両ナンバー</span>
                <span
                  style={{
                    fontWeight: 600,
                    letterSpacing: "0.08em",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {reservation.plate}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>金額</span>
                <span style={{ fontWeight: 600 }}>
                  {reservation.price.toLocaleString("ja-JP")}円
                </span>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span>状態</span>
                <StatusBadge status={reservation.status} />
              </div>
            </div>
          </section>

          {!isCanceled && (
            <section
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 16,
                padding: 20,
                background: "#f8fafc",
              }}
            >
              <div style={{ fontWeight: 800, marginBottom: 12, fontSize: 16 }}>
                日付変更
              </div>

              {dateChange?.canChange ? (
                <>
                  {!showDatePicker ? (
                    <>
                      <div
                        style={{
                          fontSize: 14,
                          color: "#166534",
                          marginBottom: 12,
                        }}
                      >
                        日付変更が可能です（無料・1回限り）
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowDatePicker(true)}
                        style={{
                          width: "100%",
                          padding: "14px 0",
                          borderRadius: 12,
                          border: "1px solid #111",
                          background: "#fff",
                          color: "#111",
                          fontWeight: 700,
                          fontSize: 15,
                          cursor: "pointer",
                        }}
                      >
                        日付を変更する
                      </button>
                    </>
                  ) : (
                    <>
                      <div
                        style={{
                          fontSize: 14,
                          color: "#333",
                          marginBottom: 12,
                        }}
                      >
                        新しい利用日を選択してください
                      </div>
                      <input
                        type="date"
                        value={newDate}
                        min={minDate}
                        onChange={(e) => setNewDate(e.target.value)}
                        style={{
                          width: "100%",
                          padding: "12px",
                          borderRadius: 8,
                          border: "1px solid #d1d5db",
                          fontSize: 16,
                          marginBottom: 12,
                          boxSizing: "border-box",
                        }}
                      />
                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          type="button"
                          onClick={handleDateChange}
                          disabled={!newDate || changingDate}
                          style={{
                            flex: 1,
                            padding: "12px 0",
                            borderRadius: 10,
                            border: "none",
                            background:
                              !newDate || changingDate ? "#d1d5db" : "#111",
                            color: "#fff",
                            fontWeight: 700,
                            fontSize: 15,
                            cursor:
                              !newDate || changingDate
                                ? "not-allowed"
                                : "pointer",
                          }}
                        >
                          {changingDate ? "変更中..." : "変更を確定"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowDatePicker(false);
                            setNewDate("");
                          }}
                          disabled={changingDate}
                          style={{
                            padding: "12px 20px",
                            borderRadius: 10,
                            border: "1px solid #d1d5db",
                            background: "#fff",
                            color: "#666",
                            fontWeight: 600,
                            fontSize: 15,
                            cursor: changingDate ? "not-allowed" : "pointer",
                          }}
                        >
                          戻る
                        </button>
                      </div>
                    </>
                  )}
                  <div
                    style={{
                      marginTop: 12,
                      fontSize: 12,
                      color: "#888",
                      lineHeight: 1.7,
                    }}
                  >
                    ※ 予約受付から24時間以内、1回のみ変更可能です。
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 14, color: "#666", lineHeight: 1.8 }}>
                  {dateChange?.rule === "already_changed"
                    ? "日付変更は1回のみです。すでに変更済みのため、再変更はできません。"
                    : "日付変更の期限を過ぎています（予約受付から24時間以内）。"}
                </div>
              )}
            </section>
          )}

          {!isCanceled && (
            <section
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 16,
                padding: 20,
                background: "#f8fafc",
              }}
            >
              <div style={{ fontWeight: 800, marginBottom: 12, fontSize: 16 }}>
                キャンセル
              </div>

              {canCancel ? (
                <>
                  <div
                    style={{ fontSize: 14, lineHeight: 1.8, color: "#333" }}
                  >
                    <div>
                      キャンセル手数料:
                      <strong> {policy?.cancelFee ?? 0}円</strong>
                    </div>
                    <div
                      style={{ fontSize: 18, fontWeight: 800, marginTop: 4 }}
                    >
                      返金予定額:{" "}
                      {(policy?.refundAmount ?? 0).toLocaleString("ja-JP")}円
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleCancel}
                    disabled={saving}
                    style={{
                      marginTop: 16,
                      width: "100%",
                      padding: "14px 0",
                      borderRadius: 12,
                      border: "none",
                      background: "#dc2626",
                      color: "#fff",
                      fontWeight: 800,
                      fontSize: 16,
                      cursor: saving ? "default" : "pointer",
                      opacity: saving ? 0.6 : 1,
                    }}
                  >
                    {saving ? "処理中..." : "予約をキャンセルする"}
                  </button>

                  <div
                    style={{
                      marginTop: 12,
                      fontSize: 12,
                      color: "#888",
                      lineHeight: 1.7,
                    }}
                  >
                    キャンセルポリシー:
                    予約日の48時間前までキャンセル可能（手数料320円）。48時間以内はキャンセル不可。
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 14, color: "#666", lineHeight: 1.8 }}>
                  キャンセル期限を過ぎているため、この予約はキャンセルできません。
                  <div
                    style={{
                      marginTop: 8,
                      fontSize: 12,
                      color: "#888",
                    }}
                  >
                    ※
                    予約日の48時間前を過ぎるとキャンセルはお受けできません。
                  </div>
                </div>
              )}
            </section>
          )}

          {isCanceled && (
            <section
              style={{
                border: "1px solid #fecaca",
                borderRadius: 16,
                padding: 20,
                background: "#fef2f2",
              }}
            >
              <div
                style={{
                  fontWeight: 800,
                  fontSize: 16,
                  color: "#991b1b",
                  marginBottom: 8,
                }}
              >
                この予約はキャンセル済みです
              </div>
              {reservation.refundAmount != null &&
                reservation.refundAmount > 0 && (
                  <div style={{ fontSize: 14, color: "#666" }}>
                    返金額:{" "}
                    {reservation.refundAmount.toLocaleString("ja-JP")}円
                  </div>
                )}
            </section>
          )}
        </div>
      ) : (
        <div
          style={{
            border: "1px solid #ffd0d8",
            borderRadius: 16,
            padding: 20,
            background: "#fff3f5",
            color: "#b00020",
            fontSize: 15,
            whiteSpace: "pre-wrap",
          }}
        >
          {msg}
        </div>
      )}
    </main>
  );
}

export default function Page() {
  return (
    <Suspense
      fallback={
        <main
          style={{
            maxWidth: 560,
            margin: "0 auto",
            padding: "24px 16px",
            fontFamily: "system-ui, -apple-system, sans-serif",
          }}
        >
          予約情報を読み込んでいます...
        </main>
      }
    >
      <ReservationManagePageInner />
    </Suspense>
  );
}
