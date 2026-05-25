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

type SnsPostRow = {
  id: string;
  eventId: string;
  phase: number;
  phaseLabel: string;
  platform: string;
  postText: string;
  scheduledAt: string | null;
  postedAt: string | null;
  fbPostId: string | null;
  triggerType: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

const PHASE_BUTTONS: Array<{ phase: number; label: string }> = [
  { phase: 1, label: "Phase1: イベント決定アナウンス" },
  { phase: 2, label: "Phase2: 予約開始日お知らせ" },
  { phase: 3, label: "Phase3: 予約1週間前予告" },
  { phase: 4, label: "Phase4: 予約3日前予告" },
  { phase: 5, label: "Phase5: 予約受付開始" },
  { phase: 6, label: "Phase6: 満車・残りわずか" },
  { phase: 7, label: "Phase7: キャンセル報告" },
];

const SNS_STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  draft: { bg: "#e5e7eb", fg: "#374151" },
  scheduled: { bg: "#dbeafe", fg: "#1e40af" },
  posted: { bg: "#dcfce7", fg: "#166534" },
  failed: { bg: "#fee2e2", fg: "#991b1b" },
};

function fromDateTimeLocalToIso(local: string): string | null {
  if (!local) return null;
  // local is "YYYY-MM-DDTHH:mm" interpreted as JST
  const d = new Date(local + ":00+09:00");
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

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

  // --- SNS posts state ---
  const [posts, setPosts] = useState<SnsPostRow[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [genBusyPhase, setGenBusyPhase] = useState<number | null>(null);
  const [postBusyId, setPostBusyId] = useState<string | null>(null);
  const [genPlatform, setGenPlatform] = useState<"facebook" | "instagram">("facebook");
  const [postImageUrls, setPostImageUrls] = useState<Record<string, string>>({});

  async function fetchPosts() {
    if (!id) return;
    setPostsLoading(true);
    try {
      const res = await fetch(
        `/api/admin/sns-posts?eventId=${encodeURIComponent(id)}`,
        { cache: "no-store" }
      );
      const json = await res.json();
      if (json?.ok && Array.isArray(json.posts)) setPosts(json.posts);
    } catch {
      // swallow — error feedback comes from per-action handlers
    } finally {
      setPostsLoading(false);
    }
  }

  async function handleGenerate(phase: number) {
    if (genBusyPhase !== null) return;
    setGenBusyPhase(phase);
    try {
      const res = await fetch("/api/admin/sns-posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: id,
          phase,
          autoGenerate: true,
          platform: genPlatform,
        }),
      });
      const json = await res.json();
      if (!json?.ok) {
        alert(
          `生成失敗: ${json?.error ?? "unknown"}${json?.message ? " - " + json.message : ""}`
        );
        return;
      }
      await fetchPosts();
    } catch (e) {
      alert(`通信エラー: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setGenBusyPhase(null);
    }
  }

  function updatePostLocal(postId: string, patch: Partial<SnsPostRow>) {
    setPosts((cur) => cur.map((p) => (p.id === postId ? { ...p, ...patch } : p)));
  }

  async function handleSavePost(post: SnsPostRow) {
    setPostBusyId(post.id);
    try {
      const res = await fetch(`/api/admin/sns-posts/${post.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          postText: post.postText,
          scheduledAt: post.scheduledAt,
        }),
      });
      const json = await res.json();
      if (!json?.ok) {
        alert(`保存失敗: ${json?.error ?? "unknown"}`);
        return;
      }
      await fetchPosts();
    } catch (e) {
      alert(`通信エラー: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setPostBusyId(null);
    }
  }

  async function handlePostNow(post: SnsPostRow, mode: "now" | "scheduled") {
    const platformLabel = post.platform === "instagram" ? "Instagram" : "Facebook";
    const confirmMsg =
      mode === "now"
        ? `${platformLabel} に今すぐ投稿します。よろしいですか？`
        : `${platformLabel} 側に予約投稿として登録します。よろしいですか？`;
    if (!confirm(confirmMsg)) return;

    // Instagram は画像URL必須・予約不可
    const imageUrl = postImageUrls[post.id]?.trim() ?? "";
    if (post.platform === "instagram") {
      if (mode === "scheduled") {
        alert("Instagram は予約投稿に対応していません（即時投稿のみ）");
        return;
      }
      if (!imageUrl) {
        alert("Instagram投稿には画像URLが必要です");
        return;
      }
    }

    setPostBusyId(post.id);
    try {
      const res = await fetch(`/api/admin/sns-posts/${post.id}/post-now`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          ...(post.platform === "instagram" ? { imageUrl } : {}),
        }),
      });
      const json = await res.json();
      if (!json?.ok) {
        alert(
          `投稿失敗: ${json?.error ?? "unknown"}${json?.message ? " - " + json.message : ""}`
        );
        return;
      }
      alert(
        mode === "scheduled"
          ? `${platformLabel} 側に予約投稿を登録しました`
          : `${platformLabel} への投稿が完了しました`
      );
      await fetchPosts();
    } catch (e) {
      alert(`通信エラー: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setPostBusyId(null);
    }
  }

  async function handleDeletePost(post: SnsPostRow) {
    if (!confirm(`「${post.phaseLabel}」を削除します。よろしいですか？`)) return;
    setPostBusyId(post.id);
    try {
      const res = await fetch(`/api/admin/sns-posts/${post.id}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!json?.ok) {
        alert(`削除失敗: ${json?.error ?? "unknown"}`);
        return;
      }
      await fetchPosts();
    } catch (e) {
      alert(`通信エラー: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setPostBusyId(null);
    }
  }

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
    fetchPosts();
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

          <hr style={{ margin: "20px 0", border: "none", borderTop: "1px solid #e5e7eb" }} />

          <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 6 }}>
            📣 SNS投稿管理
          </div>
          <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 12 }}>
            Claudeでフェーズごとの投稿文を自動生成し、FacebookまたはInstagramに投稿します。
          </div>

          <div style={{ fontSize: 13, fontWeight: 700, margin: "8px 0 6px" }}>
            📝 投稿文をPhase別に生成
          </div>

          <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, color: "#6b7280", alignSelf: "center", marginRight: 4 }}>
              投稿先:
            </span>
            {(["facebook", "instagram"] as const).map((pf) => {
              const active = genPlatform === pf;
              const label = pf === "facebook" ? "📣 Facebook" : "📸 Instagram";
              return (
                <button
                  key={pf}
                  type="button"
                  onClick={() => setGenPlatform(pf)}
                  disabled={genBusyPhase !== null}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 999,
                    border: "1px solid",
                    borderColor: active ? "#111827" : "#d1d5db",
                    background: active ? "#111827" : "#fff",
                    color: active ? "#fff" : "#374151",
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: genBusyPhase !== null ? "not-allowed" : "pointer",
                    opacity: genBusyPhase !== null ? 0.6 : 1,
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 8,
              marginBottom: 16,
            }}
          >
            {PHASE_BUTTONS.map((b) => (
              <button
                key={b.phase}
                type="button"
                onClick={() => handleGenerate(b.phase)}
                disabled={genBusyPhase !== null}
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid #d1d5db",
                  background: genBusyPhase === b.phase ? "#fef3c7" : "#f9fafb",
                  color: "#111",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: genBusyPhase !== null ? "not-allowed" : "pointer",
                  opacity: genBusyPhase !== null && genBusyPhase !== b.phase ? 0.6 : 1,
                  textAlign: "left",
                }}
              >
                {genBusyPhase === b.phase ? "🤖 生成中..." : b.label}
              </button>
            ))}
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              margin: "16px 0 8px",
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 700 }}>
              📋 投稿一覧 ({posts.length}件)
            </div>
            <button
              type="button"
              onClick={fetchPosts}
              disabled={postsLoading}
              style={{
                fontSize: 12,
                color: "#2563eb",
                background: "none",
                border: "none",
                cursor: postsLoading ? "default" : "pointer",
                textDecoration: "underline",
              }}
            >
              {postsLoading ? "更新中..." : "🔄 再読み込み"}
            </button>
          </div>

          {postsLoading && posts.length === 0 ? (
            <div style={{ fontSize: 13, color: "#6b7280", padding: 12 }}>
              読み込み中...
            </div>
          ) : posts.length === 0 ? (
            <div
              style={{
                border: "1px dashed #d1d5db",
                borderRadius: 12,
                padding: 24,
                textAlign: "center",
                fontSize: 13,
                color: "#6b7280",
              }}
            >
              まだ投稿はありません。上のボタンから生成してください。
            </div>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {posts.map((p) => {
                const style =
                  SNS_STATUS_STYLE[p.status] ??
                  { bg: "#e5e7eb", fg: "#374151" };
                const busy = postBusyId === p.id;
                const isPosted = p.status === "posted";
                return (
                  <li
                    key={p.id}
                    style={{
                      border: "1px solid #e5e7eb",
                      background: "#fafafa",
                      borderRadius: 12,
                      padding: 14,
                      marginBottom: 12,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        flexWrap: "wrap",
                        gap: 8,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span
                          style={{
                            background: style.bg,
                            color: style.fg,
                            padding: "3px 10px",
                            borderRadius: 999,
                            fontSize: 11,
                            fontWeight: 800,
                            textTransform: "uppercase",
                          }}
                        >
                          {p.status}
                        </span>
                        <span
                          style={{
                            background: p.platform === "instagram" ? "#fce7f3" : "#dbeafe",
                            color: p.platform === "instagram" ? "#9d174d" : "#1e40af",
                            padding: "3px 8px",
                            borderRadius: 999,
                            fontSize: 11,
                            fontWeight: 700,
                          }}
                        >
                          {p.platform === "instagram" ? "📸 IG" : "📣 FB"}
                        </span>
                        <span style={{ fontSize: 13, fontWeight: 700 }}>
                          {p.phaseLabel}
                        </span>
                      </div>
                      {p.fbPostId ? (
                        <span
                          style={{
                            fontSize: 11,
                            color: "#6b7280",
                            fontFamily: "ui-monospace, monospace",
                          }}
                        >
                          {p.platform === "instagram" ? "igPostId" : "fbPostId"}: {p.fbPostId}
                        </span>
                      ) : null}
                    </div>

                    <textarea
                      value={p.postText}
                      onChange={(e) =>
                        updatePostLocal(p.id, { postText: e.target.value })
                      }
                      rows={6}
                      style={{
                        ...input,
                        marginTop: 10,
                        minHeight: 120,
                        fontFamily: "inherit",
                        fontSize: 13,
                        lineHeight: 1.5,
                      }}
                      disabled={isPosted}
                    />
                    <div
                      style={{
                        fontSize: 11,
                        color: "#6b7280",
                        marginTop: 2,
                        textAlign: "right",
                      }}
                    >
                      {p.postText.length} 文字
                    </div>

                    <div
                      style={{
                        marginTop: 10,
                        display: "flex",
                        gap: 12,
                        flexWrap: "wrap",
                        alignItems: "flex-end",
                      }}
                    >
                      <label style={{ display: "block" }}>
                        <div
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            color: "#6b7280",
                            marginBottom: 4,
                          }}
                        >
                          予約日時（JST）
                        </div>
                        <input
                          type="datetime-local"
                          value={toDateTimeLocal(p.scheduledAt)}
                          onChange={(e) =>
                            updatePostLocal(p.id, {
                              scheduledAt: fromDateTimeLocalToIso(e.target.value),
                            })
                          }
                          style={{
                            ...input,
                            width: 220,
                            padding: 8,
                          }}
                          disabled={isPosted}
                        />
                      </label>
                      {p.postedAt ? (
                        <div style={{ fontSize: 11, color: "#6b7280" }}>
                          投稿日時:{" "}
                          {new Date(p.postedAt).toLocaleString("ja-JP", {
                            timeZone: "Asia/Tokyo",
                          })}
                        </div>
                      ) : null}
                    </div>

                    {p.platform === "instagram" && !isPosted && (
                      <div style={{ marginTop: 10 }}>
                        <div
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            color: "#6b7280",
                            marginBottom: 4,
                          }}
                        >
                          📸 画像URL（Instagram投稿に必須・公開アクセス可能なURL）
                        </div>
                        <input
                          type="url"
                          placeholder="https://example.com/image.jpg"
                          value={postImageUrls[p.id] ?? ""}
                          onChange={(e) =>
                            setPostImageUrls((cur) => ({
                              ...cur,
                              [p.id]: e.target.value,
                            }))
                          }
                          style={{
                            ...input,
                            padding: 8,
                            fontSize: 13,
                          }}
                        />
                      </div>
                    )}

                    <div
                      style={{
                        marginTop: 12,
                        display: "flex",
                        gap: 8,
                        flexWrap: "wrap",
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => handleSavePost(p)}
                        disabled={busy || isPosted}
                        style={{
                          padding: "8px 14px",
                          borderRadius: 8,
                          border: "1px solid #d1d5db",
                          background: "#fff",
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: busy || isPosted ? "not-allowed" : "pointer",
                          opacity: busy || isPosted ? 0.6 : 1,
                        }}
                      >
                        💾 保存
                      </button>
                      <button
                        type="button"
                        onClick={() => handlePostNow(p, "now")}
                        disabled={busy || isPosted}
                        style={{
                          padding: "8px 14px",
                          borderRadius: 8,
                          border: "1px solid #16a34a",
                          background: "#16a34a",
                          color: "#fff",
                          fontSize: 12,
                          fontWeight: 800,
                          cursor: busy || isPosted ? "not-allowed" : "pointer",
                          opacity: busy || isPosted ? 0.6 : 1,
                        }}
                      >
                        📣 今すぐ投稿
                      </button>
                      <button
                        type="button"
                        onClick={() => handlePostNow(p, "scheduled")}
                        disabled={busy || isPosted || !p.scheduledAt}
                        title={
                          !p.scheduledAt
                            ? "予約日時を設定してください"
                            : ""
                        }
                        style={{
                          padding: "8px 14px",
                          borderRadius: 8,
                          border: "1px solid #2563eb",
                          background: "#2563eb",
                          color: "#fff",
                          fontSize: 12,
                          fontWeight: 800,
                          cursor:
                            busy || isPosted || !p.scheduledAt
                              ? "not-allowed"
                              : "pointer",
                          opacity:
                            busy || isPosted || !p.scheduledAt ? 0.5 : 1,
                        }}
                      >
                        📅 予約投稿
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeletePost(p)}
                        disabled={busy}
                        style={{
                          marginLeft: "auto",
                          padding: "8px 14px",
                          borderRadius: 8,
                          border: "1px solid #dc2626",
                          background: "#fff",
                          color: "#dc2626",
                          fontSize: 12,
                          fontWeight: 800,
                          cursor: busy ? "not-allowed" : "pointer",
                          opacity: busy ? 0.6 : 1,
                        }}
                      >
                        🗑️ 削除
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <hr style={{ margin: "20px 0", border: "none", borderTop: "1px solid #e5e7eb" }} />

          <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
            <button type="button" onClick={save} disabled={busy !== null} style={primaryBtn}>
              {busy === "save" ? "保存中..." : "💾 保存"}
            </button>
            <button type="button" onClick={remove} disabled={busy !== null} style={dangerBtn}>
              🗑️ 削除
            </button>
          </div>

          <div style={{ marginTop: 16, fontSize: 12, color: "#6b7280" }}>
            sourceType: {event.sourceType} / created: {new Date(event.createdAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}{" "}
            / updated: {new Date(event.updatedAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}
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
