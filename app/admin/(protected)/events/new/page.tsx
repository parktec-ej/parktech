"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Place = { id: string; slug: string; name: string };

const VENUE_OPTIONS = [
  { value: "sekisui_arena", label: "セキスイハイムスーパーアリーナ" },
  { value: "qanda_stadium", label: "キューアンドエースタジアムみやぎ" },
];

const BOOKING_DAYS_OPTIONS = [
  { value: "", label: "未設定（後で設定）" },
  { value: "0", label: "当日から受付" },
  { value: "14", label: "2週間前（14日前）" },
  { value: "30", label: "1ヶ月前（30日前）" },
  { value: "60", label: "2ヶ月前（60日前）" },
  { value: "90", label: "3ヶ月前（90日前）" },
  { value: "custom", label: "カスタム（日付を直接指定）" },
];

export default function EventsNewPage() {
  const router = useRouter();
  const [places, setPlaces] = useState<Place[]>([]);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [venue, setVenue] = useState("sekisui_arena");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [officialUrl, setOfficialUrl] = useState("");
  const [placeId, setPlaceId] = useState("");
  const [bookingDaysOpt, setBookingDaysOpt] = useState("");
  const [bookingStartAt, setBookingStartAt] = useState("");
  const [bookingStartTime, setBookingStartTime] = useState("10:00");
  const [ourPrice, setOurPrice] = useState("");
  const [competitorPrice, setCompetitorPrice] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    fetch("/api/admin/places", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (j?.ok && Array.isArray(j.places)) {
          setPlaces(
            j.places.map((p: any) => ({ id: p.id, slug: p.slug, name: p.name }))
          );
        }
      })
      .catch(() => {});
  }, []);

  async function submit() {
    if (!title.trim() || !startAt) {
      setErr("タイトルと開催日時は必須です");
      return;
    }
    setSubmitting(true);
    setErr("");

    const body: any = {
      title: title.trim(),
      description: description.trim(),
      venue,
      startAt: new Date(startAt).toISOString(),
      endAt: endAt ? new Date(endAt).toISOString() : null,
      officialUrl: officialUrl.trim(),
      placeId,
      bookingStartTime,
      ourPrice: ourPrice ? Number(ourPrice) : null,
      competitorPrice: competitorPrice ? Number(competitorPrice) : null,
    };

    if (bookingDaysOpt === "custom") {
      body.bookingStartDays = null;
      body.bookingStartAt = bookingStartAt
        ? new Date(bookingStartAt).toISOString()
        : null;
    } else if (bookingDaysOpt) {
      body.bookingStartDays = Number(bookingDaysOpt);
    } else {
      body.bookingStartDays = null;
    }

    try {
      const res = await fetch("/api/admin/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!json.ok) {
        setErr(json.message ?? json.error ?? "作成に失敗しました");
        return;
      }
      router.push(`/admin/events/${json.event.id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  const useCustomDate = bookingDaysOpt === "custom";

  return (
    <main style={{ maxWidth: 820, margin: "0 auto", padding: 24 }}>
      <h1 style={{ fontSize: 24, fontWeight: 900, marginBottom: 16 }}>
        🎫 イベント新規登録
      </h1>

      {err ? (
        <div
          style={{
            border: "1px solid #fecaca",
            background: "#fef2f2",
            color: "#b91c1c",
            padding: 12,
            borderRadius: 12,
            marginBottom: 16,
            fontWeight: 700,
          }}
        >
          {err}
        </div>
      ) : null}

      <div style={card}>
        <Field label="タイトル / アーティスト名・ツアー名 *">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="例: ◯◯◯◯ TOUR 2026"
            style={input}
          />
        </Field>

        <Field label="説明 / 補足">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            style={{ ...input, minHeight: 70 }}
          />
        </Field>

        <Field label="会場 *">
          <select
            value={venue}
            onChange={(e) => setVenue(e.target.value)}
            style={input}
          >
            {VENUE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>

        <div style={twoCol}>
          <Field label="開催日時 *">
            <input
              type="datetime-local"
              value={startAt}
              onChange={(e) => setStartAt(e.target.value)}
              style={input}
            />
          </Field>
          <Field label="終了日時（任意）">
            <input
              type="datetime-local"
              value={endAt}
              onChange={(e) => setEndAt(e.target.value)}
              style={input}
            />
          </Field>
        </div>

        <Field label="公式URL（任意）">
          <input
            value={officialUrl}
            onChange={(e) => setOfficialUrl(e.target.value)}
            placeholder="https://..."
            style={input}
          />
        </Field>

        <Field label="紐付ける駐車場（任意）">
          <select
            value={placeId}
            onChange={(e) => setPlaceId(e.target.value)}
            style={input}
          >
            <option value="">未選択</option>
            {places.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>

        <hr style={{ margin: "20px 0", border: "none", borderTop: "1px solid #e5e7eb" }} />

        <div style={{ fontWeight: 800, marginBottom: 8 }}>予約開始タイミング</div>

        <Field label="予約開始タイミング">
          <select
            value={bookingDaysOpt}
            onChange={(e) => setBookingDaysOpt(e.target.value)}
            style={input}
          >
            {BOOKING_DAYS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>

        {useCustomDate ? (
          <Field label="予約開始日時（カスタム）">
            <input
              type="datetime-local"
              value={bookingStartAt}
              onChange={(e) => setBookingStartAt(e.target.value)}
              style={input}
            />
          </Field>
        ) : (
          <Field label="受付開始時刻（時:分）">
            <input
              type="time"
              value={bookingStartTime}
              onChange={(e) => setBookingStartTime(e.target.value)}
              style={input}
            />
          </Field>
        )}

        <hr style={{ margin: "20px 0", border: "none", borderTop: "1px solid #e5e7eb" }} />

        <div style={twoCol}>
          <Field label="当日駐車場料金（円）">
            <input
              type="number"
              value={ourPrice}
              onChange={(e) => setOurPrice(e.target.value)}
              placeholder="例: 3000"
              style={input}
            />
          </Field>
          <Field label="競合価格（参考・管理画面のみ表示）">
            <input
              type="number"
              value={competitorPrice}
              onChange={(e) => setCompetitorPrice(e.target.value)}
              placeholder="例: 5000"
              style={input}
            />
          </Field>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            style={primaryBtn}
          >
            {submitting ? "作成中..." : "📝 draft として作成"}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            disabled={submitting}
            style={secondaryBtn}
          >
            キャンセル
          </button>
        </div>
      </div>
    </main>
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
    <label style={{ display: "block", marginBottom: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
        {label}
      </div>
      {children}
    </label>
  );
}

const card: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 14,
  padding: 16,
  background: "#fff",
};

const input: React.CSSProperties = {
  width: "100%",
  padding: 10,
  border: "1px solid #d1d5db",
  borderRadius: 10,
  fontSize: 14,
  background: "#fff",
  boxSizing: "border-box",
};

const twoCol: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
};

const primaryBtn: React.CSSProperties = {
  padding: "12px 18px",
  borderRadius: 10,
  border: "1px solid #111",
  background: "#111",
  color: "#fff",
  fontWeight: 800,
  cursor: "pointer",
};

const secondaryBtn: React.CSSProperties = {
  padding: "12px 18px",
  borderRadius: 10,
  border: "1px solid #d1d5db",
  background: "#fff",
  color: "#111",
  fontWeight: 700,
  cursor: "pointer",
};
