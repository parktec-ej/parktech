import type { CSSProperties } from "react";
import { prisma } from "@/lib/db";
import DateSwitcher from "../DateSwitcher";

function ymdTodayJst() {
  return new Date().toLocaleDateString("sv-SE", {
    timeZone: "Asia/Tokyo",
  });
}

function fmtYen(v: number) {
  return `${v.toLocaleString("ja-JP")} 円`;
}

type ActivePlaceItem = {
  id: string;
  slug: string;
  name: string;
  address: string | null;
};

type PaymentItem = {
  kind: "RESERVATION" | "HOURLY" | "EVENT";
  grossAmount: number;
  confirmedAt: Date | null;
  recognizedDate: Date;
  customerNameSnapshot: string | null;
  plateSnapshot: string | null;
  spotCodeSnapshot: string | null;
  spotLabelSnapshot: string | null;
  checkedOutAt: Date | null;
  serviceDate: string | null;
};

type SalesRow = {
  kind: "RESERVATION" | "HOURLY" | "EVENT";
  label: string;
  customer: string;
  date: string;
  amount: number;
  paidAt: string | null;
  status: string;
};

function buildUrl(
  pathname: string,
  params?: Record<string, string | undefined | null>
) {
  const qs = new URLSearchParams();
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v) qs.set(k, v);
    });
  }
  const s = qs.toString();
  return s ? `${pathname}?${s}` : pathname;
}

export default async function AdminSalesPage({
  searchParams,
}: {
  searchParams?: Promise<{ date?: string; placeId?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const selectedDate =
    sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : ymdTodayJst();
  const placeKey = String(sp.placeId ?? "").trim();

  const activePlaces: ActivePlaceItem[] = await prisma.place.findMany({
    where: { isActive: true },
    orderBy: [{ createdAt: "desc" }],
    select: {
      id: true,
      slug: true,
      name: true,
      address: true,
    },
  });

  const place =
    (placeKey
      ? await prisma.place.findFirst({
          where: {
            isActive: true,
            OR: [{ id: placeKey }, { slug: placeKey }],
          },
          select: {
            id: true,
            slug: true,
            name: true,
            address: true,
          },
        })
      : null) ??
    (await prisma.place.findFirst({
      where: { slug: "rifu-main", isActive: true },
      select: {
        id: true,
        slug: true,
        name: true,
        address: true,
      },
    })) ??
    (await prisma.place.findFirst({
      where: { isActive: true },
      select: {
        id: true,
        slug: true,
        name: true,
        address: true,
      },
    }));

  if (!place) {
    return (
      <main style={pageStyle}>
        <h1 style={pageTitleStyle}>売上一覧</h1>
        <div style={cardStyle}>利用可能な Place が見つかりません。</div>
      </main>
    );
  }

  const payments: PaymentItem[] = await prisma.payment.findMany({
    where: {
      placeId: place.id,
      recognizedDate: {
        gte: new Date(`${selectedDate}T00:00:00+09:00`),
        lt: new Date(
          new Date(`${selectedDate}T00:00:00+09:00`).getTime() +
            24 * 60 * 60 * 1000
        ),
      },
      status: "CONFIRMED",
      excludedFromSettlement: false,
    },
    select: {
      kind: true,
      grossAmount: true,
      confirmedAt: true,
      recognizedDate: true,
      customerNameSnapshot: true,
      plateSnapshot: true,
      spotCodeSnapshot: true,
      spotLabelSnapshot: true,
      checkedOutAt: true,
      serviceDate: true,
    },
    orderBy: {
      confirmedAt: "desc",
    },
  });

  const allRows: SalesRow[] = payments.map((p: PaymentItem) => ({
    kind: p.kind,
    label: p.spotLabelSnapshot || p.spotCodeSnapshot || "-",
    customer:
      p.kind === "RESERVATION"
        ? p.customerNameSnapshot || "-"
        : p.plateSnapshot || "-",
    date:
      p.serviceDate ||
      p.recognizedDate.toLocaleDateString("sv-SE", {
        timeZone: "Asia/Tokyo",
      }),
    amount: p.grossAmount || 0,
    paidAt: p.confirmedAt ? p.confirmedAt.toISOString() : null,
    status:
      p.kind === "RESERVATION"
        ? "CONFIRMED"
        : p.checkedOutAt
        ? "OUT"
        : "CONFIRMED",
  }));

  const reservationRows = allRows.filter(
    (r: SalesRow) => r.kind === "RESERVATION"
  );
  const hourlyRows = allRows.filter((r: SalesRow) => r.kind === "HOURLY");
  const eventRows = allRows.filter((r: SalesRow) => r.kind === "EVENT");

  const reservationSales = reservationRows.reduce(
    (sum: number, row: SalesRow) => sum + row.amount,
    0
  );
  const hourlySales = hourlyRows.reduce(
    (sum: number, row: SalesRow) => sum + row.amount,
    0
  );
  const eventSales = eventRows.reduce(
    (sum: number, row: SalesRow) => sum + row.amount,
    0
  );
  const totalSales = reservationSales + hourlySales + eventSales;

  return (
    <main style={pageStyle}>
      <div style={heroStyle}>
        <div>
          <h1 style={pageTitleStyle}>売上一覧</h1>
          <div style={subTextStyle}>
            <div>対象 Place: {place.name}</div>
            <div>住所: {place.address || "未設定"}</div>
          </div>
        </div>

        <div style={heroBoxStyle}>
          <div style={heroLabelStyle}>対象日</div>
          <div style={heroValueStyle}>{selectedDate}</div>
        </div>
      </div>

      <section style={{ ...cardStyle, marginBottom: 20 }}>
        <form method="GET" style={toolbarStyle}>
          <div style={fieldStyle}>
            <div style={fieldLabelStyle}>対象 Place</div>
            <select name="placeId" defaultValue={place.id} style={inputStyle}>
              {activePlaces.map((p: ActivePlaceItem) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.slug})
                </option>
              ))}
            </select>
          </div>

          <div style={fieldStyle}>
            <div style={fieldLabelStyle}>日付</div>
            <input
              type="date"
              name="date"
              defaultValue={selectedDate}
              style={inputStyle}
            />
          </div>

          <button type="submit" style={primaryButtonStyle}>
            表示
          </button>
        </form>

        <div style={{ marginTop: 14 }}>
          <DateSwitcher value={selectedDate} />
        </div>
      </section>

      <div style={summaryGridStyle}>
        <SummaryCard
          title="合計売上"
          value={fmtYen(totalSales)}
          sub={`予約 ${fmtYen(reservationSales)} / 時間貸し ${fmtYen(
            hourlySales
          )} / イベント ${fmtYen(eventSales)}`}
        />
        <SummaryCard
          title="予約売上"
          value={fmtYen(reservationSales)}
          sub={`件数 ${reservationRows.length} 件`}
        />
        <SummaryCard
          title="時間貸し売上"
          value={fmtYen(hourlySales)}
          sub={`件数 ${hourlyRows.length} 件`}
        />
        <SummaryCard
          title="売上件数"
          value={String(allRows.length)}
          sub="Paymentベース"
        />
      </div>

      <section style={{ ...cardStyle, marginTop: 24 }}>
        <h2 style={sectionTitleStyle}>売上明細</h2>

        {allRows.length === 0 ? (
          <div style={{ color: "#666" }}>この日の売上はありません。</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>区分</th>
                  <th style={thStyle}>区画</th>
                  <th style={thStyle}>利用者</th>
                  <th style={thStyle}>日付</th>
                  <th style={thStyle}>金額</th>
                  <th style={thStyle}>確定時刻</th>
                  <th style={thStyle}>状態</th>
                </tr>
              </thead>
              <tbody>
                {allRows.map((row: SalesRow, idx: number) => (
                  <tr key={`${row.kind}-${idx}`}>
                    <td style={tdStyle}>
                      {row.kind === "RESERVATION"
                        ? "予約"
                        : row.kind === "HOURLY"
                        ? "時間貸し"
                        : "イベント"}
                    </td>
                    <td style={tdStyle}>{row.label}</td>
                    <td style={tdStyle}>{row.customer}</td>
                    <td style={tdStyle}>{row.date}</td>
                    <td style={tdStyle}>{fmtYen(row.amount)}</td>
                    <td style={tdStyle}>
                      {row.paidAt
                        ? new Date(row.paidAt).toLocaleString("ja-JP", {
                            timeZone: "Asia/Tokyo",
                          })
                        : "-"}
                    </td>
                    <td style={tdStyle}>{row.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section style={{ ...cardStyle, marginTop: 20 }}>
        <h2 style={sectionTitleStyle}>関連画面</h2>
        <div style={linkGridStyle}>
          <a
            href={buildUrl("/admin/sales/monthly", {
              placeId: place.id,
              month: selectedDate.slice(0, 7),
            })}
            style={navLinkStyle}
          >
            月間売上を見る
          </a>
          <a
            href={buildUrl("/admin/settlements", {
              placeId: place.id,
              month: selectedDate.slice(0, 7),
            })}
            style={navLinkStyle}
          >
            月次締めを見る
          </a>
        </div>
      </section>
    </main>
  );
}

function SummaryCard({
  title,
  value,
  sub,
}: {
  title: string;
  value: string;
  sub: string;
}) {
  return (
    <div style={summaryCardStyle}>
      <div style={{ fontSize: 14, color: "#666", marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 28, fontWeight: 900, marginBottom: 8 }}>{value}</div>
      <div style={{ fontSize: 13, color: "#777", lineHeight: 1.6 }}>{sub}</div>
    </div>
  );
}

const pageStyle: CSSProperties = {
  maxWidth: 1080,
  margin: "0 auto",
  padding: "24px 16px 56px",
};

const heroStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 16,
  alignItems: "stretch",
  marginBottom: 20,
  flexWrap: "wrap",
};

const pageTitleStyle: CSSProperties = {
  fontSize: 32,
  fontWeight: 900,
  margin: 0,
};

const subTextStyle: CSSProperties = {
  color: "#666",
  lineHeight: 1.8,
  marginTop: 8,
};

const heroBoxStyle: CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 16,
  background: "#fff",
  padding: "16px 18px",
  minWidth: 220,
};

const heroLabelStyle: CSSProperties = {
  fontSize: 13,
  color: "#666",
  marginBottom: 6,
};

const heroValueStyle: CSSProperties = {
  fontSize: 28,
  fontWeight: 900,
};

const cardStyle: CSSProperties = {
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 16,
  padding: 16,
};

const toolbarStyle: CSSProperties = {
  display: "flex",
  gap: 12,
  flexWrap: "wrap",
  alignItems: "end",
};

const fieldStyle: CSSProperties = {
  display: "grid",
  gap: 6,
  minWidth: 220,
};

const fieldLabelStyle: CSSProperties = {
  fontSize: 12,
  color: "#666",
  fontWeight: 700,
};

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #d1d5db",
  fontSize: 14,
  background: "#fff",
};

const primaryButtonStyle: CSSProperties = {
  appearance: "none",
  border: "none",
  borderRadius: 10,
  padding: "10px 14px",
  background: "#111827",
  color: "#fff",
  fontWeight: 700,
  cursor: "pointer",
};

const summaryGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 16,
};

const summaryCardStyle: CSSProperties = {
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 16,
  padding: 18,
};

const sectionTitleStyle: CSSProperties = {
  fontSize: 20,
  fontWeight: 900,
  marginBottom: 16,
};

const tableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
};

const thStyle: CSSProperties = {
  textAlign: "left",
  fontSize: 13,
  color: "#666",
  borderBottom: "1px solid #e5e7eb",
  padding: "10px 12px",
  whiteSpace: "nowrap",
};

const tdStyle: CSSProperties = {
  fontSize: 14,
  borderBottom: "1px solid #f1f5f9",
  padding: "12px",
  whiteSpace: "nowrap",
};

const linkGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const navLinkStyle: CSSProperties = {
  display: "block",
  textDecoration: "none",
  color: "#111",
  padding: "12px 14px",
  borderRadius: 12,
  border: "1px solid #e5e7eb",
  background: "#fff",
  fontWeight: 800,
};