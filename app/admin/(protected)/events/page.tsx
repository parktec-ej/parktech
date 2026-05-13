"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";

type EventRow = {
  id: string;
  title: string;
  description: string | null;
  venue: string;
  category: string;
  startAt: string;
  endAt: string | null;
  sourceType: string;
  sourceUrl: string | null;
  officialUrl: string | null;
  competitorPrice: number | null;
  ourPrice: number | null;
  bookingStartDays: number | null;
  bookingStartAt: string | null;
  bookingStartTime: string | null;
  status: "draft" | "approved" | "published";
  place: { id: string; slug: string; name: string } | null;
  placeId: string | null;
  snsPostsCount: number;
  isNewlyScraped: boolean;
  createdAt: string;
  updatedAt: string;
};

type ApiResp = {
  ok: boolean;
  events?: EventRow[];
  error?: string;
  message?: string;
};

type Filter = "all" | "draft" | "approved" | "published";

const VENUE_LABEL: Record<string, string> = {
  sekisui_arena: "セキスイハイムスーパーアリーナ",
  qanda_stadium: "キューアンドエースタジアムみやぎ",
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" });
}

function fmtDateTime(iso: string | null) {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
}

function EventsListInner() {
  const [filter, setFilter] = useState<Filter>("all");
  const [data, setData] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const qs = filter !== "all" ? `?status=${filter}` : "";
      const res = await fetch(`/api/admin/events${qs}`, { cache: "no-store" });
      const json: ApiResp = await res.json();
      if (!json.ok) {
        setErr(json.message ?? json.error ?? "読み込みに失敗しました");
        setData([]);
        return;
      }
      setData(json.events ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const counts = useMemo(() => {
    return {
      all: data.length,
      newly: data.filter((e) => e.isNewlyScraped).length,
    };
  }, [data]);

  return (
    <main style={{ maxWidth: 1180, margin: "0 auto", padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <h1 style={{ fontSize: 28, fontWeight: 900, margin: 0 }}>🎫 イベント管理</h1>
        <Link href="/admin/events/new" style={primaryBtn}>＋ 新規登録</Link>
      </div>

      <div style={{ marginTop: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <FilterBtn label="すべて" active={filter === "all"} count={counts.all} onClick={() => setFilter("all")} />
        <FilterBtn label="draft" active={filter === "draft"} onClick={() => setFilter("draft")} />
        <FilterBtn label="approved" active={filter === "approved"} onClick={() => setFilter("approved")} />
        <FilterBtn label="published" active={filter === "published"} onClick={() => setFilter("published")} />
        {counts.newly > 0 && (
          <span style={{ marginLeft: "auto", alignSelf: "center", fontSize: 13, color: "#92400e", fontWeight: 700 }}>
            🆕 新着 {counts.newly} 件（未承認・自動取得）
          </span>
        )}
      </div>

      {err ? <div style={errStyle}>{err}</div> : null}

      <div style={{ marginTop: 16 }}>
        {loading ? (
          <div>読み込み中...</div>
        ) : data.length === 0 ? (
          <div style={{ color: "#666", padding: 24 }}>該当するイベントがありません。</div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {data.map((e) => (
              <Link
                key={e.id}
                href={`/admin/events/${e.id}`}
                style={{
                  ...cardStyle,
                  textDecoration: "none",
                  color: "inherit",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <div style={{ fontWeight: 800, fontSize: 16 }}>{e.title}</div>
                    {e.isNewlyScraped && <span style={badge("#f59e0b")}>🆕 新着</span>}
                    <span style={badge(statusColor(e.status))}>{e.status}</span>
                  </div>
                </div>
                <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 6, fontSize: 13, color: "#374151" }}>
                  <div>開催日: <b>{fmtDate(e.startAt)}</b></div>
                  <div>会場: {VENUE_LABEL[e.venue] ?? e.venue}</div>
                  <div>予約開始: {fmtDateTime(e.bookingStartAt)}</div>
                  <div>当日料金: {e.ourPrice != null ? `${e.ourPrice.toLocaleString()} 円` : "-"}</div>
                  <div style={{ color: "#92400e" }}>競合(参考): {e.competitorPrice != null ? `${e.competitorPrice.toLocaleString()} 円` : "-"}</div>
                  <div>取込: {e.sourceType}</div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

function FilterBtn({
  label,
  active,
  count,
  onClick,
}: {
  label: string;
  active: boolean;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "8px 14px",
        borderRadius: 999,
        border: active ? "1px solid #2563eb" : "1px solid #d1d5db",
        background: active ? "#2563eb" : "#fff",
        color: active ? "#fff" : "#111",
        fontWeight: 700,
        cursor: "pointer",
        fontSize: 14,
      }}
    >
      {label}
      {typeof count === "number" ? ` (${count})` : ""}
    </button>
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
    padding: "2px 8px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 800,
  };
}

const primaryBtn: React.CSSProperties = {
  padding: "10px 16px",
  borderRadius: 10,
  border: "1px solid #111",
  background: "#111",
  color: "#fff",
  fontWeight: 800,
  textDecoration: "none",
  fontSize: 14,
};

const cardStyle: React.CSSProperties = {
  display: "block",
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  padding: 16,
  background: "#fff",
};

const errStyle: React.CSSProperties = {
  marginTop: 12,
  border: "1px solid #fecaca",
  background: "#fef2f2",
  color: "#b91c1c",
  borderRadius: 12,
  padding: 12,
  fontWeight: 700,
};

export default function EventsListPage() {
  return (
    <Suspense fallback={<main style={{ padding: 24 }}>読み込み中...</main>}>
      <EventsListInner />
    </Suspense>
  );
}
