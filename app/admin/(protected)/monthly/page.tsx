import { prisma } from "@/lib/db";
import MonthlyActions from "./MonthlyActions";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  PENDING: "承認待ち",
  AWAITING_PAYMENT: "支払い待ち",
  ACTIVE: "契約中",
  PAST_DUE: "支払い遅延",
  CANCELED: "解約",
  REJECTED: "却下",
};
const PLAN_LABEL: Record<string, string> = {
  NON_EVENT_ONLY: "プラン1（非イベント日のみ）",
  INCLUDES_EVENT: "プラン2（イベント日も）",
};
const TERM_LABEL: Record<string, string> = {
  MONTHLY: "月払い", QUARTERLY: "3ヶ月", SEMIANNUAL: "半年", ANNUAL: "1年",
};

export default async function AdminMonthlyPage() {
  const contracts = await prisma.monthlyContract.findMany({
    include: { tenant: true, place: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <main style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700 }}>月極契約一覧</h1>
      <p style={{ color: "#666", fontSize: 14 }}>承認待ちの申込を承認すると、お支払いリンクが申込者へ自動送信されます。</p>

      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 16, fontSize: 13 }}>
        <thead>
          <tr style={{ background: "#f3f4f6", textAlign: "left" }}>
            <th style={th}>申込者</th>
            <th style={th}>駐車場</th>
            <th style={th}>プラン / 期間</th>
            <th style={th}>金額</th>
            <th style={th}>車両</th>
            <th style={th}>状態</th>
            <th style={th}>操作</th>
          </tr>
        </thead>
        <tbody>
          {contracts.map((c) => (
            <tr key={c.id} style={{ borderBottom: "1px solid #eee" }}>
              <td style={td}>{c.tenant.name}<br /><span style={{ color: "#888" }}>{c.tenant.email}</span></td>
              <td style={td}>{c.place.name}</td>
              <td style={td}>{PLAN_LABEL[c.plan] ?? c.plan}<br /><span style={{ color: "#888" }}>{TERM_LABEL[c.billingTerm] ?? c.billingTerm}</span></td>
              <td style={td}>¥{c.totalFeeYen.toLocaleString()}</td>
              <td style={td}>{c.vehicleType}<br /><span style={{ color: "#888" }}>{c.plate}</span></td>
              <td style={td}><span style={badge(c.status)}>{STATUS_LABEL[c.status] ?? c.status}</span></td>
              <td style={td}>
                {c.status === "PENDING" ? <MonthlyActions id={c.id} /> : <span style={{ color: "#aaa" }}>―</span>}
              </td>
            </tr>
          ))}
          {contracts.length === 0 ? (
            <tr><td style={td} colSpan={7}>契約はまだありません。</td></tr>
          ) : null}
        </tbody>
      </table>
    </main>
  );
}

const th: React.CSSProperties = { padding: "8px 10px", fontWeight: 600, borderBottom: "2px solid #ddd" };
const td: React.CSSProperties = { padding: "10px", verticalAlign: "top" };
function badge(status: string): React.CSSProperties {
  const color = status === "ACTIVE" ? "#166534" : status === "PENDING" ? "#92400e" : status === "AWAITING_PAYMENT" ? "#1e40af" : "#666";
  const bg = status === "ACTIVE" ? "#f0fdf4" : status === "PENDING" ? "#fffbeb" : status === "AWAITING_PAYMENT" ? "#eff6ff" : "#f3f4f6";
  return { padding: "2px 8px", borderRadius: 6, fontSize: 12, color, background: bg, whiteSpace: "nowrap" };
}
