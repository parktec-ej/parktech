"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import CarrierMailNotice from "./CarrierMailNotice";

type Spot = {
  id: string;
  code: string;
  label: string | null;
  mode: string | null;
  isAvailable: boolean;
  requiresApproval?: boolean;
  status?:
    | "AVAILABLE"
    | "RESERVED"
    | "NOT_OPEN"
    | "PENDING_EVENT"
    | "CLOSED"
    | "REQUIRES_APPROVAL"
    | "PENDING_APPROVAL"
    | string;
};

type Place = {
  id: string;
  slug: string;
  name: string;
  address: string | null;
  operationMode?: string | null;
};

type ReservationSummary = {
  id: string;
  slot: string | null;
  spotId: string | null;
  name: string;
  plate: string;
  email: string | null;
  price: number;
  createdAt: string;
};

type ReservationsApiResponse = {
  ok: boolean;
  place?: Place;
  date?: string;
  spots?: Spot[];
  reservations?: ReservationSummary[];
  soldOut?: boolean;
  error?: string;
  message?: string;
};

type PlacesApiResponse = {
  ok: boolean;
  places?: Place[];
  error?: string;
  message?: string;
};

function ymdTodayJst() {
  return new Date().toLocaleDateString("sv-SE", {
    timeZone: "Asia/Tokyo",
  });
}

function slotStatusLabel(spot: Spot): string {
  switch (spot.status) {
    case "RESERVED":
      return "予約済み";
    case "NOT_OPEN":
      return "予約解放待ち";
    case "PENDING_EVENT":
      return "開催待ち";
    case "CLOSED":
      return "予約不可";
    case "AVAILABLE":
      return "予約可能";
    case "REQUIRES_APPROVAL":
      return "要承認";
    case "PENDING_APPROVAL":
      return "承認待ち";
    default:
      return spot.isAvailable ? "予約可能" : "予約不可";
  }
}

function slotDisabledStyle(spot: Spot) {
  if (spot.status === "PENDING_EVENT") return styles.slotButtonPending;
  if (spot.status === "PENDING_APPROVAL") return styles.slotButtonApproval;
  if (spot.status === "NOT_OPEN") return styles.slotButtonNotOpen;
  // RESERVED / CLOSED / その他 は従来のグレー
  return styles.slotButtonDisabled;
}

async function fetchJson(input: RequestInfo | URL, init?: RequestInit) {
  const res = await fetch(input, init);
  const json = await res.json().catch(() => null);
  return { res, json };
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

function canReserve(mode?: string | null) {
  return (
    mode === "RESERVATION_ONLY" ||
    mode === "RESERVATION_THEN_HOURLY" ||
    mode === "EVENT_ONLY"
  );
}

function ReservePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const queryPlaceId = useMemo(
    () => String(searchParams.get("placeId") ?? "").trim(),
    [searchParams]
  );

  const queryPlaceSlug = useMemo(
    () => String(searchParams.get("placeSlug") ?? "").trim(),
    [searchParams]
  );

  const queryDate = useMemo(() => {
    const d = String(searchParams.get("date") ?? "").trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : "";
  }, [searchParams]);

  const hasPlaceQuery = Boolean(queryPlaceId || queryPlaceSlug);

  const [places, setPlaces] = useState<Place[]>([]);
  const [placesLoading, setPlacesLoading] = useState(true);
  const [placesErr, setPlacesErr] = useState("");

  const [date, setDate] = useState(queryDate || ymdTodayJst());
  const [place, setPlace] = useState<Place | null>(null);
  const [spots, setSpots] = useState<Spot[]>([]);
  const [soldOut, setSoldOut] = useState(false);
  const [selectedSpotId, setSelectedSpotId] = useState("");
  const [name, setName] = useState("");
  const [plate, setPlate] = useState("");
  const [email, setEmail] = useState("");
  const [emailTouched, setEmailTouched] = useState(false);
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState("");
  const [approvalDone, setApprovalDone] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadPlaces() {
      setPlacesLoading(true);
      setPlacesErr("");

      try {
        const { res, json } = await fetchJson("/api/public/places", {
          cache: "no-store",
        });

        if (cancelled) return;

        if (!res.ok || !json?.ok) {
          setPlaces([]);
          setPlacesErr(json?.message || json?.error || "PLACE一覧の取得に失敗しました");
          return;
        }

        const data = json as PlacesApiResponse;
        setPlaces(Array.isArray(data.places) ? data.places : []);
      } catch (e) {
        if (!cancelled) {
          setPlaces([]);
          setPlacesErr("PLACE一覧の取得に失敗しました");
        }
      } finally {
        if (!cancelled) setPlacesLoading(false);
      }
    }

    loadPlaces();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hasPlaceQuery) {
      setLoading(false);
      setErr("");
      setPlace(null);
      setSpots([]);
      setSoldOut(false);
      setSelectedSpotId("");
      return;
    }

    let cancelled = false;

    async function loadReserveTarget() {
      setLoading(true);
      setErr("");

      try {
        const params = new URLSearchParams();
        params.set("date", date);
        if (queryPlaceId) params.set("placeId", queryPlaceId);
        if (queryPlaceSlug) params.set("placeSlug", queryPlaceSlug);

        const { res, json } = await fetchJson(
          `/api/reservations?${params.toString()}`,
          { cache: "no-store" }
        );

        if (cancelled) return;

        if (!res.ok || !json?.ok) {
          setPlace(null);
          setSpots([]);
          setSoldOut(false);
          setSelectedSpotId("");
          setErr(json?.message || json?.error || "予約情報の取得に失敗しました");
          return;
        }

        const data = json as ReservationsApiResponse;
        const fetchedPlace = data.place ?? null;
        const fetchedSpots = Array.isArray(data.spots) ? data.spots : [];

        setPlace(fetchedPlace);
        setSpots(fetchedSpots);
        setSoldOut(data.soldOut === true);

        setSelectedSpotId((prev) => {
          const prevStillUsable = fetchedSpots.some(
            (s) => s.id === prev && s.isAvailable
          );
          if (prevStillUsable) return prev;

          const firstAvailable = fetchedSpots.find((s) => s.isAvailable);
          return firstAvailable?.id ?? "";
        });
      } catch (e) {
        if (!cancelled) {
          setPlace(null);
          setSpots([]);
          setSoldOut(false);
          setSelectedSpotId("");
          setErr("通信エラーが発生しました");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadReserveTarget();

    return () => {
      cancelled = true;
    };
  }, [date, queryPlaceId, queryPlaceSlug, hasPlaceQuery]);

  async function submit() {
    if (!place?.id) {
      setErr("place が取得できていません");
      return;
    }

    if (!selectedSpotId) {
      setErr("空いている区画を選択してください");
      return;
    }

    const selectedSpot = spots.find((s) => s.id === selectedSpotId);
    const isApprovalFlow = selectedSpot?.requiresApproval === true;
    if (!selectedSpot?.isAvailable && !isApprovalFlow) {
      setErr("その区画は予約済みです");
      return;
    }

    if (!name.trim()) {
      setErr("氏名を入力してください");
      return;
    }

    if (!plate.trim()) {
      setErr("車両ナンバーを入力してください");
      return;
    }

    if (!email.trim()) {
      setErr("メールアドレスを入力してください");
      return;
    }

    if (phone.trim() && !/^[0-9\-\s]+$/.test(phone.trim())) {
      setErr("電話番号は数字とハイフンのみで入力してください");
      return;
    }

    setSubmitting(true);
    setErr("");

    // 要承認区画：決済せず承認申請(WAITING)を作成する（②）
    if (isApprovalFlow) {
      try {
        const { res, json } = await fetchJson(
          "/api/reservations/approval-request",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              placeId: place.id,
              spotId: selectedSpotId,
              date,
              name: name.trim(),
              plate: plate.trim(),
              email: email.trim(),
              phone: phone.trim(),
            }),
          }
        );
        if (!res.ok || !json?.ok) {
          setErr(
            json?.message ||
              json?.error ||
              "申請に失敗しました。最新状態でお試しください。"
          );
          return;
        }
        setApprovalDone(true);
      } catch (e) {
        setErr("申請の送信に失敗しました");
      } finally {
        setSubmitting(false);
      }
      return;
    }

    try {
      const { res, json } = await fetchJson("/api/stripe/checkout/reservation", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          placeId: place.id,
          spotId: selectedSpotId,
          date,
          name: name.trim(),
          plate: plate.trim(),
          email: email.trim(),
          phone: phone.trim(),
        }),
      });

      if (!res.ok || !json?.ok) {
        setErr(json?.message || json?.error || "決済画面の作成に失敗しました");
        return;
      }

      const url = String(json.url ?? "").trim();
      if (!url) {
        setErr("決済URLが取得できませんでした");
        return;
      }

      router.push(url);
    } catch (e) {
      setErr("送信に失敗しました");
    } finally {
      setSubmitting(false);
    }
  }

  if (!hasPlaceQuery) {
    return (
      <main style={styles.page}>
        <div style={{ marginBottom: 12 }}>
          <a href="https://parktec-ej.com" style={styles.backLink}>
            ← ParkTec HPへ戻る
          </a>
        </div>
        <div style={styles.card}>
          <div style={styles.headerRow}>
            <div>
              <h1 style={styles.title}>駐車場予約</h1>
              <div style={styles.placeText}>予約したい駐車場を選択してください</div>
            </div>
          </div>

          {placesErr ? <div style={styles.error}>{placesErr}</div> : null}

          {placesLoading ? (
            <div style={styles.subtle}>PLACEを読み込み中...</div>
          ) : places.length === 0 ? (
            <div style={styles.subtle}>利用可能なPLACEがありません。</div>
          ) : (
            <div style={styles.placeGrid}>
              {places.map((p) => {
                const reservable = canReserve(p.operationMode);
                return (
                  <Link
                    key={p.id}
                    href={`/reserve?placeSlug=${encodeURIComponent(p.slug)}`}
                    style={{
                      ...styles.placeCard,
                      opacity: reservable ? 1 : 0.65,
                    }}
                  >
                    <div style={styles.placeCardTitle}>{p.name}</div>
                    <div style={styles.placeCardSlug}>{p.slug}</div>
                    {p.address ? <div style={styles.placeCardAddress}>{p.address}</div> : null}
                    <div style={styles.placeCardMeta}>
                      営業モード: {modeLabel(p.operationMode)}
                    </div>
                    <div
                      style={{
                        ...styles.placeCardBadge,
                        background: reservable ? "#111827" : "#6b7280",
                      }}
                    >
                      {reservable ? "予約へ進む" : "予約対象外"}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <div style={{ marginBottom: 12 }}>
        <a href="https://parktec-ej.com" style={styles.backLink}>
          ← ParkTec HPへ戻る
        </a>
      </div>
      <div style={styles.card}>
        <div style={styles.headerRow}>
          <div>
            <h1 style={styles.title}>駐車場予約</h1>
            <div style={styles.placeText}>
              対象Place:{" "}
              {place ? `${place.name} (${place.slug})` : "読み込み中"}
            </div>
            {place?.address ? <div style={styles.subtle}>{place.address}</div> : null}
            {place?.operationMode ? (
              <div style={styles.subtle}>営業モード: {modeLabel(place.operationMode)}</div>
            ) : null}
          </div>

          <Link href="/reserve" style={styles.backLink}>
            ← PLACE一覧へ戻る
          </Link>
        </div>

        <section style={styles.section}>
          <label style={styles.label}>利用日</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            style={styles.input}
          />
        </section>

        <section style={styles.section}>
          <div style={styles.labelRow}>
            <label style={styles.label}>区画</label>
            <span style={styles.legend}>
              白: 空き / 橙: 要承認 / 黄: 開催待ち / 青: 予約解放待ち / グレー: 予約済み / 黒: 選択中
            </span>
          </div>

          {soldOut ? (
            <div style={styles.soldOutBanner}>
              <div style={styles.soldOutTitle}>この日は満車です（予約受付終了）</div>
              {spots.some((s) => s.requiresApproval === true) ? (
                <div style={styles.soldOutBody}>
                  オレンジの「要承認」区画のみ、申請を受け付けています。
                  申請後、当社の承認をもって予約が確定します（先着1名・承認をお約束するものではありません）。
                </div>
              ) : (
                <div style={styles.soldOutBody}>
                  別の日程をお選びいただくか、キャンセルにより空きが出る場合がありますので
                  時間をおいて再度ご確認ください。
                </div>
              )}
            </div>
          ) : null}

          <div style={styles.slotGrid}>
            {spots.map((spot) => {
              const selected = selectedSpotId === spot.id;
              const approvalOpen = spot.requiresApproval === true;
              const disabled = !spot.isAvailable && !approvalOpen;

              return (
                <button
                  key={spot.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => setSelectedSpotId(spot.id)}
                  style={{
                    ...styles.slotButton,
                    ...(disabled ? slotDisabledStyle(spot) : {}),
                    ...(approvalOpen && !selected ? styles.slotButtonApproval : {}),
                    ...(selected ? styles.slotButtonSelected : {}),
                  }}
                >
                  <div style={styles.slotCode}>{spot.label || spot.code}</div>
                  <div style={styles.slotSub}>
                    {selected ? "選択中" : slotStatusLabel(spot)}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <section style={styles.section}>
          <label style={styles.label}>氏名</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例: 山田 太郎"
            style={styles.input}
          />
        </section>

        <section style={styles.section}>
          <label style={styles.label}>車両ナンバー</label>
          <input
            value={plate}
            onChange={(e) => setPlate(e.target.value)}
            placeholder="例: 宮城300 あ 1234"
            style={styles.input}
          />
        </section>

        <section style={styles.section}>
          <label style={styles.label}>メールアドレス</label>
          <input
            type="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => setEmailTouched(true)}
            placeholder="example@example.com"
            style={styles.input}
          />
          {emailTouched && (
            <CarrierMailNotice
              email={email}
              helpHref="https://parktec-ej.com/help/mail-settings"
            />
          )}
        </section>

        <section style={styles.section}>
          <label style={styles.label}>電話番号（任意）</label>
          <input
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="例：090-1234-5678"
            style={styles.input}
          />
        </section>

        {(() => {
          const selForRender = spots.find((s) => s.id === selectedSpotId);
          const approvalSelected = selForRender?.requiresApproval === true;
          const submitDisabled =
            loading || submitting || !selectedSpotId || approvalDone;
          return (
            <>
              {approvalSelected && !approvalDone ? (
                <div style={styles.approvalNotice}>
                  この区画は<strong>月極利用者の承認</strong>が必要です。今は料金は発生しません。
                  申請後、月極利用者が「利用しない」と回答した場合のみ、メールでお支払いのご案内をお送りします。
                </div>
              ) : null}

              {err ? <div style={styles.error}>{err}</div> : null}
              {loading ? <div style={styles.subtle}>読み込み中...</div> : null}

              {approvalDone ? (
                <div style={styles.approvalDone}>
                  承認申請を受け付けました。月極利用者の承認をお待ちください。
                  結果はメール（{email.trim()}）でお知らせします。この時点では料金は発生しません。
                </div>
              ) : (
                <button
                  type="button"
                  onClick={submit}
                  disabled={submitDisabled}
                  style={{
                    ...styles.submitButton,
                    ...(submitDisabled ? styles.submitButtonDisabled : {}),
                  }}
                >
                  {submitting
                    ? "処理中..."
                    : approvalSelected
                    ? "承認を申請する"
                    : "予約して決済へ進む"}
                </button>
              )}
            </>
          );
        })()}
      </div>
    </main>
  );
}

export default function ReservePage() {
  return (
    <Suspense fallback={<main style={styles.page}>読み込み中...</main>}>
      <ReservePageInner />
    </Suspense>
  );
}

const styles: Record<string, React.CSSProperties> = {
  soldOutBanner: {
    marginTop: 12,
    marginBottom: 12,
    padding: 14,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#e5b4b4",
    borderRadius: 10,
    backgroundColor: "#fdf3f3",
  },

  soldOutTitle: {
    fontSize: 15,
    fontWeight: 700,
    color: "#b3261e",
    marginBottom: 6,
  },

  soldOutBody: {
    fontSize: 13,
    lineHeight: 1.7,
    color: "#5c4444",
  },

  page: {
    minHeight: "100vh",
    background: "#f6f6f7",
    padding: "32px 16px",
  },

  card: {
    maxWidth: 980,
    margin: "0 auto",
    background: "#ffffff",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#e5e7eb",
    borderRadius: 24,
    padding: 28,
    boxSizing: "border-box",
  },

  headerRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
    flexWrap: "wrap",
    marginBottom: 24,
  },

  title: {
    fontSize: 24,
    fontWeight: 800,
    margin: 0,
    lineHeight: 1.3,
    color: "#111827",
  },

  placeText: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: 700,
    color: "#111827",
  },

  subtle: {
    marginTop: 8,
    color: "#6b7280",
    fontSize: 14,
    lineHeight: 1.5,
  },

  section: {
    marginTop: 24,
  },

  labelRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "center",
    flexWrap: "wrap",
  },

  label: {
    display: "block",
    fontSize: 14,
    fontWeight: 700,
    marginBottom: 10,
    color: "#111827",
  },

  legend: {
    fontSize: 13,
    color: "#666",
  },

  input: {
    width: "100%",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#d1d5db",
    borderRadius: 16,
    padding: "16px 18px",
    fontSize: 16,
    outline: "none",
    background: "#ffffff",
    color: "#111827",
    boxSizing: "border-box",
  },

  slotGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
    gap: 14,
  },

  slotButton: {
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#111827",
    background: "#ffffff",
    color: "#111827",
    borderRadius: 16,
    minHeight: 86,
    padding: 12,
    cursor: "pointer",
    transition: "all .15s ease",
    boxSizing: "border-box",
  },

  slotButtonSelected: {
    background: "#111827",
    color: "#ffffff",
    borderColor: "#111827",
  },

  slotButtonApproval: {
    background: "#fff7ed",
    borderColor: "#f97316",
    color: "#9a3412",
  },

  slotButtonDisabled: {
    background: "#d1d5db",
    color: "#4b5563",
    borderColor: "#d1d5db",
    cursor: "not-allowed",
  },

  slotButtonPending: {
    background: "#fef3c7",
    color: "#92400e",
    borderColor: "#fde68a",
    cursor: "not-allowed",
  },

  slotButtonNotOpen: {
    background: "#dbeafe",
    color: "#1e40af",
    borderColor: "#bfdbfe",
    cursor: "not-allowed",
  },

  slotCode: {
    fontSize: 20,
    fontWeight: 800,
    lineHeight: 1.2,
  },

  slotSub: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: 600,
    lineHeight: 1.4,
  },

  error: {
    marginTop: 20,
    padding: "14px 16px",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#fecaca",
    borderRadius: 14,
    background: "#fef2f2",
    color: "#b91c1c",
    fontWeight: 700,
    lineHeight: 1.5,
  },

  submitButton: {
    marginTop: 28,
    width: "100%",
    borderWidth: 0,
    borderStyle: "solid",
    borderColor: "transparent",
    borderRadius: 16,
    padding: "18px 20px",
    fontSize: 16,
    fontWeight: 800,
    cursor: "pointer",
    background: "#111827",
    color: "#ffffff",
    boxSizing: "border-box",
  },

  submitButtonDisabled: {
    opacity: 0.6,
    cursor: "not-allowed",
  },

  approvalNotice: {
    background: "#fff7ed",
    border: "1px solid #fdba74",
    color: "#9a3412",
    borderRadius: 12,
    padding: "12px 14px",
    fontSize: 13,
    lineHeight: 1.6,
    marginBottom: 12,
  },

  approvalDone: {
    background: "#ecfdf5",
    border: "1px solid #6ee7b7",
    color: "#065f46",
    borderRadius: 12,
    padding: "14px 16px",
    fontSize: 14,
    lineHeight: 1.7,
  },

  placeGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
    gap: 16,
    marginTop: 8,
  },

  placeCard: {
    display: "block",
    textDecoration: "none",
    color: "#111827",
    background: "#ffffff",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#e5e7eb",
    borderRadius: 18,
    padding: 18,
    transition: "all .15s ease",
    boxSizing: "border-box",
  },

  placeCardTitle: {
    fontSize: 18,
    fontWeight: 800,
    marginBottom: 6,
    lineHeight: 1.35,
  },

  placeCardSlug: {
    fontSize: 13,
    color: "#6b7280",
    marginBottom: 10,
    wordBreak: "break-all",
  },

  placeCardAddress: {
    fontSize: 14,
    color: "#374151",
    marginBottom: 10,
    lineHeight: 1.5,
  },

  placeCardMeta: {
    fontSize: 13,
    color: "#6b7280",
    marginBottom: 14,
    lineHeight: 1.5,
  },

  placeCardBadge: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    padding: "8px 12px",
    color: "#ffffff",
    fontSize: 13,
    fontWeight: 700,
    lineHeight: 1,
  },

  backLink: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    textDecoration: "none",
    color: "#111827",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#d1d5db",
    borderRadius: 999,
    padding: "10px 14px",
    fontSize: 14,
    fontWeight: 700,
    whiteSpace: "nowrap",
    background: "#ffffff",
  },
};

