"use client";

import { Suspense, useEffect, useMemo, useState } from "react";

type Place = { id: string; slug: string; name: string };
type Spot = { id: string; code: string; label: string | null };

type ReservationRow = {
  id: string;
  date: string;
  slot: string;
  name: string;
  plate: string;
  email: string | null;
  phone: string | null;
  pin: string;
  paid: boolean;
  checkedIn: boolean;
  checkedInAt: string | null;
  checkedOutAt: string | null;
  status: string;
  paymentRef: string | null;
  place: Place | null;
  spot: Spot | null;
  activeSession: { id: string } | null;
};

type SessionRow = {
  id: string;
  sessionType: string;
  status: "IN" | "OUT";
  plate: string | null;
  phone: string | null;
  customerName: string | null;
  checkInAt: string;
  checkOutAt: string | null;
  totalMinutes: number | null;
  totalYen: number | null;
  paid: boolean;
  paymentRef: string | null;
  place: Place | null;
  spot: Spot | null;
  reservation: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    pin: string;
  } | null;
};

type PaymentRow = {
  id: string;
  paymentRef: string | null;
  paymentIntentId: string | null;
  kind: string;
  status: string;
  refunded: boolean;
  recognizedDate: string;
  serviceDate: string | null;
  placeNameSnapshot: string;
  spotLabelSnapshot: string | null;
  spotCodeSnapshot: string | null;
  customerNameSnapshot: string | null;
  plateSnapshot: string | null;
  grossAmount: number;
  reservationId: string | null;
  parkingSessionId: string | null;
};

type SearchResp = {
  ok: boolean;
  q: string;
  reservations: ReservationRow[];
  parkingSessions: SessionRow[];
  payments: PaymentRow[];
  error?: string;
  message?: string;
};

function fmtDateTime(value: string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
}

function fmtYen(n: number | null | undefined) {
  if (n == null) return "-";
  return `${n.toLocaleString("ja-JP")} 円`;
}

function EmergencyPageInner() {
  const [operator, setOperator] = useState<string>("");
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [data, setData] = useState<SearchResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [places, setPlaces] = useState<Place[]>([]);
  const [showCreate, setShowCreate] = useState(false);

  // Manual reservation form state
  const [cName, setCName] = useState("");
  const [cEmail, setCEmail] = useState("");
  const [cPlate, setCPlate] = useState("");
  const [cPhone, setCPhone] = useState("");
  const [cPlaceId, setCPlaceId] = useState("");
  const [cSlot, setCSlot] = useState("");
  const [cStartAt, setCStartAt] = useState("");
  const [cEndAt, setCEndAt] = useState("");
  const [cPaymentRef, setCPaymentRef] = useState("");
  const [cPrice, setCPrice] = useState("");
  const [cNote, setCNote] = useState("");

  // Operator info
  useEffect(() => {
    fetch("/api/admin/me", { cache: "no-store" })
      .then((r) => r.json().catch(() => null))
      .then((j) => {
        if (j?.ok && j.email) setOperator(j.email);
      })
      .catch(() => {});
    fetch("/api/admin/places", { cache: "no-store" })
      .then((r) => r.json().catch(() => null))
      .then((j) => {
        if (j?.ok && Array.isArray(j.places)) {
          setPlaces(
            j.places.map((p: any) => ({ id: p.id, slug: p.slug, name: p.name }))
          );
        }
      })
      .catch(() => {});
  }, []);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  async function runSearch(query: string) {
    if (!query) {
      setData(null);
      return;
    }
    setLoading(true);
    setErr("");
    try {
      const res = await fetch(
        `/api/admin/emergency/search?q=${encodeURIComponent(query)}`,
        { cache: "no-store" }
      );
      const json: SearchResp = await res.json();
      if (!json.ok) {
        setErr(json.message ?? json.error ?? "検索に失敗しました");
        setData(null);
        return;
      }
      setData(json);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    runSearch(qDebounced);
  }, [qDebounced]);

  async function action(
    label: string,
    url: string,
    body: any,
    confirmText: string
  ) {
    if (!confirm(confirmText)) return;
    const reason = prompt(`[${label}] 理由（操作ログに記録します）`) ?? "";
    setBusy(`${label}-${body?.reservationId ?? body?.parkingSessionId ?? "x"}`);
    setErr("");
    setMsg("");
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, reason }),
      });
      const json = await res.json();
      if (!json.ok) {
        setErr(json.message ?? json.error ?? `${label}に失敗しました`);
        return;
      }
      setMsg(`${label} OK`);
      if (qDebounced) runSearch(qDebounced);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  function doResendPin(r: ReservationRow) {
    action(
      "PIN再送",
      "/api/admin/emergency/resend-pin",
      { reservationId: r.id },
      `${r.name} 様 (${r.email ?? "メール未登録"}) に PIN を再送しますか？`
    );
  }
  function doSendGateUrl(r: ReservationRow) {
    action(
      "GATE URL送信",
      "/api/admin/emergency/send-gate-url",
      { reservationId: r.id },
      `${r.name} 様 (${r.email ?? "メール未登録"}) にゲートURLを送信しますか？`
    );
  }
  function doForceCheckout(s: SessionRow) {
    action(
      "強制出庫",
      "/api/admin/parking-sessions/force-checkout",
      { parkingSessionId: s.id },
      `セッション ${s.id.slice(0, 8)}… を強制出庫しますか？\n※精算完了にはなりません。`
    );
  }
  function doForceCheckoutForReservation(r: ReservationRow) {
    if (!r.activeSession) return;
    action(
      "強制出庫",
      "/api/admin/parking-sessions/force-checkout",
      { parkingSessionId: r.activeSession.id },
      `${r.name} 様 (${r.spot?.label ?? r.spot?.code ?? r.slot}) を強制出庫しますか？\n※精算完了にはなりません。`
    );
  }

  async function doCreateReservation() {
    if (!cName || !cPlate || !cPlaceId || !cSlot || !cStartAt) {
      setErr("必須項目: 名前 / 車両ナンバー / 駐車場 / 区画 / 開始日");
      return;
    }
    if (!confirm(`${cName} 様の予約を作成しますか？\n（緊急時のみ使用）`)) return;
    const reason = prompt("[手動予約作成] 理由（操作ログに記録します）") ?? "";
    setBusy("create");
    setErr("");
    setMsg("");
    try {
      const res = await fetch("/api/admin/emergency/create-reservation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: cName,
          email: cEmail,
          vehicleNumber: cPlate,
          phone: cPhone,
          placeId: cPlaceId,
          slot: cSlot,
          startAt: cStartAt,
          endAt: cEndAt,
          paymentRef: cPaymentRef,
          price: cPrice ? Number(cPrice) : 0,
          note: cNote,
          reason,
        }),
      });
      const json = await res.json();
      if (!json.ok) {
        setErr(json.message ?? json.error ?? "予約作成に失敗しました");
        return;
      }
      setMsg(`予約を作成しました (PIN: ${json.reservation?.pin ?? "-"})`);
      // Reset form
      setCName("");
      setCEmail("");
      setCPlate("");
      setCPhone("");
      setCSlot("");
      setCStartAt("");
      setCEndAt("");
      setCPaymentRef("");
      setCPrice("");
      setCNote("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const hasResults = useMemo(() => {
    if (!data) return false;
    return (
      data.reservations.length > 0 ||
      data.parkingSessions.length > 0 ||
      data.payments.length > 0
    );
  }, [data]);

  return (
    <main style={pageStyle}>
      <div style={headerStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 28 }}>🚨</span>
          <h1 style={{ fontSize: 24, fontWeight: 900, margin: 0 }}>緊急対応</h1>
        </div>
        <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
          operator: {operator || "(不明)"}
        </div>
      </div>

      {err ? <div style={errStyle}>{err}</div> : null}
      {msg ? <div style={okStyle}>{msg}</div> : null}

      {/* SEARCH */}
      <section style={sectionStyle}>
        <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 8 }}>
          検索（部分一致: 名前 / 車両 / email / PIN / slot / place）
        </div>
        <input
          autoFocus
          inputMode="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="例: 5055 / 山田 / A-02 / 1234"
          style={bigInput}
        />
        <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>
          {loading ? "検索中..." : data ? `q="${data.q}"` : "入力すると自動検索"}
        </div>
      </section>

      {/* RESULTS */}
      {data && hasResults ? (
        <>
          {/* Reservations */}
          {data.reservations.length > 0 ? (
            <section style={sectionStyle}>
              <div style={resultHeader}>
                <span style={{ fontWeight: 800 }}>予約 ({data.reservations.length})</span>
              </div>
              {data.reservations.map((r) => (
                <div key={r.id} style={cardStyle}>
                  <div style={cardTopRow}>
                    <div style={{ fontWeight: 800 }}>{r.name}</div>
                    <div style={pillStyle(r.status === "CANCELED" ? "#dc2626" : r.checkedIn ? "#0369a1" : "#16a34a")}>
                      {r.status === "CANCELED"
                        ? "キャンセル"
                        : r.checkedOutAt
                        ? "出庫済"
                        : r.checkedIn
                        ? "入庫中"
                        : r.paid
                        ? "決済済"
                        : "未決済"}
                    </div>
                  </div>
                  <div style={metaRow}>
                    <Meta k="駐車場" v={r.place?.name ?? "-"} />
                    <Meta k="slot" v={r.spot?.label ?? r.spot?.code ?? r.slot} />
                    <Meta k="日付" v={r.date} />
                    <Meta k="車両" v={r.plate} />
                    <Meta k="email" v={r.email ?? "-"} />
                    <Meta k="phone" v={r.phone ?? "-"} />
                    <Meta k="PIN" v={r.pin} mono />
                    <Meta k="paymentRef" v={r.paymentRef ?? "-"} mono />
                  </div>
                  <div style={actionsRow}>
                    <button
                      type="button"
                      disabled={busy === `PIN再送-${r.id}` || !r.email}
                      onClick={() => doResendPin(r)}
                      style={primaryBtn}
                    >
                      📧 PIN再送
                    </button>
                    <button
                      type="button"
                      disabled={busy === `GATE URL送信-${r.id}` || !r.email}
                      onClick={() => doSendGateUrl(r)}
                      style={primaryBtn}
                    >
                      🚪 GATE URL送信
                    </button>
                    {r.activeSession ? (
                      <button
                        type="button"
                        disabled={busy === `強制出庫-${r.activeSession.id}`}
                        onClick={() => doForceCheckoutForReservation(r)}
                        style={dangerBtn}
                      >
                        🚗 強制出庫
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </section>
          ) : null}

          {/* Parking Sessions */}
          {data.parkingSessions.length > 0 ? (
            <section style={sectionStyle}>
              <div style={resultHeader}>
                <span style={{ fontWeight: 800 }}>
                  入庫セッション ({data.parkingSessions.length})
                </span>
              </div>
              {data.parkingSessions.map((s) => (
                <div key={s.id} style={cardStyle}>
                  <div style={cardTopRow}>
                    <div style={{ fontWeight: 800 }}>
                      {s.customerName ?? "(名前未登録)"}
                    </div>
                    <div
                      style={pillStyle(s.status === "IN" ? "#0369a1" : "#475569")}
                    >
                      {s.status === "IN" ? "入庫中" : "出庫済"}
                    </div>
                  </div>
                  <div style={metaRow}>
                    <Meta k="種別" v={s.sessionType === "HOURLY" ? "時間貸し" : "予約"} />
                    <Meta k="駐車場" v={s.place?.name ?? "-"} />
                    <Meta k="slot" v={s.spot?.label ?? s.spot?.code ?? "-"} />
                    <Meta k="入庫" v={fmtDateTime(s.checkInAt)} />
                    <Meta k="出庫" v={fmtDateTime(s.checkOutAt)} />
                    <Meta k="車両" v={s.plate ?? "-"} />
                    <Meta k="phone" v={s.phone ?? "-"} />
                    <Meta k="料金" v={fmtYen(s.totalYen)} />
                  </div>
                  <div style={actionsRow}>
                    {s.status === "IN" ? (
                      <button
                        type="button"
                        disabled={busy === `強制出庫-${s.id}`}
                        onClick={() => doForceCheckout(s)}
                        style={dangerBtn}
                      >
                        🚗 強制出庫
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </section>
          ) : null}

          {/* Payments */}
          {data.payments.length > 0 ? (
            <section style={sectionStyle}>
              <div style={resultHeader}>
                <span style={{ fontWeight: 800 }}>決済 ({data.payments.length})</span>
              </div>
              {data.payments.map((p) => (
                <div key={p.id} style={cardStyle}>
                  <div style={cardTopRow}>
                    <div style={{ fontWeight: 800 }}>
                      {p.customerNameSnapshot ?? "(名前不明)"}
                    </div>
                    <div
                      style={pillStyle(
                        p.refunded ? "#991b1b" : p.status === "CONFIRMED" ? "#16a34a" : "#475569"
                      )}
                    >
                      {p.refunded ? "返金" : p.status}
                    </div>
                  </div>
                  <div style={metaRow}>
                    <Meta k="駐車場" v={p.placeNameSnapshot} />
                    <Meta k="slot" v={p.spotLabelSnapshot ?? p.spotCodeSnapshot ?? "-"} />
                    <Meta k="利用日" v={p.serviceDate ?? "-"} />
                    <Meta k="決済日時" v={fmtDateTime(p.recognizedDate)} />
                    <Meta k="種別" v={p.kind} />
                    <Meta k="金額" v={fmtYen(p.grossAmount)} />
                    <Meta k="車両" v={p.plateSnapshot ?? "-"} />
                    <Meta k="paymentRef" v={p.paymentRef ?? "-"} mono />
                  </div>
                  {p.paymentRef ? (
                    <div style={actionsRow}>
                      <a
                        href={`/api/receipt/${encodeURIComponent(p.paymentRef)}/pdf`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ ...primaryBtn, textDecoration: "none", textAlign: "center" }}
                      >
                        🧾 領収書
                      </a>
                    </div>
                  ) : null}
                </div>
              ))}
            </section>
          ) : null}
        </>
      ) : null}

      {data && !hasResults ? (
        <div style={{ ...sectionStyle, textAlign: "center", color: "#666" }}>
          該当する結果がありません
        </div>
      ) : null}

      {/* MANUAL RESERVATION CREATE */}
      <section style={sectionStyle}>
        <button
          type="button"
          onClick={() => setShowCreate((v) => !v)}
          style={{
            ...secondaryBtn,
            width: "100%",
            justifyContent: "space-between",
            display: "flex",
          }}
        >
          <span>📝 手動予約作成</span>
          <span>{showCreate ? "▲" : "▼"}</span>
        </button>

        {showCreate ? (
          <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
            <Field label="氏名 *">
              <input
                value={cName}
                onChange={(e) => setCName(e.target.value)}
                style={bigInput}
              />
            </Field>
            <Field label="email">
              <input
                type="email"
                inputMode="email"
                value={cEmail}
                onChange={(e) => setCEmail(e.target.value)}
                style={bigInput}
              />
            </Field>
            <Field label="車両ナンバー *">
              <input
                value={cPlate}
                onChange={(e) => setCPlate(e.target.value)}
                style={bigInput}
              />
            </Field>
            <Field label="電話番号">
              <input
                type="tel"
                inputMode="tel"
                value={cPhone}
                onChange={(e) => setCPhone(e.target.value)}
                placeholder="090-1234-5678"
                style={bigInput}
              />
            </Field>
            <Field label="駐車場 *">
              <select
                value={cPlaceId}
                onChange={(e) => setCPlaceId(e.target.value)}
                style={bigInput}
              >
                <option value="">選択してください</option>
                {places.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="区画コード (例: A-02 / S01) *">
              <input
                value={cSlot}
                onChange={(e) => setCSlot(e.target.value)}
                placeholder="A-02"
                style={bigInput}
              />
            </Field>
            <Field label="開始日 *">
              <input
                type="date"
                value={cStartAt}
                onChange={(e) => setCStartAt(e.target.value)}
                style={bigInput}
              />
            </Field>
            <Field label="終了日">
              <input
                type="date"
                value={cEndAt}
                onChange={(e) => setCEndAt(e.target.value)}
                style={bigInput}
              />
            </Field>
            <Field label="paymentRef（任意・入れると paid=true）">
              <input
                value={cPaymentRef}
                onChange={(e) => setCPaymentRef(e.target.value)}
                placeholder="cs_test_... または 手動精算ID"
                style={bigInput}
              />
            </Field>
            <Field label="金額（円）">
              <input
                type="number"
                value={cPrice}
                onChange={(e) => setCPrice(e.target.value)}
                style={bigInput}
              />
            </Field>
            <Field label="備考">
              <textarea
                value={cNote}
                onChange={(e) => setCNote(e.target.value)}
                rows={2}
                style={{ ...bigInput, minHeight: 70 }}
              />
            </Field>
            <button
              type="button"
              disabled={busy === "create"}
              onClick={doCreateReservation}
              style={dangerBtn}
            >
              {busy === "create" ? "作成中..." : "予約を作成（要確認）"}
            </button>
          </div>
        ) : null}
      </section>

      <div style={{ height: 40 }} />
    </main>
  );
}

export default function EmergencyPage() {
  return (
    <Suspense fallback={<main style={pageStyle}>読み込み中...</main>}>
      <EmergencyPageInner />
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
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
        {label}
      </div>
      {children}
    </label>
  );
}

function Meta({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div style={metaItem}>
      <div style={{ fontSize: 11, color: "#6b7280" }}>{k}</div>
      <div
        style={{
          fontSize: 14,
          fontFamily: mono ? "ui-monospace, monospace" : undefined,
          wordBreak: "break-all",
        }}
      >
        {v}
      </div>
    </div>
  );
}

const pageStyle: React.CSSProperties = {
  maxWidth: 720,
  margin: "0 auto",
  padding: 16,
  paddingBottom: 60,
};

const headerStyle: React.CSSProperties = {
  padding: "12px 4px",
  marginBottom: 12,
};

const sectionStyle: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 14,
  background: "#fff",
  padding: 14,
  marginBottom: 14,
};

const resultHeader: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  marginBottom: 10,
  fontSize: 14,
};

const cardStyle: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  padding: 12,
  marginBottom: 10,
  background: "#fafafa",
};

const cardTopRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  marginBottom: 8,
};

const metaRow: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
  gap: 8,
  marginBottom: 10,
};

const metaItem: React.CSSProperties = {};

const actionsRow: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const bigInput: React.CSSProperties = {
  width: "100%",
  minHeight: 48,
  padding: "12px 14px",
  borderRadius: 12,
  border: "1px solid #d1d5db",
  fontSize: 16,
  background: "#fff",
  boxSizing: "border-box",
};

const primaryBtn: React.CSSProperties = {
  minHeight: 48,
  padding: "0 18px",
  borderRadius: 12,
  border: "1px solid #111",
  background: "#111",
  color: "#fff",
  fontWeight: 800,
  fontSize: 15,
  cursor: "pointer",
  flex: "1 1 auto",
  minWidth: 140,
};

const secondaryBtn: React.CSSProperties = {
  minHeight: 48,
  padding: "0 18px",
  borderRadius: 12,
  border: "1px solid #d1d5db",
  background: "#fff",
  color: "#111",
  fontWeight: 800,
  fontSize: 15,
  cursor: "pointer",
};

const dangerBtn: React.CSSProperties = {
  minHeight: 48,
  padding: "0 18px",
  borderRadius: 12,
  border: "1px solid #dc2626",
  background: "#fff",
  color: "#dc2626",
  fontWeight: 800,
  fontSize: 15,
  cursor: "pointer",
};

const errStyle: React.CSSProperties = {
  border: "1px solid #fecaca",
  background: "#fef2f2",
  color: "#b91c1c",
  borderRadius: 12,
  padding: 12,
  marginBottom: 12,
  fontWeight: 700,
};

const okStyle: React.CSSProperties = {
  border: "1px solid #bbf7d0",
  background: "#f0fdf4",
  color: "#166534",
  borderRadius: 12,
  padding: 12,
  marginBottom: 12,
  fontWeight: 700,
};

function pillStyle(color: string): React.CSSProperties {
  return {
    background: color,
    color: "#fff",
    padding: "4px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 800,
    whiteSpace: "nowrap",
  };
}
