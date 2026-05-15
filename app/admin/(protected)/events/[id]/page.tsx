"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type Place = { id: string; slug: string; name: string };

type EventRow = {
  id: string;
  title: string;
  description: string | null;
  venue: string;
  category: string;
  startAt: string;
  endAt: string | null;
  doorOpenAt: string | null;
  showStartAt: string | null;
  sourceType: string;
  sourceUrl: string | null;
  officialUrl: string | null;
  competitorPrice: number | null;
  ourPrice: number | null;
  bookingStartDays: number | null;
  bookingStartAt: string | null;
  bookingStartTime: string | null;
  status: "draft" | "approved" | "published" | "archived";
  place: Place | null;
  placeId: string | null;
  venueGroupId: string | null;
  venueGroup: {
    id: string;
    name: string;
    parkings: Array<{ id: string; parkingSlug: string; showOnHp: boolean }>;
  } | null;
  createdAt: string;
  updatedAt: string;
};

type VenueGroupOpt = {
  id: string;
  name: string;
  parkings: Array<{ id: string; parkingSlug: string; showOnHp: boolean }>;
};

const PARKING_NAMES: Record<string, string> = {
  "rifu-main": "PARKTEC 利府グランディー前駐車場",
  "sugaya-bus": "菅谷バス駐車場",
};

const VENUE_OPTIONS = [
  { value: "sekisui_arena", label: "セキスイハイムスーパーアリーナ" },
  { value: "qanda_stadium", label: "キューアンドエースタジアムみやぎ" },
];

const BOOKING_DAYS_OPTIONS = [
  { value: "", label: "未設定" },
  { value: "0", label: "当日から (0日前)" },
  { value: "14", label: "2週間前 (14日)" },
  { value: "30", label: "1ヶ月前 (30日)" },
  { value: "60", label: "2ヶ月前 (60日)" },
  { value: "90", label: "3ヶ月前 (90日)" },
  { value: "custom", label: "カスタム" },
];

function toDateTimeLocal(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  // Convert to JST then format YYYY-MM-DDTHH:mm
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 16);
}

export default function EventDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [event, setEvent] = useState<EventRow | null>(null);
  const [places, setPlaces] = useState<Place[]>([]);
  const [venueGroups, setVenueGroups] = useState<VenueGroupOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  // Edit form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [venue, setVenue] = useState("sekisui_arena");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [placeId, setPlaceId] = useState("");
  const [officialUrl, setOfficialUrl] = useState("");
  const [bookingDaysOpt, setBookingDaysOpt] = useState("");
  const [bookingStartAt, setBookingStartAt] = useState("");
  const [bookingStartTime, setBookingStartTime] = useState("10:00");
  const [ourPrice, setOurPrice] = useState("");
  const [competitorPrice, setCompetitorPrice] = useState("");
  const [venueGroupId, setVenueGroupId] = useState("");

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const res = await fetch(`/api/admin/events/${id}`, { cache: "no-store" });
      const json = await res.json();
      if (!json.ok) {
        setErr(json.message ?? json.error ?? "読み込みに失敗");
        return;
      }
      const e: EventRow = json.event;
      setEvent(e);
      setTitle(e.title);
      setDescription(e.description ?? "");
      setVenue(e.venue);
      setStartAt(toDateTimeLocal(e.startAt));
      setEndAt(toDateTimeLocal(e.endAt));
      setPlaceId(e.placeId ?? "");
      setOfficialUrl(e.officialUrl ?? "");
      setOurPrice(e.ourPrice != null ? String(e.ourPrice) : "");
      setCompetitorPrice(
        e.competitorPrice != null ? String(e.competitorPrice) : ""
      );
      setVenueGroupId(e.venueGroupId ?? "");
      setBookingStartTime(e.bookingStartTime ?? "10:00");
      if (e.bookingStartDays !== null) {
        setBookingDaysOpt(String(e.bookingStartDays));
        setBookingStartAt("");
      } else if (e.bookingStartAt) {
        setBookingDaysOpt("custom");
        setBookingStartAt(toDateTimeLocal(e.bookingStartAt));
      } else {
        setBookingDaysOpt("");
        setBookingStartAt("");
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!id) return;
    load();
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
    fetch("/api/admin/venue-groups", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (j?.ok && Array.isArray(j.venueGroups)) {
          setVenueGroups(j.venueGroups);
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function save() {
    setBusy("save");
    setErr("");
    setMsg("");

    const body: any = {
      title: title.trim(),
      description: description.trim(),
      venue,
      startAt: startAt ? new Date(startAt).toISOString() : null,
      endAt: endAt ? new Date(endAt).toISOString() : null,
      placeId,
      venueGroupId,
      officialUrl: officialUrl.trim(),
      ourPrice: ourPrice ? Number(ourPrice) : null,
      competitorPrice: competitorPrice ? Number(competitorPrice) : null,
      bookingStartTime,
    };

    if (bookingDaysOpt === "custom") {
      body.bookingStartDays = null;
      body.bookingStartAt = bookingStartAt
        ? new Date(bookingStartAt).toISOString()
        : null;
    } else if (bookingDaysOpt) {
      body.bookingStartDays = Number(bookingDaysOpt);
      body.bookingStartAt = null; // let server recompute
    } else {
      body.bookingStartDays = null;
      body.bookingStartAt = null;
    }

    try {
      const res = await fetch(`/api/admin/events/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!json.ok) {
        setErr(json.message ?? json.error ?? "保存に失敗しました");
        return;
      }
      setMsg("保存しました");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function approve() {
    if (!confirm("このイベントを承認 (draft → approved) しますか？")) return;
    setBusy("approve");
    setErr("");
    setMsg("");
    try {
      const res = await fetch(`/api/admin/events/${id}/approve`, {
        method: "POST",
      });
      const json = await res.json();
      if (!json.ok) {
        setErr(json.message ?? json.error ?? "承認に失敗しました");
        return;
      }
      setMsg("承認しました");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function togglePublish() {
    if (!event) return;
    const target = event.status === "published" ? "approved" : "published";
    const verb = target === "published" ? "HP公開" : "HP非公開";
    if (!confirm(`このイベントを ${verb} にしますか？`)) return;

    setBusy("publish");
    setErr("");
    setMsg("");
    try {
      const res = await fetch(`/api/admin/events/${id}/publish-hp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target }),
      });
      const json = await res.json();
      if (!json.ok) {
        setErr(json.message ?? json.error ?? `${verb}に失敗しました`);
        return;
      }
      setMsg(`${verb} しました`);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!confirm("このイベントを削除しますか？\n（この操作は取り消せません）")) return;
    setBusy("delete");
    setErr("");
    try {
      const res = await fetch(`/api/admin/events/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!json.ok) {
        setErr(json.message ?? json.error ?? "削除に失敗しました");
        return;
      }
      router.push("/admin/events");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const status = event?.status ?? "draft";
  const isCustomBooking = bookingDaysOpt === "custom";

  const computedBookingPreview = useMemo(() => {
    if (!event) return "";
    if (event.bookingStartAt) {
      return new Date(event.bookingStartAt).toLocaleString("ja-JP", {
        timeZone: "Asia/Tokyo",
      });
    }
    return "未設定";
  }, [event]);

  return (
    <main style={{ maxWidth: 980, margin: "0 auto", padding: 24 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <Link href="/admin/events" style={{ color: "#2563eb", textDecoration: "none" }}>
          ← 一覧へ戻る
        </Link>
        <span style={badge(statusColor(status))}>{status}</span>
      </div>

      <h1 style={{ fontSize: 24, fontWeight: 900, margin: "12px 0" }}>
        🎫 {event?.title ?? "（読み込み中）"}
      </h1>

      {err ? <div style={errBox}>{err}</div> : null}
      {msg ? <div style={okBox}>{msg}</div> : null}

      {/* Workflow actions */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        {status === "draft" && (
          <button
            type="button"
            onClick={approve}
            disabled={busy !== null}
            style={primaryBtn}
          >
            ✅ 承認 (draft → approved)
          </button>
        )}
        {status !== "draft" && (
          <button
            type="button"
            onClick={togglePublish}
            disabled={busy !== null}
            style={status === "published" ? secondaryBtn : primaryBtn}
          >
            {status === "published"
              ? "📥 HP非公開に戻す"
              : "🌐 HPに公開する"}
          </button>
        )}
        <div style={{ marginLeft: "auto", fontSize: 13, color: "#6b7280", alignSelf: "center" }}>
          現在の予約開始日時: <b>{computedBookingPreview}</b>
        </div>
      </div>

      {loading || !event ? (
        <div>読み込み中...</div>
      ) : (
        <div style={card}>
          <Field label="タイトル">
            <input value={title} onChange={(e) => setTitle(e.target.value)} style={input} />
          </Field>
          <Field label="説明">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              style={{ ...input, minHeight: 70 }}
            />
          </Field>
          <Field label="会場">
            <select value={venue} onChange={(e) => setVenue(e.target.value)} style={input}>
              {VENUE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </Field>
          <div style={twoCol}>
            <Field label="開催日時">
              <input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} style={input} />
            </Field>
            <Field label="終了日時">
              <input type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} style={input} />
            </Field>
          </div>
          <Field label="紐付ける駐車場">
            <select value={placeId} onChange={(e) => setPlaceId(e.target.value)} style={input}>
              <option value="">未選択</option>
              {places.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </Field>
          <Field label="対応エリア（VenueGroup）">
            <select
              value={venueGroupId}
              onChange={(e) => setVenueGroupId(e.target.value)}
              style={input}
            >
              <option value="">未選択</option>
              {venueGroups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.id} - {g.name}
                </option>
              ))}
            </select>
            {(() => {
              const selected = venueGroups.find((g) => g.id === venueGroupId);
              if (!selected) return null;
              const visible = selected.parkings.filter((p) => p.showOnHp);
              if (visible.length === 0)
                return (
                  <div style={{ marginTop: 6, fontSize: 12, color: "#6b7280" }}>
                    HP表示対象の駐車場はありません
                  </div>
                );
              return (
                <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {visible.map((p) => (
                    <span
                      key={p.id}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        padding: "4px 10px",
                        borderRadius: 999,
                        background: "#eff6ff",
                        color: "#1e40af",
                        fontSize: 12,
                        fontWeight: 700,
                        border: "1px solid #bfdbfe",
                      }}
                    >
                      🅿️ {PARKING_NAMES[p.parkingSlug] ?? p.parkingSlug}
                    </span>
                  ))}
                </div>
              );
            })()}
          </Field>
          <Field label="公式URL">
            <input value={officialUrl} onChange={(e) => setOfficialUrl(e.target.value)} style={input} />
          </Field>

          <hr style={{ margin: "20px 0", border: "none", borderTop: "1px solid #e5e7eb" }} />

          <div style={{ fontWeight: 800, marginBottom: 8 }}>予約開始タイミング</div>
          <Field label="予約開始タイミング">
            <select value={bookingDaysOpt} onChange={(e) => setBookingDaysOpt(e.target.value)} style={input}>
              {BOOKING_DAYS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </Field>

          {isCustomBooking ? (
            <Field label="予約開始日時（カスタム）">
              <input
                type="datetime-local"
                value={bookingStartAt}
                onChange={(e) => setBookingStartAt(e.target.value)}
                style={input}
              />
            </Field>
          ) : (
            <Field label="受付開始時刻">
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
                style={input}
              />
            </Field>
            <Field label="競合価格（参考・管理画面のみ表示）">
              <input
                type="number"
                value={competitorPrice}
                onChange={(e) => setCompetitorPrice(e.target.value)}
                style={input}
              />
            </Field>
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
            <button type="button" onClick={save} disabled={busy !== null} style={primaryBtn}>
              {busy === "save" ? "保存中..." : "💾 保存"}
            </button>
            <button type="button" onClick={remove} disabled={busy !== null} style={dangerBtn}>
              🗑️ 削除
            </button>
          </div>

          <div style={{ marginTop: 16, fontSize: 12, color: "#6b7280" }}>
            sourceType: {event.sourceType} / created: {new Date(event.createdAt).toLocaleString("ja-JP")}{" "}
            / updated: {new Date(event.updatedAt).toLocaleString("ja-JP")}
          </div>
        </div>
      )}
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block", marginBottom: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>{label}</div>
      {children}
    </label>
  );
}

function statusColor(s: string) {
  if (s === "published") return "#16a34a";
  if (s === "approved") return "#0369a1";
  return "#6b7280";
}

function badge(color: string): React.CSSProperties {
  return {
    background: color,
    color: "#fff",
    padding: "4px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 800,
  };
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

const dangerBtn: React.CSSProperties = {
  padding: "12px 18px",
  borderRadius: 10,
  border: "1px solid #dc2626",
  background: "#fff",
  color: "#dc2626",
  fontWeight: 800,
  cursor: "pointer",
};

const errBox: React.CSSProperties = {
  border: "1px solid #fecaca",
  background: "#fef2f2",
  color: "#b91c1c",
  padding: 12,
  borderRadius: 12,
  marginBottom: 12,
  fontWeight: 700,
};

const okBox: React.CSSProperties = {
  border: "1px solid #bbf7d0",
  background: "#f0fdf4",
  color: "#166534",
  padding: 12,
  borderRadius: 12,
  marginBottom: 12,
  fontWeight: 700,
};
