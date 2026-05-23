import Link from "next/link";
import { getMonthlyStatus, type TaskStatus } from "@/lib/monthly-status";

const ICON: Record<TaskStatus, string> = {
  done: "✅",
  pending: "🟡",
  overdue: "🔴",
};

const TASK_LINKS: Record<string, string> = {
  精算データ作成: "/admin/settlements",
  精算承認: "/admin/settlements",
  振込実行: "/admin/settlements",
  精算書送信: "/admin/settlements",
};

export default async function MonthlyTasksWidget() {
  const status = await getMonthlyStatus();

  const monthLabel = status.currentMonth.replace(
    /^(\d{4})-(\d{2})$/,
    "$1年$2月"
  );

  return (
    <section style={card}>
      <div style={headerRow}>
        <div>
          <h2 style={title}>📋 {monthLabel}分 月次業務</h2>
          <div style={subText}>
            本日 {status.todayJst} / phase: {status.phase}
          </div>
        </div>
        <div style={countsBox}>
          <span title="締め済み Settlement 数">
            締め {status.counts.total}件
          </span>
          {status.counts.draft + status.counts.approved > 0 && (
            <span style={pendingPill}>
              未承認 {status.counts.draft + status.counts.approved}
            </span>
          )}
          {status.counts.locked > 0 && (
            <span style={pendingPill}>未払い {status.counts.locked}</span>
          )}
          {status.counts.paid > 0 && (
            <span style={donePill}>支払済 {status.counts.paid}</span>
          )}
        </div>
      </div>

      <ul style={list}>
        {status.tasks.map((t) => (
          <li key={t.label} style={item}>
            <span style={iconStyle}>{ICON[t.status]}</span>
            <span style={labelStyle}>{t.label}</span>
            {t.count != null && t.count > 0 && (
              <span style={countStyle}>{t.count}件</span>
            )}
            {t.deadline && (
              <span style={deadlineStyle}>期限: {t.deadline}</span>
            )}
            {t.status !== "done" && (
              <Link
                href={TASK_LINKS[t.label] ?? "/admin/settlements"}
                style={actionLink}
              >
                対応 →
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

const card: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 14,
  padding: 16,
  background: "#fff",
  marginBottom: 16,
};

const headerRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  marginBottom: 12,
  flexWrap: "wrap",
};

const title: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 800,
  margin: 0,
};

const subText: React.CSSProperties = {
  fontSize: 11,
  color: "#6b7280",
  marginTop: 2,
};

const countsBox: React.CSSProperties = {
  display: "flex",
  gap: 6,
  alignItems: "center",
  fontSize: 12,
  color: "#374151",
  flexWrap: "wrap",
};

const pendingPill: React.CSSProperties = {
  background: "#fef3c7",
  color: "#92400e",
  border: "1px solid #fde68a",
  padding: "2px 8px",
  borderRadius: 999,
  fontWeight: 700,
  fontSize: 11,
};

const donePill: React.CSSProperties = {
  background: "#dcfce7",
  color: "#166534",
  border: "1px solid #bbf7d0",
  padding: "2px 8px",
  borderRadius: 999,
  fontWeight: 700,
  fontSize: 11,
};

const list: React.CSSProperties = {
  listStyle: "none",
  padding: 0,
  margin: 0,
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const item: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "8px 12px",
  background: "#fafafa",
  borderRadius: 10,
  border: "1px solid #e5e7eb",
  flexWrap: "wrap",
};

const iconStyle: React.CSSProperties = {
  fontSize: 18,
};

const labelStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  flex: 1,
  minWidth: 0,
};

const countStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: "#6b7280",
  fontVariantNumeric: "tabular-nums",
};

const deadlineStyle: React.CSSProperties = {
  fontSize: 11,
  color: "#6b7280",
};

const actionLink: React.CSSProperties = {
  fontSize: 12,
  color: "#2563eb",
  fontWeight: 700,
  textDecoration: "none",
  marginLeft: "auto",
};
