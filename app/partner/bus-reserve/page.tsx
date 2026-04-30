"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

type AvailabilityResponse = {
  ok: boolean;
  date?: string;
  available?: boolean;
  price?: number;
  effectiveMode?: string;
  eventDayActive?: boolean;
  message?: string;
  error?: string;
  place?: {
    id: string;
    slug: string;
    name: string;
    address: string | null;
    operationMode?: string | null;
  };
  spot?: {
    id: string;
    code: string;
    label: string | null;
  };
  reservationOpen?: {
    ok: boolean;
    openDaysBefore?: number;
  };
  eventDay?: {
    id: string;
    label: string | null;
    busFixedYen: number | null;
    reservationOpenDaysBefore: number | null;
  } | null;
  existingReservation?: {
    id: string;
    name: string;
    plate: string;
    email: string | null;
    price: number;
    createdAt: string;
  } | null;
};

type CheckoutResponse = {
  ok: boolean;
  url?: string;
  error?: string;
  message?: string;
};

type BusPartner = {
  id: string;
  name: string;
  contact: string;
  phone: string;
  email: string;
};

type PartnersResponse = {
  ok: boolean;
  partners?: BusPartner[];
  error?: string;
  message?: string;
};

function ymdTodayJst() {
  return new Date().toLocaleDateString("sv-SE", {
    timeZone: "Asia/Tokyo",
  });
}

function formatYen(value: number | null | undefined) {
  if (!Number.isFinite(value ?? NaN)) return "-";
  return `${Number(value).toLocaleString("ja-JP")}円`;
}

function modeLabel(mode?: string | null) {
  switch (mode) {
    case "RESERVATION_ONLY":
      return "予約専用";
    case "HOURLY_ONLY":
      return "時間貸し専用";
    case "RESERVATION_THEN_HOURLY":
      return "予約＋時間貸し";
    case "EVENT_ONLY":
      return "イベント日のみ予約営業";
    case "CLOSED":
      return "休止中";
    default:
      return mode ?? "-";
  }
}

async function fetchJson(input: RequestInfo | URL, init?: RequestInit) {
  const res = await fetch(input, init);
  const json = await res.json().catch(() => null);
  return { res, json };
}

function PartnerBusReservePageInner() {
  const searchParams = useSearchParams();

  const initialDate = useMemo(() => {
    const q = String(searchParams.get("date") ?? "").trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(q)) return q;
    return ymdTodayJst();
  }, [searchParams]);

  const [date, setDate] = useState(initialDate);

  const [partners, setPartners] = useState<BusPartner[]>([]);
  const [busPartnerId, setBusPartnerId] = useState("");
  const [plate, setPlate] = useState("");
  const [arrivalTime, setArrivalTime] = useState("");
  const [note, setNote] = useState("");

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState("");

  const [availability, setAvailability] = useState<AvailabilityResponse | null>(
    null
  );

  const selectedPartner = useMemo(
    () => partners.find((p) => p.id === busPartnerId) ?? null,
    [partners, busPartnerId]
  );

  useEffect(() => {
    let cancelled = false;

    async function loadPartners() {
      try {
        const { res, json } = await fetchJson("/api/partner/bus-partners", {
          cache: "no-store",
        });

        if (cancelled) return;

        if (res.status === 401) {
          window.location.href = "/bus-admin/login";
          return;
        }

        if (!res.ok || !json?.ok) {
          setPartners([]);
          return;
        }

        const data = json as PartnersResponse;
        setPartners(Array.isArray(data.partners) ? data.partners : []);
      } catch {
        if (!cancelled) setPartners([]);
      }
    }

    loadPartners();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadAvailability() {
      setLoading(true);
      setErr("");

      try {
        const { res, json } = await fetchJson(
          `/api/partner/bus-availability?date=${encodeURIComponent(date)}`,
          { cache: "no-store" }
        );

        if (cancelled) return;

        if (res.status === 401) {
          window.location.href = "/partner/login";
          return;
        }

        if (!res.ok || !json?.ok) {
          setAvailability(null);
          setErr(json?.message || json?.error || "空き状況の取得に失敗しました");
          return;
        }

        setAvailability(json as AvailabilityResponse);
      } catch (e) {
        if (!cancelled) {
          setAvailability(null);
          setErr("通信エラーが発生しました");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadAvailability();

    return () => {
      cancelled = true;
    };
  }, [date]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");

    if (!availability?.place?.id || !availability?.spot?.id) {
      setErr("予約対象の設定が取得できていません");
      return;
    }

    if (!availability.available) {
      setErr("この日は予約できません");
      return;
    }

    if (!busPartnerId) {
      setErr("業者を選択してください");
      return;
    }

    if (!plate.trim()) {
      setErr("車両ナンバーを入力してください");
      return;
    }

    setSubmitting(true);

    try {
      const { res, json } = await fetchJson("/api/partner/bus-checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          date,
          busPartnerId,
          plate,
          arrivalTime,
          note,
        }),
      });

      if (res.status === 401) {
        window.location.href = "/partner/login";
        return;
      }

      if (!res.ok || !json?.ok) {
        setErr(json?.message || json?.error || "決済画面の作成に失敗しました");
        return;
      }

      const data = json as CheckoutResponse;

      if (!data.url) {
        setErr("決済URLが取得できませんでした");
        return;
      }

      window.location.href = data.url;
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setSubmitting(false);
    }
  }

  const place = availability?.place ?? null;
  const spot = availability?.spot ?? null;
  const price = availability?.price ?? null;
  const existing = availability?.existingReservation ?? null;
  const isAvailable = Boolean(availability?.available);

  return (
    <main style={pageStyle}>
      <div style={containerStyle}>
        <div style={headerRowStyle}>
          <div>
            <h1 style={titleStyle}>提携先バス予約</h1>
            <p style={descStyle}>
              イベント日のみ、固定枠 1台分の予約を受け付けます。
            </p>
          </div>

          <form method="post" action="/api/partner/logout">
            <button type="submit" style={logoutButtonStyle}>
              ログアウト
            </button>
          </form>
        </div>

        <div style={gridStyle}>
          <section style={cardStyle}>
            <h2 style={sectionTitleStyle}>予約条件</h2>

            <div style={fieldStyle}>
              <label style={labelStyle}>利用日</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                style={inputStyle}
              />
            </div>

            {loading ? (
              <div style={infoBoxStyle}>空き状況を確認中です...</div>
            ) : err ? (
              <div style={errorBoxStyle}>{err}</div>
            ) : (
              <>
                <div style={summaryBoxStyle}>
                  <div style={summaryRowStyle}>
                    <span style={summaryLabelStyle}>PLACE</span>
                    <span style={summaryValueStyle}>{place?.name ?? "-"}</span>
                  </div>
                  <div style={summaryRowStyle}>
                    <span style={summaryLabelStyle}>区画</span>
                    <span style={summaryValueStyle}>
                      {spot?.label ?? spot?.code ?? "-"}
                    </span>
                  </div>
                  <div style={summaryRowStyle}>
                    <span style={summaryLabelStyle}>営業モード</span>
                    <span style={summaryValueStyle}>
                      {modeLabel(availability?.effectiveMode)}
                    </span>
                  </div>
                  <div style={summaryRowStyle}>
                    <span style={summaryLabelStyle}>料金</span>
                    <span style={summaryValueStyle}>{formatYen(price)}</span>
                  </div>
                  <div style={summaryRowStyle}>
                    <span style={summaryLabelStyle}>イベント日</span>
                    <span style={summaryValueStyle}>
                      {availability?.eventDayActive ? "はい" : "いいえ"}
                    </span>
                  </div>
                  <div style={summaryRowStyle}>
                    <span style={summaryLabelStyle}>予約可否</span>
                    <span
                      style={{
                        ...summaryValueStyle,
                        color: isAvailable ? "#065f46" : "#991b1b",
                        fontWeight: 800,
                      }}
                    >
                      {isAvailable ? "予約可能" : "予約不可"}
                    </span>
                  </div>
                </div>

                {!isAvailable && existing ? (
                  <div style={warnBoxStyle}>
                    この日はすでに予約があります。
                    <br />
                    予約者: {existing.name} / ナンバー: {existing.plate}
                  </div>
                ) : null}

                {!isAvailable && !existing ? (
                  <div style={warnBoxStyle}>
                    この日は予約対象外、または予約開始前です。
                  </div>
                ) : null}
              </>
            )}
          </section>

          <section style={cardStyle}>
            <h2 style={sectionTitleStyle}>予約情報入力</h2>

            <form onSubmit={submit} style={formStyle}>
              <div style={fieldStyle}>
                <label style={labelStyle}>業者を選択</label>
                <select
                  value={busPartnerId}
                  onChange={(e) => setBusPartnerId(e.target.value)}
                  style={inputStyle}
                >
                  <option value="">-- 業者を選んでください --</option>
                  {partners.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                {partners.length === 0 ? (
                  <div style={helpTextStyle}>
                    登録済み業者がありません。管理者にお問い合わせください。
                  </div>
                ) : null}
              </div>

              {selectedPartner ? (
                <div style={summaryBoxStyle}>
                  <div style={summaryRowStyle}>
                    <span style={summaryLabelStyle}>会社名</span>
                    <span style={summaryValueStyle}>{selectedPartner.name}</span>
                  </div>
                  <div style={summaryRowStyle}>
                    <span style={summaryLabelStyle}>担当者</span>
                    <span style={summaryValueStyle}>
                      {selectedPartner.contact}
                    </span>
                  </div>
                  <div style={summaryRowStyle}>
                    <span style={summaryLabelStyle}>電話番号</span>
                    <span style={summaryValueStyle}>
                      {selectedPartner.phone}
                    </span>
                  </div>
                  <div style={summaryRowStyle}>
                    <span style={summaryLabelStyle}>メール</span>
                    <span style={summaryValueStyle}>
                      {selectedPartner.email}
                    </span>
                  </div>
                </div>
              ) : null}

              <div style={fieldStyle}>
                <label style={labelStyle}>車両ナンバー</label>
                <input
                  value={plate}
                  onChange={(e) => setPlate(e.target.value)}
                  style={inputStyle}
                  placeholder="例: 宮城200 あ 1234"
                />
              </div>

              <div style={fieldStyle}>
                <label style={labelStyle}>到着予定時刻</label>
                <input
                  value={arrivalTime}
                  onChange={(e) => setArrivalTime(e.target.value)}
                  style={inputStyle}
                  placeholder="例: 17:30"
                />
              </div>

              <div style={fieldStyle}>
                <label style={labelStyle}>備考</label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  style={textareaStyle}
                  placeholder="団体名、連絡事項など"
                />
              </div>

              <button
                type="submit"
                disabled={loading || submitting || !isAvailable}
                style={{
                  ...submitButtonStyle,
                  opacity: loading || submitting || !isAvailable ? 0.6 : 1,
                  cursor:
                    loading || submitting || !isAvailable
                      ? "not-allowed"
                      : "pointer",
                }}
              >
                {submitting ? "Stripeへ進行中..." : "Stripeで決済して予約する"}
              </button>

              <div style={helpTextStyle}>
                決済完了後、予約PINと案内がメールで送信されます。
              </div>
            </form>
          </section>
        </div>

        <div style={footerStyle}>
          <Link href="/" style={linkStyle}>
            ← トップへ戻る
          </Link>
        </div>
      </div>
    </main>
  );
}

export default function PartnerBusReservePage() {
  return (
    <Suspense fallback={<main style={pageStyle}>読み込み中...</main>}>
      <PartnerBusReservePageInner />
    </Suspense>
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

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 30,
  fontWeight: 900,
  color: "#111827",
};

const descStyle: React.CSSProperties = {
  marginTop: 8,
  marginBottom: 0,
  color: "#6b7280",
  lineHeight: 1.7,
};

const logoutButtonStyle: React.CSSProperties = {
  border: "1px solid #d1d5db",
  borderRadius: 12,
  background: "#fff",
  color: "#111827",
  padding: "10px 14px",
  fontWeight: 700,
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 20,
};

const cardStyle: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 20,
  background: "#fff",
  padding: 20,
};

const sectionTitleStyle: React.CSSProperties = {
  margin: 0,
  marginBottom: 16,
  fontSize: 20,
  fontWeight: 900,
  color: "#111827",
};

const formStyle: React.CSSProperties = {
  display: "grid",
  gap: 14,
};

const fieldStyle: React.CSSProperties = {
  display: "grid",
  gap: 8,
};

const labelStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  color: "#374151",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  border: "1px solid #d1d5db",
  borderRadius: 12,
  padding: "12px 14px",
  fontSize: 16,
  background: "#fff",
};

const textareaStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 110,
  border: "1px solid #d1d5db",
  borderRadius: 12,
  padding: "12px 14px",
  fontSize: 16,
  resize: "vertical",
  background: "#fff",
};

const submitButtonStyle: React.CSSProperties = {
  border: "1px solid #111827",
  borderRadius: 14,
  background: "#111827",
  color: "#fff",
  padding: "14px 18px",
  fontSize: 16,
  fontWeight: 800,
};

const summaryBoxStyle: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 16,
  background: "#fafafa",
  padding: 14,
  display: "grid",
  gap: 10,
};

const summaryRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  flexWrap: "wrap",
};

const summaryLabelStyle: React.CSSProperties = {
  color: "#6b7280",
  fontSize: 14,
  fontWeight: 700,
};

const summaryValueStyle: React.CSSProperties = {
  color: "#111827",
  fontSize: 15,
  fontWeight: 700,
};

const infoBoxStyle: React.CSSProperties = {
  border: "1px solid #dbeafe",
  background: "#eff6ff",
  color: "#1d4ed8",
  borderRadius: 14,
  padding: "12px 14px",
  fontWeight: 700,
};

const warnBoxStyle: React.CSSProperties = {
  marginTop: 14,
  border: "1px solid #fed7aa",
  background: "#fff7ed",
  color: "#9a3412",
  borderRadius: 14,
  padding: "12px 14px",
  fontWeight: 700,
  lineHeight: 1.7,
};

const errorBoxStyle: React.CSSProperties = {
  border: "1px solid #fecaca",
  background: "#fef2f2",
  color: "#991b1b",
  borderRadius: 14,
  padding: "12px 14px",
  fontWeight: 700,
  lineHeight: 1.7,
};

const helpTextStyle: React.CSSProperties = {
  color: "#6b7280",
  fontSize: 13,
  lineHeight: 1.6,
};

const footerStyle: React.CSSProperties = {
  marginTop: 18,
};

const linkStyle: React.CSSProperties = {
  color: "#2563eb",
  textDecoration: "none",
  fontWeight: 700,
};