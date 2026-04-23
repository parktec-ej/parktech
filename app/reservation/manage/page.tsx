"use client";

import { useEffect, useMemo, useState } from "react";
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
  cancelFee: number;
  refundFee: number;
  refundAmount: number;
};

export default function Page() {
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
      setMsg("token が見つかりません。");
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
        setMsg(json?.message ?? "予約情報の取得に失敗しました。");
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

    const ok = window.confirm("本当に予約をキャンセルしますか？");
    if (!ok) return;

    setSaving(true);

    try {
      const res = await fetch("/api/reservations/cancel", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
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
    <main
      style={{
        maxWidth: 980,
        margin: "40px auto",
        padding: 20,
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <h1 style={{ fontSize: 28, fontWeight: 900, marginBottom: 16 }}>
        予約確認・キャンセル
      </h1>

      {loading ? (
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
      ) : reservation ? (
        <div style={{ display: "grid", gap: 20 }}>
          <section
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: 16,
              padding: 24,
              background: "#fff",
            }}
          >
            <div style={{ fontSize: 14, color: "#666", marginBottom: 16 }}>
              予約内容
            </div>

            <div style={{ lineHeight: 2, fontSize: 16 }}>
              <div>駐車場: {reservation.placeName || "-"}</div>
              <div>区画: {reservation.spotLabel || reservation.slot}</div>
              <div>利用日: {reservation.date}</div>
              <div>利用時間: {reservation.slot}</div>
              <div>氏名: {reservation.name}</div>
              <div>車両ナンバー: {reservation.plate}</div>
              <div>金額: {reservation.price}円</div>
              <div>状態: {reservation.status}</div>
            </div>
          </section>

          <section
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: 16,
              padding: 24,
              background: "#f8fafc",
              lineHeight: 1.9,
            }}
          >
            <div
              style={{
                fontWeight: 900,
                marginBottom: 14,
                fontSize: 18,
              }}
            >
              キャンセルについて
            </div>

            {canCancel ? (
              <>
                <div>現在この予約はキャンセル可能です。</div>
                <div>取消後は元に戻せません。</div>

                <div style={{ marginTop: 16 }}>
                  <div>キャンセル料: {policy?.cancelFee ?? 0}円</div>
                  <div>返金手数料: {policy?.refundFee ?? 0}円</div>
                  <div style={{ fontWeight: 800 }}>
                    返金予定額: {policy?.refundAmount ?? 0}円
                  </div>
                </div>

                <div
                  style={{
                    marginTop: 14,
                    fontSize: 14,
                    color: "#555",
                  }}
                >
                  キャンセルポリシー:
                  <br />
                  ・利用日の2日前まで: 利用料金の50% + 返金手数料300円
                  <br />
                  ・利用日の前日〜当日: 返金なし
                </div>

                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={saving}
                  style={{
                    marginTop: 18,
                    padding: "14px 24px",
                    borderRadius: 16,
                    border: "none",
                    background: "#111",
                    color: "#fff",
                    fontWeight: 800,
                    fontSize: 16,
                    cursor: saving ? "default" : "pointer",
                    opacity: saving ? 0.7 : 1,
                  }}
                >
                  {saving ? "処理中..." : "予約をキャンセルする"}
                </button>
              </>
            ) : (
              <>
                <div>{msg || "この予約はキャンセルできません。"}</div>

                <div style={{ marginTop: 16 }}>
                  <div>キャンセル料: {policy?.cancelFee ?? 0}円</div>
                  <div>返金手数料: {policy?.refundFee ?? 0}円</div>
                  <div style={{ fontWeight: 800 }}>
                    返金予定額: {policy?.refundAmount ?? 0}円
                  </div>
                </div>
              </>
            )}
          </section>
        </div>
      ) : (
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
    </main>
  );
}