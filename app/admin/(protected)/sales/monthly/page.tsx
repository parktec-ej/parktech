import type { CSSProperties } from "react";
import Link from "next/link";
import { prisma } from "@/lib/db";

const MIN_PLATFORM_FEE_YEN = 300;

function ymTodayJst() {
  const d = new Date();
  const y = d.toLocaleDateString("sv-SE", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
  });
  const m = d.toLocaleDateString("sv-SE", {
    timeZone: "Asia/Tokyo",
    month: "2-digit",
  });
  return `${y}-${m}`;
}

function fmtYen(v: number) {
  return `${v.toLocaleString("ja-JP")} 円`;
}

function fmtSignedYen(v: number) {
  if (v > 0) return `+${v.toLocaleString("ja-JP")} 円`;
  if (v < 0) return `-${Math.abs(v).toLocaleString("ja-JP")} 円`;
  return `0 円`;
}

function fmtJstDateTime(d: Date | null | undefined) {
  if (!d) return "-";
  return new Date(d).toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
  });
}

function fmtJstDate(d: Date | null | undefined) {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("sv-SE", {
    timeZone: "Asia/Tokyo",
  });
}

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

type DayRow = {
  date: string;
  reservationSales: number;
  hourlySales: number;
  grossSales: number;
  refundAmount: number;
  netSales: number;
  reservationCount: number;
  hourlyCount: number;
  adjustmentCount: number;
  ownerAmount: number;
  ownerDeltaAmount: number;
  ownerNetAmount: number;
  agentAmount: number;
  agentDeltaAmount: number;
  agentNetAmount: number;
  platformAmount: number;
  platformDeltaAmount: number;
  platformNetAmount: number;
};

export default async function AdminMonthlySalesPage({
  searchParams,
}: {
  searchParams?: Promise<{ month?: string; placeId?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const month =
    sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : ymTodayJst();
  const placeKey = String(sp.placeId ?? "").trim();

  const activePlaces = await prisma.place.findMany({
    where: { isActive: true },
    orderBy: [{ createdAt: "desc" }],
    select: {
      id: true,
      slug: true,
      name: true,
      address: true,
      ownerId: true,
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
            ownerId: true,
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
        ownerId: true,
      },
    })) ??
    (await prisma.place.findFirst({
      where: { isActive: true },
      select: {
        id: true,
        slug: true,
        name: true,
        address: true,
        ownerId: true,
      },
    }));

  if (!place) {
    return (
      <main style={pageStyle}>
        <h1 style={titleStyle}>月間売上</h1>
        <div style={cardStyle}>利用可能な Place が見つかりません。</div>
      </main>
    );
  }

  const settlement = place.ownerId
    ? await prisma.settlement.findFirst({
        where: {
          month,
          ownerId: place.ownerId,
          placeId: place.id,
          status: {
            not: "CANCELLED",
          },
        },
        select: {
          id: true,
          status: true,
          createdAt: true,
          lockedAt: true,
          approvedAt: true,
          paidAt: true,
          paymentCount: true,
          adjustmentCount: true,
          totalGrossAmount: true,
          totalOwnerAmount: true,
          totalAgentAmount: true,
          totalPlatformAmount: true,
          monthlyMinFeeAdjustment: true,
          finalOwnerPayoutAmount: true,
          finalAgentPayoutAmount: true,
        },
        orderBy: { createdAt: "desc" },
      })
    : null;

  const payments = await prisma.payment.findMany({
    where: {
      placeId: place.id,
      recognizedMonth: month,
      status: settlement ? { in: ["CONFIRMED", "SETTLED", "REFUNDED"] } : { in: ["CONFIRMED", "SETTLED", "REFUNDED"] },
      excludedFromSettlement: false,
    },
    select: {
      id: true,
      kind: true,
      recognizedDate: true,
      serviceDate: true,
      grossAmount: true,
      ownerAmount: true,
      agentAmount: true,
      platformAmount: true,
      createdAt: true,
      refunded: true,
    },
    orderBy: [{ recognizedDate: "asc" }, { createdAt: "asc" }],
  });

  const adjustments = await prisma.adjustment.findMany({
    where: {
      recognizedMonth: month,
      status: settlement ? { in: ["CONFIRMED", "SETTLED"] } : { in: ["CONFIRMED", "SETTLED"] },
      payment: {
        placeId: place.id,
      },
    },
    select: {
      id: true,
      kind: true,
      reason: true,
      note: true,
      recognizedDate: true,
      grossDeltaAmount: true,
      ownerDeltaAmount: true,
      agentDeltaAmount: true,
      platformDeltaAmount: true,
      createdAt: true,
      payment: {
        select: {
          paymentRef: true,
          customerNameSnapshot: true,
          plateSnapshot: true,
        },
      },
    },
    orderBy: [{ recognizedDate: "asc" }, { createdAt: "asc" }],
  });

  const ownerMonthPayments = place.ownerId
    ? await prisma.payment.findMany({
        where: {
          ownerId: place.ownerId,
          recognizedMonth: month,
          status: settlement ? { in: ["CONFIRMED", "SETTLED", "REFUNDED"] } : { in: ["CONFIRMED", "SETTLED", "REFUNDED"] },
          excludedFromSettlement: false,
        },
        select: {
          platformAmount: true,
        },
      })
    : [];

  const ownerMonthAdjustments = place.ownerId
    ? await prisma.adjustment.findMany({
        where: {
          recognizedMonth: month,
          status: { in: ["CONFIRMED", "SETTLED"] },
          payment: {
            ownerId: place.ownerId,
          },
        },
        select: {
          platformDeltaAmount: true,
        },
      })
    : [];

  const ownerMonthPlatformRaw =
    ownerMonthPayments.reduce((sum, p) => sum + p.platformAmount, 0) +
    ownerMonthAdjustments.reduce((sum, a) => sum + a.platformDeltaAmount, 0);

  const monthlyMinFeeAdjustment =
    settlement?.monthlyMinFeeAdjustment ??
    (ownerMonthPayments.length > 0 && ownerMonthPlatformRaw < MIN_PLATFORM_FEE_YEN
      ? MIN_PLATFORM_FEE_YEN - ownerMonthPlatformRaw
      : 0);

  const map = new Map<string, DayRow>();

  function ensure(date: string) {
    if (!map.has(date)) {
      map.set(date, {
        date,
        reservationSales: 0,
        hourlySales: 0,
        grossSales: 0,
        refundAmount: 0,
        netSales: 0,
        reservationCount: 0,
        hourlyCount: 0,
        adjustmentCount: 0,
        ownerAmount: 0,
        ownerDeltaAmount: 0,
        ownerNetAmount: 0,
        agentAmount: 0,
        agentDeltaAmount: 0,
        agentNetAmount: 0,
        platformAmount: 0,
        platformDeltaAmount: 0,
        platformNetAmount: 0,
      });
    }
    return map.get(date)!;
  }

  for (const p of payments) {
    const date =
      p.kind === "RESERVATION" && p.serviceDate
        ? p.serviceDate
        : fmtJstDate(p.recognizedDate);

    const row = ensure(date);

    if (p.kind === "RESERVATION") {
      row.reservationSales += p.grossAmount;
      row.reservationCount += 1;
    } else {
      row.hourlySales += p.grossAmount;
      row.hourlyCount += 1;
    }

    row.grossSales += p.grossAmount;
    row.ownerAmount += p.ownerAmount;
    row.agentAmount += p.agentAmount;
    row.platformAmount += p.platformAmount;
  }

  for (const a of adjustments) {
    const date = fmtJstDate(a.recognizedDate);
    const row = ensure(date);

    row.adjustmentCount += 1;
    row.refundAmount += Math.abs(a.grossDeltaAmount);
    row.ownerDeltaAmount += a.ownerDeltaAmount;
    row.agentDeltaAmount += a.agentDeltaAmount;
    row.platformDeltaAmount += a.platformDeltaAmount;
  }

  for (const row of map.values()) {
    row.netSales = row.grossSales - row.refundAmount;
    row.ownerNetAmount = row.ownerAmount + row.ownerDeltaAmount;
    row.agentNetAmount = row.agentAmount + row.agentDeltaAmount;
    row.platformNetAmount = row.platformAmount + row.platformDeltaAmount;
  }

  const rows = Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));

  const reservationSales = rows.reduce((s, r) => s + r.reservationSales, 0);
  const hourlySales = rows.reduce((s, r) => s + r.hourlySales, 0);
  const grossSales = rows.reduce((s, r) => s + r.grossSales, 0);
  const refundTotal = rows.reduce((s, r) => s + r.refundAmount, 0);
  const netSales = rows.reduce((s, r) => s + r.netSales, 0);

  const reservationCount = rows.reduce((s, r) => s + r.reservationCount, 0);
  const hourlyCount = rows.reduce((s, r) => s + r.hourlyCount, 0);
  const adjustmentCount = rows.reduce((s, r) => s + r.adjustmentCount, 0);

  const totalOwnerRaw = rows.reduce((s, r) => s + r.ownerAmount, 0);
  const totalOwnerDelta = rows.reduce((s, r) => s + r.ownerDeltaAmount, 0);
  const totalOwnerNetBeforeMinFee = totalOwnerRaw + totalOwnerDelta;

  const totalAgentRaw = rows.reduce((s, r) => s + r.agentAmount, 0);
  const totalAgentDelta = rows.reduce((s, r) => s + r.agentDeltaAmount, 0);
  const totalAgentNet = totalAgentRaw + totalAgentDelta;

  const totalPlatformRaw = rows.reduce((s, r) => s + r.platformAmount, 0);
  const totalPlatformDelta = rows.reduce((s, r) => s + r.platformDeltaAmount, 0);
  const totalPlatformNetBeforeMinFee = totalPlatformRaw + totalPlatformDelta;

  const totalOwnerFinal =
    settlement?.finalOwnerPayoutAmount ??
    Math.max(0, totalOwnerNetBeforeMinFee - monthlyMinFeeAdjustment);

  const totalPlatformFinal =
    settlement?.totalPlatformAmount != null
      ? settlement.totalPlatformAmount + settlement.monthlyMinFeeAdjustment + totalPlatformDelta
      : totalPlatformNetBeforeMinFee + monthlyMinFeeAdjustment;

  const isSettledMonth = Boolean(settlement);
  const isPaidMonth = settlement?.status === "PAID";

  const recentAdjustments = adjustments
    .slice()
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 20);

  return (
    <main style={pageStyle}>
      <div style={heroStyle}>
        <div>
          <h1 style={titleStyle}>月間売上</h1>
          <div style={subStyle}>
            <div>対象 Place: {place.name}</div>
            <div>対象月: {month}</div>
            <div>住所: {place.address || "未設定"}</div>
          </div>
        </div>

        <form method="get" style={cardStyle}>
          <div style={fieldStyle}>
            <div style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>対象 Place</div>
            <select name="placeId" defaultValue={place.id} style={inputStyle}>
              {activePlaces.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.slug})
                </option>
              ))}
            </select>
          </div>

          <div style={{ ...fieldStyle, marginTop: 10 }}>
            <div style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>対象月</div>
            <input type="month" name="month" defaultValue={month} style={inputStyle} />
          </div>

          <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="submit" style={primaryButtonStyle}>
              表示
            </button>
            <Link
              href={buildUrl("/admin/sales/monthly-csv", {
                placeId: place.id,
                month,
              })}
              style={secondaryLinkStyle}
            >
              CSV出力
            </Link>
          </div>
        </form>
      </div>

      {isSettledMonth && settlement && (
        <section
          style={{
            ...cardStyle,
            marginTop: 20,
            border: "1px solid #bbf7d0",
            background: "#f0fdf4",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 16,
              flexWrap: "wrap",
              alignItems: "flex-start",
            }}
          >
            <div>
              <div style={{ fontSize: 20, fontWeight: 900, color: "#166534", marginBottom: 8 }}>
                {isPaidMonth ? "締め済み・送金済み" : "締め済み"}
              </div>
              <div style={{ color: "#166534", lineHeight: 1.8, fontSize: 14 }}>
                <div>Settlement ID: {settlement.id}</div>
                <div>状態: {settlement.status}</div>
                <div>締め件数: {settlement.paymentCount} 件</div>
                <div>調整件数: {settlement.adjustmentCount} 件</div>
                <div>締め作成日時: {fmtJstDateTime(settlement.createdAt)}</div>
                <div>LOCK日時: {fmtJstDateTime(settlement.lockedAt)}</div>
                <div>送金日時: {fmtJstDateTime(settlement.paidAt)}</div>
              </div>
            </div>

            <div style={{ minWidth: 280 }}>
              <div style={{ fontSize: 13, color: "#166534", marginBottom: 8 }}>
                確定済み金額の見方
              </div>
              <div style={{ fontSize: 14, color: "#166534", lineHeight: 1.8 }}>
                <div>売上総額: {fmtYen(settlement.totalGrossAmount)}</div>
                <div>返金総額: {fmtYen(refundTotal)}</div>
                <div>純売上: {fmtYen(netSales)}</div>
                <div>最低利用料調整: {fmtYen(settlement.monthlyMinFeeAdjustment)}</div>
                <div>オーナー振込予定: {fmtYen(settlement.finalOwnerPayoutAmount)}</div>
                <div>代理店振込予定: {fmtYen(settlement.finalAgentPayoutAmount)}</div>
              </div>

              <div style={{ marginTop: 12 }}>
                <Link
                  href={buildUrl("/admin/settlements", {
                    placeId: place.id,
                    month,
                  })}
                  style={settlementLinkStyle}
                >
                  月次締め画面を開く
                </Link>
              </div>
            </div>
          </div>
        </section>
      )}

      <div style={summaryGridStyle}>
        <SummaryCard
          title="月間総売上"
          value={fmtYen(grossSales)}
          sub={`予約 ${fmtYen(reservationSales)} / 時間貸し ${fmtYen(hourlySales)}`}
        />
        <SummaryCard
          title="返金総額"
          value={fmtYen(refundTotal)}
          sub={`Adjustment ${adjustmentCount} 件`}
        />
        <SummaryCard
          title="純売上"
          value={fmtYen(netSales)}
          sub={`総売上 - 返金`}
          strong
        />
        <SummaryCard
          title="オーナー取り分"
          value={fmtYen(totalOwnerFinal)}
          sub={
            monthlyMinFeeAdjustment > 0
              ? `調整前 ${fmtYen(totalOwnerNetBeforeMinFee)} / 最低利用料 -${fmtYen(monthlyMinFeeAdjustment)}`
              : `純取り分 ${fmtYen(totalOwnerNetBeforeMinFee)}`
          }
        />
        <SummaryCard
          title="本部取り分"
          value={fmtYen(totalPlatformFinal)}
          sub={
            monthlyMinFeeAdjustment > 0
              ? `調整前 ${fmtYen(totalPlatformNetBeforeMinFee)} / 最低利用料 +${fmtYen(monthlyMinFeeAdjustment)}`
              : `代理店 ${fmtYen(totalAgentNet)}`
          }
        />
        <SummaryCard
          title="合計件数"
          value={String(reservationCount + hourlyCount)}
          sub={`予約 ${reservationCount} / 時間貸し ${hourlyCount}`}
        />
      </div>

      <section style={{ ...cardStyle, marginTop: 16 }}>
        <h2 style={sectionTitleStyle}>返金・純売上サマリー</h2>
        <div style={{ fontSize: 14, color: "#444", lineHeight: 1.9 }}>
          <div>売上総額: {fmtYen(grossSales)}</div>
          <div>返金総額: {fmtYen(refundTotal)}</div>
          <div>純売上: {fmtYen(netSales)}</div>
          <div>オーナー差額: {fmtSignedYen(totalOwnerDelta)}</div>
          <div>代理店差額: {fmtSignedYen(totalAgentDelta)}</div>
          <div>本部差額: {fmtSignedYen(totalPlatformDelta)}</div>
        </div>
      </section>

      <section style={{ ...cardStyle, marginTop: 16 }}>
        <h2 style={sectionTitleStyle}>最低利用料300円ルール</h2>
        <div style={{ fontSize: 14, color: "#444", lineHeight: 1.8 }}>
          <div>本部取り分（売上ベース）: {fmtYen(totalPlatformRaw)}</div>
          <div>本部差額（返金反映）: {fmtSignedYen(totalPlatformDelta)}</div>
          <div>本部取り分（返金反映後）: {fmtYen(totalPlatformNetBeforeMinFee)}</div>
          <div>最低利用料基準: {fmtYen(MIN_PLATFORM_FEE_YEN)}</div>
          <div>最低利用料調整額: {fmtYen(monthlyMinFeeAdjustment)}</div>
          <div>本部取り分（調整後）: {fmtYen(totalPlatformFinal)}</div>
          <div>オーナー取り分（調整後）: {fmtYen(totalOwnerFinal)}</div>
        </div>
      </section>

      <section style={{ ...cardStyle, marginTop: 24 }}>
        <h2 style={sectionTitleStyle}>日別明細</h2>

        {rows.length === 0 ? (
          <div style={{ color: "#666" }}>この月の売上はありません。</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>日付</th>
                  <th style={thStyle}>予約売上</th>
                  <th style={thStyle}>時間貸し売上</th>
                  <th style={thStyle}>返金</th>
                  <th style={thStyle}>純売上</th>
                  <th style={thStyle}>オーナー純額</th>
                  <th style={thStyle}>代理店純額</th>
                  <th style={thStyle}>本部純額</th>
                  <th style={thStyle}>予約件数</th>
                  <th style={thStyle}>時間貸し件数</th>
                  <th style={thStyle}>調整件数</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.date}>
                    <td style={tdStyle}>{row.date}</td>
                    <td style={tdStyle}>{fmtYen(row.reservationSales)}</td>
                    <td style={tdStyle}>{fmtYen(row.hourlySales)}</td>
                    <td style={tdStyle}>{fmtYen(row.refundAmount)}</td>
                    <td style={{ ...tdStyle, fontWeight: 800 }}>{fmtYen(row.netSales)}</td>
                    <td style={tdStyle}>{fmtYen(row.ownerNetAmount)}</td>
                    <td style={tdStyle}>{fmtYen(row.agentNetAmount)}</td>
                    <td style={tdStyle}>{fmtYen(row.platformNetAmount)}</td>
                    <td style={tdStyle}>{row.reservationCount}</td>
                    <td style={tdStyle}>{row.hourlyCount}</td>
                    <td style={tdStyle}>{row.adjustmentCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section style={{ ...cardStyle, marginTop: 24 }}>
        <h2 style={sectionTitleStyle}>最近の返金 / 調整</h2>

        {recentAdjustments.length === 0 ? (
          <div style={{ color: "#666" }}>この月の返金・調整はありません。</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>日時</th>
                  <th style={thStyle}>種別</th>
                  <th style={thStyle}>理由</th>
                  <th style={thStyle}>返金額</th>
                  <th style={thStyle}>オーナー差額</th>
                  <th style={thStyle}>代理店差額</th>
                  <th style={thStyle}>本部差額</th>
                  <th style={thStyle}>メモ</th>
                </tr>
              </thead>
              <tbody>
                {recentAdjustments.map((row) => (
                  <tr key={row.id}>
                    <td style={tdStyle}>{fmtJstDateTime(row.createdAt)}</td>
                    <td style={tdStyle}>{row.kind}</td>
                    <td style={tdStyle}>{row.reason}</td>
                    <td style={tdStyle}>{fmtSignedYen(row.grossDeltaAmount)}</td>
                    <td style={tdStyle}>{fmtSignedYen(row.ownerDeltaAmount)}</td>
                    <td style={tdStyle}>{fmtSignedYen(row.agentDeltaAmount)}</td>
                    <td style={tdStyle}>{fmtSignedYen(row.platformDeltaAmount)}</td>
                    <td style={{ ...tdStyle, whiteSpace: "pre-wrap", minWidth: 240 }}>
                      {row.note || "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

function SummaryCard({
  title,
  value,
  sub,
  strong = false,
}: {
  title: string;
  value: string;
  sub: string;
  strong?: boolean;
}) {
  return (
    <div style={summaryCardStyle}>
      <div style={{ fontSize: 14, color: "#666", marginBottom: 8 }}>{title}</div>
      <div
        style={{
          fontSize: 28,
          fontWeight: 900,
          marginBottom: 8,
          color: strong ? "#111827" : undefined,
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 13, color: "#777", lineHeight: 1.6 }}>{sub}</div>
    </div>
  );
}

const pageStyle: CSSProperties = {
  maxWidth: 1080,
  margin: "0 auto",
  padding: 24,
};

const heroStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 16,
  flexWrap: "wrap",
  alignItems: "flex-start",
};

const titleStyle: CSSProperties = {
  fontSize: 32,
  fontWeight: 900,
  marginBottom: 8,
};

const subStyle: CSSProperties = {
  color: "#666",
  lineHeight: 1.8,
};

const fieldStyle: CSSProperties = {
  minWidth: 240,
};

const cardStyle: CSSProperties = {
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 16,
  padding: 16,
};

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #d1d5db",
  fontSize: 14,
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

const secondaryLinkStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 10,
  padding: "10px 14px",
  background: "#f3f4f6",
  color: "#111827",
  fontWeight: 700,
  textDecoration: "none",
};

const settlementLinkStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 10,
  padding: "10px 14px",
  background: "#166534",
  color: "#fff",
  fontWeight: 700,
  textDecoration: "none",
};

const summaryGridStyle: CSSProperties = {
  marginTop: 24,
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