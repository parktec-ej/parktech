"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

function ymdTodayJst() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}
function ymdPlusDays(ymd: string, days: number) {
  const [y, m, d] = ymd.split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1, d));
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}
function fmtDateTime(iso: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type OfferStatus =
  | "WAITING"
  | "RELEASED"
  | "TENANT_TOOK"
  | "TENANT_CHARGE_PENDING"
  | "PAID"
  | "EXPIRED"
  | "CANCELED";

type OfferItem = {
  id: string;
  date: string;
  deadline: string;
  status: OfferStatus;
  spot: { id: string; code: string; label: string | null } | null;
  contract: {
    id: string;
    status: string;
    tenantName: string | null;
    tenantEmail: string | null;
  } | null;
  monthlyResponse: { status: string; respondedAt: string | null } | null;
  applicantName: string | null;
  applicantEmail: string | null;
  applicantPhone: string | null;
  applicantPlate: string | null;
  applicantCheckoutSession: string | null;
  reservation: { id: string; slot: string; paid: boolean; status: string } | null;
  linkExpiresAt: string | null;
  linkExpired: boolean;
  needsAction: boolean;
  createdAt: string;
  updatedAt: string;
};

type ApiResponse = {
  ok: boolean;
  place?: { id: string; slug: string; name: string };
  range?: { from: string; to: string };
  summary?: {
    total: number;
    byStatus: Record<string, number>;
    needsAction: number;
    linkExpired: number;
  };
  offers?: OfferItem[];
  error?: string;
  message?: string;
};

const STATUS_LABEL: Record<OfferStatus, string> = {
  WAITING: "回答待ち",
  RELEASED: "決済待ち",
  TENANT_TOOK: "月極が利用",
  TENANT_CHARGE_PENDING: "課金失敗",
  PAID: "完了",
  EXPIRED: "期限切れ",
  CANCELED: "取消",
};

function statusPill(status: string): React.CSSProperties {
  switch (status) {
    case "WAITING":
      return { background: "#f3f4f6", color: "#374151" }; // グレー
    case "RELEASED":
      return { background: "#fff7ed", color: "#9a3412" }; // 橙
    case "TENANT_TOOK":
      return { background: "#eff6ff", color: "#1d4ed8" }; // 青
    case "TENANT_CHARGE_PENDING":
      return { background: "#fef2f2", color: "#b91c1c" }; // 赤
    case "PAID":
      return { background: "#f0fdf4", color: "#166534" }; // 緑
    case "EXPIRED":
    case "CANCELED":
    default:
      return { background: "#f9fafb", color: "#9ca3af" }; // 薄グレー
  }
}

const RESPONSE_LABEL: Record<string, string> = {
  NOTIFIED: "通知済み",
  RESERVED: "利用する",
  DECLINED: "利用しない",
  EXPIRED: "期限切れ",
};

const RESEND_ERROR_LABEL: Record<string, string> = {
  already_reserved: "既に予約が入っているため再送できません",
  past_deadline: "締切を過ぎているため再送できません",
  no_valid_window: "有効な期限を設定できません",
};

function SummaryCard({ title, value }: { title: string; value: number }) {
  return (
    <div style={styles.summaryCard}>
      <div style={styles.summaryTitle}>{title}</div>
      <div style={styles.summaryValue}>{value}</div>
    </div>
  );
}

function SessionIdCell({ value }: { value: string | null }) {
  const [copied, setCopied] = useState(false);
  if (!value) return <span style={{ color: "#9ca3af" }}>-</span>;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <code style={styles.sessionCode}>{value}</code>
      <button
        type="button"
        style={styles.copyBtn}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            /* クリップボード不可の環境では何もしない（値は表示済み） */
          }
        }}
      >
        {copied ? "済" : "コピー"}
      </button>
    </span>
  );
}

function MonthlyOffersInner() {
  const searchParams = useSearchParams();
  const placeId = String(searchParams.get("placeId") ?? "").trim();

  const today = ymdTodayJst();
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(ymdPlusDays(today, 90));
  const [status, setStatus] = useState("ALL");

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [data, setData] = useState<ApiResponse | null>(null);

  const load = useCallback(async () => {
    if (!placeId) return;
    setLoading(true);
    setErr("");
    try {
      const params = new URLSearchParams({ placeId, from, to });
      if (status !== "ALL") params.set("status", status);
      const res = await fetch(`/api/admin/monthly-offers?${params.toString()}`, {
        cache: "no-store",
      });
      const json = (await res.json().catch(() => null)) as ApiResponse | null;
      if (!json) {
        setErr(`APIがJSONを返していません (${res.status})`);
        setData(null);
        return;
      }
      if (!res.ok || !json.ok) {
        setErr(json.message ?? json.error ?? "取得に失敗しました");
        setData(null);
        return;
      }
      setData(json);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [placeId, from, to, status]);

  const [resendingId, setResendingId] = useState<string | null>(null);

  const handleResend = useCallback(
    async (o: OfferItem) => {
      const spotLabel = o.spot?.label ?? o.spot?.code ?? "-";
      const ok = window.confirm(
        `以下の申請者へ決済リンクを再送します。よろしいですか？\n\n` +
          `申請者: ${o.applicantName ?? "-"}\n` +
          `メール: ${o.applicantEmail ?? "-"}\n` +
          `区画: ${spotLabel}\n` +
          `日付: ${o.date}`
      );
      if (!ok) return;
      setResendingId(o.id);
      try {
        const res = await fetch("/api/admin/monthly-offers/resend", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ offerId: o.id }),
        });
        const json = (await res.json().catch(() => null)) as
          | { ok?: boolean; error?: string; message?: string }
          | null;
        if (!res.ok || !json?.ok) {
          const code = json?.error ?? "";
          const msg =
            RESEND_ERROR_LABEL[code] ??
            json?.message ??
            `再送に失敗しました (${code || res.status})`;
          window.alert(msg);
        } else {
          window.alert("決済リンクを再送しました。");
        }
      } catch (e: unknown) {
        window.alert(e instanceof Error ? e.message : String(e));
      } finally {
        setResendingId(null);
        // 最新状態（already_reserved 等の反映含む）を再取得
        await load();
      }
    },
    [load]
  );

  useEffect(() => {
    load();
  }, [load]);

  // linkExpired を最上部、次に needsAction、その他は日付順（APIが日付昇順で返す）。
  const rows = useMemo(() => {
    const offers = data?.offers ?? [];
    const rank = (o: OfferItem) => (o.linkExpired ? 0 : o.needsAction ? 1 : 2);
    return [...offers].sort((a, b) => rank(a) - rank(b));
  }, [data]);

  const s = data?.summary;

  return (
    <main style={styles.page}>
      <h1 style={styles.h1}>月極イベント枠 承認状況</h1>
      <p style={styles.note}>
        原則参照専用です。要対応（決済待ちで未申請）の行のみ、決済リンクの再送が行えます。
      </p>

      {!placeId ? (
        <div style={styles.card}>
          上部の Place ピッカーで対象の駐車場を選択してください。
        </div>
      ) : (
        <>
          <div style={styles.summaryGrid}>
            <SummaryCard title="回答待ち" value={s?.byStatus?.WAITING ?? 0} />
            <SummaryCard title="決済待ち" value={s?.byStatus?.RELEASED ?? 0} />
            <SummaryCard title="完了" value={s?.byStatus?.PAID ?? 0} />
            <SummaryCard title="要対応" value={s?.needsAction ?? 0} />
            <SummaryCard title="リンク失効" value={s?.linkExpired ?? 0} />
          </div>

          <div style={styles.filterRow}>
            <label style={styles.filterLabel}>
              開始
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                style={styles.input}
              />
            </label>
            <label style={styles.filterLabel}>
              終了
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                style={styles.input}
              />
            </label>
            <label style={styles.filterLabel}>
              状態
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                style={styles.input}
              >
                <option value="ALL">すべて</option>
                <option value="WAITING">回答待ち</option>
                <option value="RELEASED">決済待ち</option>
                <option value="TENANT_TOOK">月極が利用</option>
                <option value="TENANT_CHARGE_PENDING">課金失敗</option>
                <option value="PAID">完了</option>
                <option value="EXPIRED">期限切れ</option>
                <option value="CANCELED">取消</option>
              </select>
            </label>
            <button type="button" style={styles.reloadBtn} onClick={() => load()}>
              {loading ? "読み込み中..." : "再読み込み"}
            </button>
          </div>

          {err ? <div style={styles.errorBox}>{err}</div> : null}

          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  {[
                    "日付",
                    "区画",
                    "契約者",
                    "月極の回答",
                    "オファー状態",
                    "申請者名",
                    "申請者メール",
                    "締切",
                    "リンク期限",
                    "予約",
                    "セッションID",
                    "操作",
                  ].map((h) => (
                    <th key={h} style={styles.th}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td style={styles.td} colSpan={12}>
                      {loading ? "読み込み中..." : "該当するオファーはありません。"}
                    </td>
                  </tr>
                ) : (
                  rows.map((o) => {
                    const rowBg = o.linkExpired
                      ? "#fef2f2"
                      : o.needsAction
                      ? "#fffbeb"
                      : undefined;
                    return (
                      <tr key={o.id} style={{ background: rowBg }}>
                        <td style={styles.td}>{o.date}</td>
                        <td style={styles.td}>
                          {o.spot?.label ?? o.spot?.code ?? "-"}
                        </td>
                        <td style={styles.td}>{o.contract?.tenantName ?? "-"}</td>
                        <td style={styles.td}>
                          {o.monthlyResponse
                            ? `${
                                RESPONSE_LABEL[o.monthlyResponse.status] ??
                                o.monthlyResponse.status
                              }${
                                o.monthlyResponse.respondedAt
                                  ? ` (${fmtDateTime(o.monthlyResponse.respondedAt)})`
                                  : ""
                              }`
                            : "未回答"}
                        </td>
                        <td style={styles.td}>
                          <span style={{ ...styles.pill, ...statusPill(o.status) }}>
                            {STATUS_LABEL[o.status] ?? o.status}
                          </span>
                        </td>
                        <td style={styles.td}>{o.applicantName ?? "-"}</td>
                        <td style={styles.td}>{o.applicantEmail ?? "-"}</td>
                        <td style={styles.td}>{o.deadline}</td>
                        <td style={styles.td}>
                          {o.linkExpiresAt ? (
                            <span
                              style={{ color: o.linkExpired ? "#b91c1c" : undefined }}
                            >
                              {fmtDateTime(o.linkExpiresAt)}
                              {o.linkExpired ? "（失効）" : ""}
                            </span>
                          ) : (
                            "-"
                          )}
                        </td>
                        <td style={styles.td}>
                          {o.reservation
                            ? `${o.reservation.slot} / ${
                                o.reservation.paid ? "決済済" : "未決済"
                              } / ${o.reservation.status}`
                            : "-"}
                        </td>
                        <td style={styles.td}>
                          <SessionIdCell value={o.applicantCheckoutSession} />
                        </td>
                        <td style={styles.td}>
                          {o.needsAction ? (
                            <button
                              type="button"
                              style={{
                                ...styles.resendBtn,
                                ...(resendingId === o.id
                                  ? styles.resendBtnDisabled
                                  : null),
                              }}
                              disabled={resendingId === o.id}
                              onClick={() => handleResend(o)}
                            >
                              {resendingId === o.id ? "送信中…" : "決済リンク再送"}
                            </button>
                          ) : (
                            "-"
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </main>
  );
}

export default function MonthlyOffersPage() {
  return (
    <Suspense fallback={<main style={styles.page}>読み込み中...</main>}>
      <MonthlyOffersInner />
    </Suspense>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { maxWidth: 1200, margin: "0 auto", padding: "16px" },
  h1: { fontSize: 22, fontWeight: 700, marginBottom: 4 },
  note: { fontSize: 13, color: "#6b7280", marginBottom: 16 },
  card: {
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    padding: 16,
    color: "#374151",
  },
  summaryGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
    gap: 12,
    marginBottom: 16,
  },
  summaryCard: {
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    padding: "12px 16px",
  },
  summaryTitle: { fontSize: 13, color: "#6b7280", marginBottom: 4 },
  summaryValue: { fontSize: 24, fontWeight: 800 },
  filterRow: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "flex-end",
    gap: 12,
    marginBottom: 12,
  },
  filterLabel: {
    display: "grid",
    gap: 4,
    fontSize: 12,
    color: "#374151",
    fontWeight: 700,
  },
  input: {
    height: 38,
    borderRadius: 8,
    border: "1px solid #d1d5db",
    padding: "0 10px",
    fontSize: 14,
    background: "#fff",
  },
  reloadBtn: {
    height: 38,
    borderRadius: 8,
    border: "1px solid #111827",
    background: "#111827",
    color: "#fff",
    fontWeight: 700,
    padding: "0 16px",
    cursor: "pointer",
  },
  errorBox: {
    background: "#fef2f2",
    border: "1px solid #fecaca",
    color: "#b91c1c",
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    fontSize: 14,
  },
  tableWrap: {
    overflowX: "auto",
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    background: "#fff",
  },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: {
    textAlign: "left",
    padding: "10px 12px",
    borderBottom: "1px solid #e5e7eb",
    background: "#f9fafb",
    whiteSpace: "nowrap",
    fontWeight: 800,
    color: "#374151",
  },
  td: {
    padding: "10px 12px",
    borderBottom: "1px solid #f3f4f6",
    verticalAlign: "top",
    whiteSpace: "nowrap",
  },
  pill: {
    display: "inline-block",
    padding: "3px 10px",
    borderRadius: 999,
    fontWeight: 800,
    fontSize: 12,
  },
  sessionCode: {
    fontFamily: "monospace",
    fontSize: 12,
    background: "#f3f4f6",
    padding: "2px 6px",
    borderRadius: 6,
    userSelect: "all",
    wordBreak: "break-all",
  },
  copyBtn: {
    fontSize: 11,
    border: "1px solid #d1d5db",
    background: "#fff",
    borderRadius: 6,
    padding: "2px 6px",
    cursor: "pointer",
  },
  resendBtn: {
    fontSize: 12,
    fontWeight: 700,
    border: "1px solid #b45309",
    background: "#f59e0b",
    color: "#111827",
    borderRadius: 8,
    padding: "6px 10px",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  resendBtnDisabled: {
    background: "#e5e7eb",
    borderColor: "#d1d5db",
    color: "#9ca3af",
    cursor: "not-allowed",
  },
};
