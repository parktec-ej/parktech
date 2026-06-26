import { requireTenant } from "@/lib/tenant-auth";
import { prisma } from "@/lib/db";
import PasswordChange from "./PasswordChange";

export const dynamic = "force-dynamic";

const PLAN_LABEL: Record<string, string> = {
  NON_EVENT_ONLY: "プラン1：非イベント日のみ",
  INCLUDES_EVENT: "プラン2：イベント日も駐車可（都度予約）",
};
const TERM_LABEL: Record<string, string> = {
  MONTHLY: "月払い（毎月3,000円・自動継続）",
  QUARTERLY: "3ヶ月一括前払い", SEMIANNUAL: "半年一括前払い", ANNUAL: "1年一括前払い（10%割引）",
};
const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "契約中", PAST_DUE: "支払い遅延", CANCELED: "解約",
  AWAITING_PAYMENT: "支払い待ち", PENDING: "承認待ち", REJECTED: "却下",
};

function jstYmd(d: Date) {
  return d.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}

export default async function TenantDashboard() {
  const session = await requireTenant();

  const tenant = await prisma.tenant.findUnique({
    where: { id: session.tenantId },
    include: { contracts: { include: { place: true }, orderBy: { createdAt: "desc" } } },
  });

  if (!tenant) {
    return <main style={wrap}><p>契約者情報が見つかりません。</p></main>;
  }

  const contract = tenant.contracts.find((c) => c.status === "ACTIVE") ?? tenant.contracts[0] ?? null;
  const place = contract?.place ?? null;
  const includesEvent = contract?.plan === "INCLUDES_EVENT";

  const todayStart = new Date(`${jstYmd(new Date())}T00:00:00+09:00`);
  const eventDays = place
    ? await prisma.eventDay.findMany({
        where: { placeId: place.id, isActive: true, date: { gte: todayStart } },
        orderBy: { date: "asc" },
        take: 50,
      })
    : [];

  const reservations = await prisma.reservation.findMany({
    where: { email: tenant.email, canceledAt: null },
    orderBy: { date: "desc" },
    take: 30,
    select: { id: true, date: true, slot: true, price: true, paid: true, paymentRef: true },
  });

  return (
    <main style={wrap}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>契約者ページ</h1>
        <form method="post" action="/tenant/logout">
          <button type="submit" style={{ padding: "6px 12px", background: "#fff", border: "1px solid #ddd", borderRadius: 6, cursor: "pointer", fontSize: 13 }}>ログアウト</button>
        </form>
      </div>
      <p style={{ color: "#666", fontSize: 14 }}>{tenant.name} 様</p>

      {/* 契約内容 */}
      <section style={cardBox}>
        <h2 style={h2}>契約内容</h2>
        {contract ? (
          <div style={{ fontSize: 14, lineHeight: 1.9 }}>
            <div><strong>駐車場:</strong> {place?.name}</div>
            <div><strong>プラン:</strong> {PLAN_LABEL[contract.plan] ?? contract.plan}</div>
            <div><strong>お支払い:</strong> {TERM_LABEL[contract.billingTerm] ?? contract.billingTerm}</div>
            <div><strong>金額:</strong> ¥{contract.totalFeeYen.toLocaleString()}（税込）</div>
            <div><strong>車両:</strong> {contract.vehicleType} / {contract.plate}</div>
            <div><strong>状態:</strong> {STATUS_LABEL[contract.status] ?? contract.status}</div>
            {contract.startDate ? <div><strong>契約開始日:</strong> {contract.startDate}</div> : null}
            {contract.endDate ? <div><strong>契約満了日:</strong> {contract.endDate}</div> : null}
          </div>
        ) : <p>契約情報がありません。</p>}
      </section>

      {/* イベント日 */}
      <section style={cardBox}>
        <h2 style={h2}>イベント開催日</h2>
        <p style={{ fontSize: 13, color: "#92400e", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 6, padding: "8px 12px" }}>
          イベント開催日は月極でのご利用ができません。{includesEvent ? "駐車をご希望の場合は各日付から予約してください（追加料金）。" : "（プラン1のため、イベント日は駐車できません。）"}
        </p>
        {eventDays.length === 0 ? (
          <p style={{ fontSize: 14, color: "#666" }}>予定されているイベント日はありません。</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: "8px 0 0" }}>
            {eventDays.map((d) => {
              const ymd = jstYmd(d.date);
              return (
                <li key={d.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #eee", fontSize: 14 }}>
                  <span>{ymd}{d.label ? ` ・ ${d.label}` : ""}</span>
                  {includesEvent && place ? (
                    <a href={`/places/${place.slug}?date=${ymd}`} style={linkBtn}>このイベント日に予約する</a>
                  ) : (
                    <span style={{ color: "#aaa", fontSize: 13 }}>駐車不可</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* 予約・領収書 */}
      <section style={cardBox}>
        <h2 style={h2}>ご予約・領収書</h2>
        {reservations.length === 0 ? (
          <p style={{ fontSize: 14, color: "#666" }}>イベント日のご予約はまだありません。</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "#666" }}>
                <th style={{ padding: "6px 8px" }}>利用日</th>
                <th style={{ padding: "6px 8px" }}>区画</th>
                <th style={{ padding: "6px 8px" }}>金額</th>
                <th style={{ padding: "6px 8px" }}>領収書</th>
              </tr>
            </thead>
            <tbody>
              {reservations.map((r) => (
                <tr key={r.id} style={{ borderTop: "1px solid #eee" }}>
                  <td style={{ padding: "8px" }}>{r.date}</td>
                  <td style={{ padding: "8px" }}>{r.slot}</td>
                  <td style={{ padding: "8px" }}>¥{r.price.toLocaleString()}</td>
                  <td style={{ padding: "8px" }}>
                    {r.paid ? <a href={`/receipt/request?reservationId=${r.id}`} style={linkBtn}>発行</a> : <span style={{ color: "#aaa" }}>未払い</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section style={cardBox}>
        <h2 style={h2}>パスワード変更</h2>
        <PasswordChange />
      </section>
    </main>
  );
}

const wrap: React.CSSProperties = { padding: 24, maxWidth: 760, margin: "0 auto" };
const cardBox: React.CSSProperties = { marginTop: 20, background: "#fff", border: "1px solid #eee", borderRadius: 12, padding: 20 };
const h2: React.CSSProperties = { fontSize: 16, fontWeight: 700, marginTop: 0, marginBottom: 10 };
const linkBtn: React.CSSProperties = { fontSize: 13, color: "#fff", background: "#111", padding: "6px 12px", borderRadius: 6, textDecoration: "none", whiteSpace: "nowrap" };
