"use client";

import { useEffect, useState } from "react";

const PLACE_ID = "e24a57f5-787f-4c2e-9394-e5f54053a955";

function ymdTodayJst() {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}

type ReservationItem = {
  id: string;
  date: string;
  slot: string;
  customerName: string;
  plate: string;
  email: string | null;
  price: number;
  pin: string;
  paid: boolean;
  paidAt: string | null;
  checkedIn: boolean;
  checkedInAt: string | null;
  checkedOutAt: string | null;
  createdAt: string;
  spotId: string | null;
  qrToken: string;
  status: "UNPAID" | "RESERVED" | "CHECKED_IN" | "CHECKED_OUT";
  spot: {
    id: string;
    code: string;
    label: string | null;
  } | null;
};

type ApiResponse = {
  ok: boolean;
  place?: {
    id: string;
    slug: string;
    name: string;
    address: string | null;
  };
  date?: string;
  filters?: {
    status: string;
    q: string;
    sort: string;
  };
  summary?: {
    total: number;
    unpaid: number;
    reserved: number;
    checkedIn: number;
    checkedOut: number;
  };
  reservations?: ReservationItem[];
  error?: string;
  message?: string;
};

function statusLabel(status: ReservationItem["status"]) {
  switch (status) {
    case "UNPAID":
      return "未決済";
    case "RESERVED":
      return "予約済み";
    case "CHECKED_IN":
      return "入庫中";
    case "CHECKED_OUT":
      return "出庫済み";
    default:
      return status;
  }
}

export default function AdminReservationsPage() {
  const [date, setDate] = useState(ymdTodayJst());
  const [status, setStatus] = useState("ALL");
  const [sort, setSort] = useState("slot_asc");
  const [qInput, setQInput] = useState("");
  const [qApplied, setQApplied] = useState("");

  const [loading, setLoading] = useState(true);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [data, setData] = useState<ApiResponse | null>(null);

  async function loadReservations(target: {
    date: string;
    status: string;
    sort: string;
    q: string;
  }) {
    setLoading(true);
    setErr("");

    try {
      const params = new URLSearchParams({
        placeId: PLACE_ID,
        date: target.date,
        status: target.status,
        sort: target.sort,
      });

      if (target.q) {
        params.set("q", target.q);
      }

      const res = await fetch(`/api/admin/reservations?${params.toString()}`, {
        cache: "no-store",
      });

      const text = await res.text();
      let json: ApiResponse | null = null;

      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        setErr(`APIがJSONを返していません (${res.status})`);
        setData(null);
        return;
      }

      if (!json?.ok) {
        setErr(json?.message ?? json?.error ?? "読み込みに失敗しました");
        setData(null);
        return;
      }

      setData(json);
    } catch (e: any) {
      setErr(String(e?.message ?? e));
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadReservations({ date, status, sort, q: qApplied });
  }, [date, status, sort, qApplied]);

  async function doCancel(reservationId: string) {
    if (!confirm("この予約をキャンセルしますか？")) return;

    setActionBusyId(reservationId);
    setErr("");
    setMsg("");

    try {
      const res = await fetch("/api/admin/reservations/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reservationId }),
      });

      const text = await res.text();
      let json: any = null;

      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        setErr(`キャンセルAPIがJSONを返していません (${res.status})`);
        return;
      }

      if (!json?.ok) {
        setErr(json?.message ?? json?.error ?? "キャンセルに失敗しました");
        return;
      }

      setMsg("予約をキャンセルしました");
      await loadReservations({ date, status, sort, q: qApplied });
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setActionBusyId(null);
    }
  }

  async function doForceCheckout(reservationId: string) {
    if (!confirm("この予約を強制出庫しますか？")) return;

    setActionBusyId(reservationId);
    setErr("");
    setMsg("");

    try {
      const res = await fetch("/api/admin/reservations/force-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reservationId }),
      });

      const text = await res.text();
      let json: any = null;

      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        setErr(`強制出庫APIがJSONを返していません (${res.status})`);
        return;
      }

      if (!json?.ok) {
        setErr(json?.message ?? json?.error ?? "強制出庫に失敗しました");
        return;
      }

      setMsg("強制出庫を実行しました");
      await loadReservations({ date, status, sort, q: qApplied });
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setActionBusyId(null);
    }
  }

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: 24 }}>
      <h1 style={{ fontSize: 28, fontWeight: 900, marginBottom: 8 }}>
        予約一覧
      </h1>

      <div style={{ color: "#666", marginBottom: 16 }}>
        対象 Place: {data?.place?.name ?? PLACE_ID}
      </div>

      <div
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 16,
          background: "#fff",
          padding: 16,
          marginBottom: 20,
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "180px 180px 180px 1fr auto",
            gap: 12,
            alignItems: "end",
          }}
        >
          <div>
            <div style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>日付</div>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              style={{
                width: "100%",
                padding: 10,
                borderRadius: 10,
                border: "1px solid #d1d5db",
              }}
            />
          </div>

          <div>
            <div style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>状態</div>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              style={{
                width: "100%",
                padding: 10,
                borderRadius: 10,
                border: "1px solid #d1d5db",
                background: "#fff",
              }}
            >
              <option value="ALL">ALL</option>
              <option value="UNPAID">未決済</option>
              <option value="RESERVED">予約済み</option>
              <option value="CHECKED_IN">入庫中</option>
              <option value="CHECKED_OUT">出庫済み</option>
            </select>
          </div>

          <div>
            <div style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>並び順</div>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              style={{
                width: "100%",
                padding: 10,
                borderRadius: 10,
                border: "1px solid #d1d5db",
                background: "#fff",
              }}
            >
              <option value="slot_asc">区画 昇順</option>
              <option value="slot_desc">区画 降順</option>
              <option value="created_desc">作成 新しい順</option>
              <option value="created_asc">作成 古い順</option>
              <option value="price_desc">金額 高い順</option>
              <option value="price_asc">金額 安い順</option>
              <option value="status">状態順</option>
            </select>
          </div>

          <div>
            <div style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>
              検索（区画 / 氏名 / ナンバー / メール）
            </div>
            <input
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") setQApplied(qInput.trim());
              }}
              placeholder="例: A-04 / テスト / 宮城300"
              style={{
                width: "100%",
                padding: 10,
                borderRadius: 10,
                border: "1px solid #d1d5db",
              }}
            />
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => setQApplied(qInput.trim())}
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid #111",
                background: "#111",
                color: "#fff",
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              検索
            </button>

            <button
              onClick={() => {
                setQInput("");
                setQApplied("");
                loadReservations({ date, status, sort, q: "" });
              }}
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid #d1d5db",
                background: "#fff",
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              クリア
            </button>
          </div>
        </div>

        {data?.summary ? (
          <div
            style={{
              display: "flex",
              gap: 12,
              flexWrap: "wrap",
              marginTop: 16,
            }}
          >
            <div
              style={{
                padding: "10px 14px",
                borderRadius: 999,
                background: "#f3f4f6",
                fontWeight: 700,
              }}
            >
              合計 {data.summary.total}
            </div>
            <div
              style={{
                padding: "10px 14px",
                borderRadius: 999,
                background: "#fff7ed",
                fontWeight: 700,
              }}
            >
              未決済 {data.summary.unpaid}
            </div>
            <div
              style={{
                padding: "10px 14px",
                borderRadius: 999,
                background: "#eef6ff",
                fontWeight: 700,
              }}
            >
              予約済み {data.summary.reserved}
            </div>
            <div
              style={{
                padding: "10px 14px",
                borderRadius: 999,
                background: "#ecfdf3",
                fontWeight: 700,
              }}
            >
              入庫中 {data.summary.checkedIn}
            </div>
            <div
              style={{
                padding: "10px 14px",
                borderRadius: 999,
                background: "#f9fafb",
                fontWeight: 700,
              }}
            >
              出庫済み {data.summary.checkedOut}
            </div>
          </div>
        ) : null}
      </div>

      {msg ? (
        <div style={{ marginBottom: 14, color: "green", fontWeight: 700 }}>
          {msg}
        </div>
      ) : null}

      {err ? (
        <div style={{ marginBottom: 14, color: "crimson", fontWeight: 700 }}>
          {err}
        </div>
      ) : null}

      {loading ? (
        <div>読み込み中...</div>
      ) : !data?.reservations || data.reservations.length === 0 ? (
        <div
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: 16,
            background: "#fff",
            padding: 20,
          }}
        >
          条件に一致する予約はありません。
        </div>
      ) : (
        <div style={{ display: "grid", gap: 14 }}>
          {data.reservations.map((r) => (
            <div
              key={r.id}
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
                    background: "#f3f4f6",
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
                <div>金額: {r.price} 円</div>
                <div>PIN: {r.pin}</div>
                <div>メール: {r.email || "未入力"}</div>
                <div>作成: {new Date(r.createdAt).toLocaleString("ja-JP")}</div>
                <div>決済: {r.paid ? "済み" : "未決済"}</div>
                <div>
                  入庫:{" "}
                  {r.checkedInAt
                    ? new Date(r.checkedInAt).toLocaleString("ja-JP")
                    : "未"}
                </div>
                <div>
                  出庫:{" "}
                  {r.checkedOutAt
                    ? new Date(r.checkedOutAt).toLocaleString("ja-JP")
                    : "未"}
                </div>
              </div>

              <div
                style={{
                  marginTop: 14,
                  display: "flex",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                {(r.status === "RESERVED" || r.status === "UNPAID") && (
                  <button
                    onClick={() => doCancel(r.id)}
                    disabled={actionBusyId === r.id}
                    style={{
                      padding: "10px 14px",
                      borderRadius: 10,
                      border: "1px solid #b91c1c",
                      background: "#fff",
                      color: "#b91c1c",
                      fontWeight: 800,
                      cursor: "pointer",
                      opacity: actionBusyId === r.id ? 0.7 : 1,
                    }}
                  >
                    {actionBusyId === r.id ? "処理中..." : "予約キャンセル"}
                  </button>
                )}

                {r.status === "CHECKED_IN" && (
                  <button
                    onClick={() => doForceCheckout(r.id)}
                    disabled={actionBusyId === r.id}
                    style={{
                      padding: "10px 14px",
                      borderRadius: 10,
                      border: "1px solid #111",
                      background: "#111",
                      color: "#fff",
                      fontWeight: 800,
                      cursor: "pointer",
                      opacity: actionBusyId === r.id ? 0.7 : 1,
                    }}
                  >
                    {actionBusyId === r.id ? "処理中..." : "強制出庫"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}