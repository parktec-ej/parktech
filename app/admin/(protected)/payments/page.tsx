"use client";

import { Suspense, useEffect, useMemo, useState } from "react";

type PaymentItem = {
  id: string;
  paymentRef: string | null;
  recognizedDate: string;
  kind: "RESERVATION" | "HOURLY" | "EVENT";
  status: string;
  refunded: boolean;
  displayStatus: "完了" | "キャンセル" | "返金";
  placeName: string;
  spotLabel: string | null;
  customerName: string | null;
  plate: string | null;
  email: string | null;
  phone: string | null;
  useDate: string | null;
  grossAmount: number;
};

type PlaceOpt = { id: string; name: string };

type Filters = {
  dateFrom: string;
  dateTo: string;
  placeId: string;
  customerName: string;
  plate: string;
  phone: string;
  minAmount: string;
  maxAmount: string;
  status: "" | "completed" | "canceled" | "refunded";
};

const EMPTY_FILTERS: Filters = {
  dateFrom: "",
  dateTo: "",
  placeId: "",
  customerName: "",
  plate: "",
  phone: "",
  minAmount: "",
  maxAmount: "",
  status: "",
};

function fmtYen(n: number) {
  return `${n.toLocaleString("ja-JP")} 円`;
}

function fmtDateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
}

function buildQuery(f: Filters, page: number) {
  const qs = new URLSearchParams();
  if (f.dateFrom) qs.set("dateFrom", f.dateFrom);
  if (f.dateTo) qs.set("dateTo", f.dateTo);
  if (f.placeId) qs.set("placeId", f.placeId);
  if (f.customerName) qs.set("customerName", f.customerName);
  if (f.plate) qs.set("plate", f.plate);
  if (f.phone) qs.set("phone", f.phone);
  if (f.minAmount) qs.set("minAmount", f.minAmount);
  if (f.maxAmount) qs.set("maxAmount", f.maxAmount);
  if (f.status) qs.set("status", f.status);
  qs.set("page", String(page));
  return qs.toString();
}

function PaymentsPageInner() {
  const [places, setPlaces] = useState<PlaceOpt[]>([]);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [items, setItems] = useState<PaymentItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  // Resend dialog state
  const [resendTarget, setResendTarget] = useState<PaymentItem | null>(null);
  const [resendEmail, setResendEmail] = useState("");
  const [resendBusy, setResendBusy] = useState(false);
  const [resendMsg, setResendMsg] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/places", { cache: "no-store" });
        const json = await res.json();
        if (!cancelled && json?.ok && Array.isArray(json.places)) {
          setPlaces(
            json.places.map((p: { id: string; name: string }) => ({
              id: p.id,
              name: p.name,
            }))
          );
        }
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function search(nextPage = 1) {
    setLoading(true);
    setErr("");
    try {
      const res = await fetch(
        `/api/admin/payments?${buildQuery(filters, nextPage)}`,
        { cache: "no-store" }
      );
      const json = await res.json();
      if (!json.ok) {
        setErr(json.message ?? json.error ?? "検索に失敗しました");
        setItems([]);
        return;
      }
      setItems(json.items ?? []);
      setTotal(json.total ?? 0);
      setTotalPages(json.totalPages ?? 1);
      setPage(json.page ?? 1);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  // Initial load
  useEffect(() => {
    search(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function update<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  function reset() {
    setFilters(EMPTY_FILTERS);
  }

  function openReceipt(paymentRef: string | null) {
    if (!paymentRef) return;
    window.open(
      `/api/receipt/${encodeURIComponent(paymentRef)}/pdf`,
      "_blank",
      "noopener,noreferrer"
    );
  }

  function startResend(item: PaymentItem) {
    if (!item.paymentRef) return;
    setResendTarget(item);
    setResendEmail(item.email ?? "");
    setResendMsg("");
  }

  async function confirmResend() {
    if (!resendTarget?.paymentRef) return;
    setResendBusy(true);
    setResendMsg("");
    try {
      const res = await fetch(
        `/api/admin/payments/${encodeURIComponent(resendTarget.paymentRef)}/resend-receipt`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: resendEmail.trim() }),
        }
      );
      const json = await res.json();
      if (!json.ok) {
        setResendMsg(json.message ?? json.error ?? "送信に失敗しました");
        return;
      }
      setResendMsg(`送信しました: ${json.to}`);
      setTimeout(() => {
        setResendTarget(null);
        setResendMsg("");
      }, 1500);
    } catch (e) {
      setResendMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setResendBusy(false);
    }
  }

  const statusColor = useMemo(
    () =>
      ({
        完了: "#065f46",
        キャンセル: "#92400e",
        返金: "#991b1b",
      }) as const,
    []
  );

  return (
    <main style={{ padding: 24, maxWidth: 1280 }}>
      <h1 style={{ fontSize: 28, marginBottom: 16 }}>支払い管理</h1>

      <section style={cardStyle}>
        <div style={gridStyle}>
          <Field label="開始日">
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => update("dateFrom", e.target.value)}
              style={inputStyle}
            />
          </Field>
          <Field label="終了日">
            <input
              type="date"
              value={filters.dateTo}
              onChange={(e) => update("dateTo", e.target.value)}
              style={inputStyle}
            />
          </Field>
          <Field label="駐車場">
            <select
              value={filters.placeId}
              onChange={(e) => update("placeId", e.target.value)}
              style={inputStyle}
            >
              <option value="">すべて</option>
              {places.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="決済状態">
            <select
              value={filters.status}
              onChange={(e) =>
                update("status", e.target.value as Filters["status"])
              }
              style={inputStyle}
            >
              <option value="">すべて</option>
              <option value="completed">完了</option>
              <option value="canceled">キャンセル</option>
              <option value="refunded">返金</option>
            </select>
          </Field>

          <Field label="顧客名">
            <input
              value={filters.customerName}
              onChange={(e) => update("customerName", e.target.value)}
              placeholder="部分一致"
              style={inputStyle}
            />
          </Field>
          <Field label="車両番号">
            <input
              value={filters.plate}
              onChange={(e) => update("plate", e.target.value)}
              placeholder="部分一致"
              style={inputStyle}
            />
          </Field>
          <Field label="電話番号 (時間貸しのみ)">
            <input
              value={filters.phone}
              onChange={(e) => update("phone", e.target.value)}
              placeholder="部分一致"
              style={inputStyle}
            />
          </Field>

          <Field label="金額（最小）">
            <input
              type="number"
              value={filters.minAmount}
              onChange={(e) => update("minAmount", e.target.value)}
              style={inputStyle}
            />
          </Field>
          <Field label="金額（最大）">
            <input
              type="number"
              value={filters.maxAmount}
              onChange={(e) => update("maxAmount", e.target.value)}
              style={inputStyle}
            />
          </Field>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <button
            type="button"
            onClick={() => search(1)}
            disabled={loading}
            style={primaryBtn}
          >
            {loading ? "検索中..." : "検索"}
          </button>
          <button type="button" onClick={reset} style={secondaryBtn}>
            条件をリセット
          </button>
          {err ? (
            <span style={{ color: "crimson", fontWeight: 700, marginLeft: 8 }}>
              {err}
            </span>
          ) : null}
          <span style={{ marginLeft: "auto", opacity: 0.75, fontSize: 13 }}>
            該当 {total} 件 / {totalPages} ページ
          </span>
        </div>
      </section>

      <section style={{ marginTop: 16 }}>
        <div style={{ overflowX: "auto" }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={th}>決済日時</th>
                <th style={th}>顧客名</th>
                <th style={th}>電話</th>
                <th style={th}>車両番号</th>
                <th style={th}>駐車場・スポット</th>
                <th style={th}>利用日</th>
                <th style={{ ...th, textAlign: "right" }}>金額（税込）</th>
                <th style={th}>状態</th>
                <th style={th}>操作</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ ...td, textAlign: "center", padding: 28 }}>
                    {loading ? "読み込み中..." : "該当する決済がありません"}
                  </td>
                </tr>
              ) : (
                items.map((it) => (
                  <tr key={it.id}>
                    <td style={td}>{fmtDateTime(it.recognizedDate)}</td>
                    <td style={td}>{it.customerName ?? "—"}</td>
                    <td style={td}>{it.phone ?? "—"}</td>
                    <td style={td}>{it.plate ?? "—"}</td>
                    <td style={td}>
                      <div>{it.placeName}</div>
                      <div style={{ fontSize: 12, opacity: 0.7 }}>
                        {it.spotLabel ?? ""}
                      </div>
                    </td>
                    <td style={td}>{it.useDate ?? "—"}</td>
                    <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>
                      {fmtYen(it.grossAmount)}
                    </td>
                    <td style={td}>
                      <span
                        style={{
                          fontWeight: 700,
                          color: statusColor[it.displayStatus],
                        }}
                      >
                        {it.displayStatus}
                      </span>
                    </td>
                    <td style={td}>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          type="button"
                          disabled={!it.paymentRef}
                          onClick={() => openReceipt(it.paymentRef)}
                          style={smallBtn}
                          title="新しいタブで領収書を開きます"
                        >
                          領収書
                        </button>
                        <button
                          type="button"
                          disabled={!it.paymentRef}
                          onClick={() => startResend(it)}
                          style={smallBtnAlt}
                        >
                          再送
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 ? (
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              gap: 8,
              alignItems: "center",
              marginTop: 16,
            }}
          >
            <button
              type="button"
              onClick={() => search(page - 1)}
              disabled={page <= 1 || loading}
              style={smallBtnAlt}
            >
              前へ
            </button>
            <span style={{ fontSize: 13, fontWeight: 700, padding: "0 8px" }}>
              {page} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => search(page + 1)}
              disabled={page >= totalPages || loading}
              style={smallBtnAlt}
            >
              次へ
            </button>
          </div>
        ) : null}
      </section>

      {resendTarget ? (
        <div style={modalOverlay}>
          <div style={modalCard}>
            <h2 style={{ fontSize: 18, marginBottom: 8 }}>領収書メールを再送</h2>
            <div style={{ fontSize: 13, opacity: 0.75, marginBottom: 12 }}>
              {resendTarget.placeName} / {fmtDateTime(resendTarget.recognizedDate)}<br />
              {fmtYen(resendTarget.grossAmount)}
            </div>
            <label>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>送信先メールアドレス</div>
              <input
                type="email"
                value={resendEmail}
                onChange={(e) => setResendEmail(e.target.value)}
                placeholder="例: customer@example.com"
                style={{ ...inputStyle, width: "100%" }}
              />
            </label>
            {resendMsg ? (
              <div
                style={{
                  marginTop: 10,
                  fontSize: 13,
                  color: resendMsg.startsWith("送信しました")
                    ? "#065f46"
                    : "crimson",
                  fontWeight: 700,
                }}
              >
                {resendMsg}
              </div>
            ) : null}
            <div
              style={{
                display: "flex",
                gap: 10,
                marginTop: 16,
                justifyContent: "flex-end",
              }}
            >
              <button
                type="button"
                onClick={() => setResendTarget(null)}
                disabled={resendBusy}
                style={secondaryBtn}
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={confirmResend}
                disabled={resendBusy || !resendEmail.trim()}
                style={primaryBtn}
              >
                {resendBusy ? "送信中..." : "送信"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

export default function PaymentsPage() {
  return (
    <Suspense fallback={<main style={{ padding: 24 }}>読み込み中...</main>}>
      <PaymentsPageInner />
    </Suspense>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "block" }}>
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>
        {label}
      </div>
      {children}
    </label>
  );
}

const cardStyle: React.CSSProperties = {
  border: "1px solid #ddd",
  borderRadius: 12,
  padding: 16,
  background: "#fff",
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
  gap: 12,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: 10,
  border: "1px solid #ccc",
  borderRadius: 10,
  background: "#fff",
};

const primaryBtn: React.CSSProperties = {
  padding: "10px 16px",
  borderRadius: 10,
  border: "1px solid #111",
  background: "#111",
  color: "#fff",
  fontWeight: 800,
  cursor: "pointer",
};

const secondaryBtn: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid #d1d5db",
  background: "#fff",
  color: "#111",
  fontWeight: 700,
  cursor: "pointer",
};

const smallBtn: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 8,
  border: "1px solid #111",
  background: "#111",
  color: "#fff",
  fontWeight: 700,
  cursor: "pointer",
  fontSize: 13,
};

const smallBtnAlt: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 8,
  border: "1px solid #d1d5db",
  background: "#fff",
  color: "#111",
  fontWeight: 700,
  cursor: "pointer",
  fontSize: 13,
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  background: "#fff",
  border: "1px solid #e5e7eb",
  minWidth: 1100,
};

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 8px",
  borderBottom: "1px solid #e5e7eb",
  fontSize: 13,
  background: "#f9fafb",
  whiteSpace: "nowrap",
};

const td: React.CSSProperties = {
  padding: "10px 8px",
  borderBottom: "1px solid #f1f5f9",
  fontSize: 14,
  verticalAlign: "top",
};

const modalOverlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.4)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 50,
  padding: 16,
};

const modalCard: React.CSSProperties = {
  background: "#fff",
  borderRadius: 12,
  padding: 20,
  maxWidth: 460,
  width: "100%",
  boxShadow: "0 12px 40px rgba(0,0,0,0.2)",
};
