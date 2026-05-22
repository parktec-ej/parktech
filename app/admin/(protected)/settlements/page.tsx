import Link from "next/link";
import { redirect } from "next/navigation";
import type { CSSProperties } from "react";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";

type SearchParams = Promise<{
  placeId?: string;
  month?: string;
  created?: string;
  exists?: string;
  empty?: string;
  id?: string;
}>;

const MIN_PLATFORM_FEE_YEN = 300;

function ymNowJst() {
  const now = new Date();
  const y = now.toLocaleDateString("sv-SE", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
  });
  const m = now.toLocaleDateString("sv-SE", {
    timeZone: "Asia/Tokyo",
    month: "2-digit",
  });
  return `${y}-${m}`;
}

function normalizeMonth(value?: string) {
  if (value && /^\d{4}-\d{2}$/.test(value)) return value;
  return ymNowJst();
}

function fmtYen(value?: number | null) {
  return `${(value ?? 0).toLocaleString("ja-JP")}円`;
}

function fmtSignedYen(value?: number | null) {
  const v = value ?? 0;
  if (v > 0) return `+${v.toLocaleString("ja-JP")}円`;
  if (v < 0) return `-${Math.abs(v).toLocaleString("ja-JP")}円`;
  return "0円";
}

function fmtDateTime(value?: Date | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

function fmtDate(value?: Date | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

function buildUrl(
  pathname: string,
  params: Record<string, string | undefined | null>
) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) qs.set(key, value);
  });
  const query = qs.toString();
  return query ? `${pathname}?${query}` : pathname;
}

function statusLabel(status: string) {
  switch (status) {
    case "DRAFT":
      return "下書き";
    case "APPROVED":
      return "承認済み";
    case "LOCKED":
      return "締め済み";
    case "PAID":
      return "送金済み";
    case "CANCELLED":
      return "取消";
    default:
      return status;
  }
}

function statusBadgeStyle(status: string): CSSProperties {
  switch (status) {
    case "PAID":
      return {
        ...badgeBaseStyle,
        background: "#ecfdf5",
        borderColor: "#a7f3d0",
        color: "#065f46",
      };
    case "LOCKED":
    case "APPROVED":
      return {
        ...badgeBaseStyle,
        background: "#eff6ff",
        borderColor: "#bfdbfe",
        color: "#1d4ed8",
      };
    case "CANCELLED":
      return {
        ...badgeBaseStyle,
        background: "#f3f4f6",
        borderColor: "#d1d5db",
        color: "#374151",
      };
    default:
      return {
        ...badgeBaseStyle,
        background: "#fffbeb",
        borderColor: "#fde68a",
        color: "#92400e",
      };
  }
}

export default async function SettlementsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireAdmin();

  const params = await searchParams;
  const month = normalizeMonth(params.month);

  const places = await prisma.place.findMany({
  where: { isActive: true },
  select: {
    id: true,
    name: true,
    slug: true,
    address: true,
    ownerId: true,
    owner: {
      select: {
        id: true,
        name: true,
        displayName: true,
      },
    },
  },
  orderBy: [{ createdAt: "asc" }],
});

  if (places.length === 0) {
    return (
      <main style={pageStyle}>
        <h1 style={titleStyle}>月次締め</h1>
        <div style={emptyCardStyle}>Placeがありません。先にPlaceを作成してください。</div>
      </main>
    );
  }

  const selectedPlace = places.find((p) => p.id === params.placeId) ?? places[0];

  if (!selectedPlace) {
    redirect("/admin");
  }

 const settlements = await prisma.settlement.findMany({
  where: {
    placeId: selectedPlace.id,
    month,
    status: {
      not: "CANCELLED",
    },
  },
  include: {
    Owner: {
      select: {
        id: true,
        name: true,
        displayName: true,
      },
    },
    Agent: {
      select: {
        name: true,
        displayName: true,
      },
    },
    Place: {
      select: {
        id: true,
        slug: true,
        name: true,
        address: true,
      },
    },
  },
  orderBy: [{ createdAt: "desc" }],
});

  const latestSettlement = settlements[0] ?? null;
  const hasSettlement = settlements.length > 0;

  const payments = await prisma.payment.findMany({
    where: {
      placeId: selectedPlace.id,
      recognizedMonth: month,
      status: hasSettlement ? { in: ["CONFIRMED", "REFUNDED", "SETTLED"] } : { in: ["CONFIRMED", "REFUNDED", "SETTLED"] },
      excludedFromSettlement: false,
    },
    select: {
      id: true,
      kind: true,
      status: true,
      recognizedDate: true,
      createdAt: true,
      serviceDate: true,
      paymentRef: true,
      customerNameSnapshot: true,
      plateSnapshot: true,
      grossAmount: true,
      ownerAmount: true,
      agentAmount: true,
      platformAmount: true,
      refunded: true,
    },
    orderBy: [{ recognizedDate: "desc" }, { createdAt: "desc" }],
  });

  const adjustments = await prisma.adjustment.findMany({
    where: {
      recognizedMonth: month,
      status: { in: ["CONFIRMED", "SETTLED"] },
      Payment: {
        placeId: selectedPlace.id,
      },
    },
    include: {
      Payment: {
        select: {
          id: true,
          paymentRef: true,
          recognizedDate: true,
          customerNameSnapshot: true,
          plateSnapshot: true,
        },
      },
    },
    orderBy: [{ recognizedDate: "desc" }, { createdAt: "desc" }],
  });

  const paymentCount = payments.length;
  const adjustmentCount = adjustments.length;

  const totalGrossAmount = payments.reduce((sum, p) => sum + p.grossAmount, 0);
  const totalOwnerAmount = payments.reduce((sum, p) => sum + p.ownerAmount, 0);
  const totalAgentAmount = payments.reduce((sum, p) => sum + p.agentAmount, 0);
  const totalPlatformAmount = payments.reduce((sum, p) => sum + p.platformAmount, 0);

  const totalGrossDeltaAmount = adjustments.reduce(
    (sum, a) => sum + a.grossDeltaAmount,
    0
  );
  const totalOwnerDeltaAmount = adjustments.reduce(
    (sum, a) => sum + a.ownerDeltaAmount,
    0
  );
  const totalAgentDeltaAmount = adjustments.reduce(
    (sum, a) => sum + a.agentDeltaAmount,
    0
  );
  const totalPlatformDeltaAmount = adjustments.reduce(
    (sum, a) => sum + a.platformDeltaAmount,
    0
  );

  const refundTotal = Math.abs(totalGrossDeltaAmount);
  const netGrossAmount = totalGrossAmount + totalGrossDeltaAmount;
  const netOwnerAmountBeforeMinFee = totalOwnerAmount + totalOwnerDeltaAmount;
  const netAgentAmount = totalAgentAmount + totalAgentDeltaAmount;
  const netPlatformAmountBeforeMinFee =
    totalPlatformAmount + totalPlatformDeltaAmount;

  const ownerMonthPayments = selectedPlace.ownerId
    ? await prisma.payment.findMany({
        where: {
          ownerId: selectedPlace.ownerId,
          recognizedMonth: month,
          status: { in: ["CONFIRMED", "REFUNDED", "SETTLED"] },
          excludedFromSettlement: false,
        },
        select: {
          platformAmount: true,
        },
      })
    : [];

  const ownerMonthAdjustments = selectedPlace.ownerId
    ? await prisma.adjustment.findMany({
        where: {
          recognizedMonth: month,
          status: { in: ["CONFIRMED", "SETTLED"] },
          Payment: {
            ownerId: selectedPlace.ownerId,
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
    latestSettlement?.monthlyMinFeeAdjustment ??
    (ownerMonthPayments.length > 0 && ownerMonthPlatformRaw < MIN_PLATFORM_FEE_YEN
      ? MIN_PLATFORM_FEE_YEN - ownerMonthPlatformRaw
      : 0);

  const finalOwnerPayoutAmount =
    latestSettlement?.finalOwnerPayoutAmount ??
    Math.max(0, netOwnerAmountBeforeMinFee - monthlyMinFeeAdjustment);

  const finalAgentPayoutAmount =
    latestSettlement?.finalAgentPayoutAmount ?? Math.max(0, netAgentAmount);

  const finalPlatformAmount =
    latestSettlement
      ? (latestSettlement.totalPlatformAmount ?? totalPlatformAmount) +
        monthlyMinFeeAdjustment +
        totalPlatformDeltaAmount
      : netPlatformAmountBeforeMinFee + monthlyMinFeeAdjustment;

  const recentAdjustments = adjustments.slice(0, 20);
  const recentPayments = payments.slice(0, 20);

  const canCreateSettlement = paymentCount > 0 || adjustmentCount > 0;

  return (
    <main style={pageStyle}>
      <div style={navRowStyle}>
        <Link href="/admin" style={navButtonStyle}>
          ダッシュボード
        </Link>
        <Link href="/admin/places" style={navButtonStyle}>
          Place管理
        </Link>
        <Link href="/admin/sales/monthly" style={navButtonStyle}>
          月間売上
        </Link>
        <span style={navButtonActiveStyle}>月次締め</span>
      </div>

      <div style={headerRowStyle}>
        <div>
          <h1 style={titleStyle}>月次締め</h1>
          <div style={subInfoStyle}>Place: {selectedPlace.name}</div>
          <div style={subInfoStyle}>slug: {selectedPlace.slug}</div>
          <div style={subInfoStyle}>対象月: {month}</div>
          <div style={subInfoStyle}>
            オーナー:{" "}
            {selectedPlace.owner?.displayName || selectedPlace.owner?.name || "-"}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-start" }}>
          <a
            href={`/api/admin/settlements/csv?month=${encodeURIComponent(month)}&type=journal`}
            style={csvBtnStyle}
            download
          >
            📒 仕訳CSV
          </a>
          <a
            href={`/api/admin/settlements/csv?month=${encodeURIComponent(month)}&type=detail`}
            style={csvBtnStyle}
            download
          >
            📊 明細CSV
          </a>
        </div>
      </div>

      {params.created === "1" ? (
        <div style={successBoxStyle}>月締めを作成しました。</div>
      ) : null}
      {params.exists === "1" ? (
        <div style={infoBoxStyle}>この月の締めはすでに存在します。</div>
      ) : null}
      {params.empty === "1" ? (
        <div style={warnBoxStyle}>締め対象の Payment / Adjustment がありません。</div>
      ) : null}

      <div style={layoutStyle}>
        <section style={{ minWidth: 0 }}>
          <div style={heroCardStyle}>
            <div style={heroTopStyle}>
              <div>
                <div style={heroTitleStyle}>
                  {latestSettlement
                    ? latestSettlement.status === "PAID"
                      ? "締め済み・送金済み"
                      : "締め済み"
                    : "締め前プレビュー"}
                </div>
                <div style={heroSubStyle}>
                  {latestSettlement
                    ? `Settlement ID: ${latestSettlement.id}`
                    : "まだ月次締めは作成されていません"}
                </div>
              </div>

              {latestSettlement ? (
                <span style={statusBadgeStyle(latestSettlement.status)}>
                  {statusLabel(latestSettlement.status)}
                </span>
              ) : (
                <span style={statusBadgeStyle("DRAFT")}>未作成</span>
              )}
            </div>

            <div style={summaryGridStyle}>
              <div style={summaryCardStyle}>
                <div style={summaryLabelStyle}>売上総額</div>
                <div style={summaryValueStyle}>{fmtYen(totalGrossAmount)}</div>
                <div style={summarySubValueStyle}>Payment {paymentCount} 件</div>
              </div>

              <div style={summaryCardStyle}>
                <div style={summaryLabelStyle}>返金総額</div>
                <div style={summaryValueStyle}>{fmtYen(refundTotal)}</div>
                <div style={summarySubValueStyle}>Adjustment {adjustmentCount} 件</div>
              </div>

              <div style={summaryCardStyle}>
                <div style={summaryLabelStyle}>純売上</div>
                <div style={summaryValueStyle}>{fmtYen(netGrossAmount)}</div>
                <div style={summarySubValueStyle}>売上 - 返金</div>
              </div>

              <div style={summaryCardStyle}>
                <div style={summaryLabelStyle}>オーナー純額</div>
                <div style={summaryValueStyle}>{fmtYen(finalOwnerPayoutAmount)}</div>
                <div style={summarySubValueStyle}>
                  調整前 {fmtYen(netOwnerAmountBeforeMinFee)}
                </div>
              </div>

              <div style={summaryCardStyle}>
                <div style={summaryLabelStyle}>代理店純額</div>
                <div style={summaryValueStyle}>{fmtYen(finalAgentPayoutAmount)}</div>
                <div style={summarySubValueStyle}>
                  差額反映後 {fmtYen(netAgentAmount)}
                </div>
              </div>

              <div style={summaryCardStyle}>
                <div style={summaryLabelStyle}>本部純額</div>
                <div style={summaryValueStyle}>{fmtYen(finalPlatformAmount)}</div>
                <div style={summarySubValueStyle}>
                  最低利用料調整 {fmtYen(monthlyMinFeeAdjustment)}
                </div>
              </div>
            </div>

            <div style={metaGridStyle}>
              <div style={metaItemStyle}>
                <div style={metaLabelStyle}>Payment件数</div>
                <div style={metaValueStyle}>{paymentCount} 件</div>
              </div>
              <div style={metaItemStyle}>
                <div style={metaLabelStyle}>Adjustment件数</div>
                <div style={metaValueStyle}>{adjustmentCount} 件</div>
              </div>
              <div style={metaItemStyle}>
                <div style={metaLabelStyle}>最低利用料調整</div>
                <div style={metaValueStyle}>{fmtYen(monthlyMinFeeAdjustment)}</div>
              </div>
              <div style={metaItemStyle}>
                <div style={metaLabelStyle}>最終確認日時</div>
                <div style={metaValueStyle}>
                  {fmtDateTime(latestSettlement?.updatedAt ?? null)}
                </div>
              </div>
            </div>

            {latestSettlement && latestSettlement.status !== "PAID" ? (
              <form
                action={`/api/admin/settlements/${latestSettlement.id}/pay`}
                method="post"
                style={{ marginTop: 20 }}
              >
                <button type="submit" style={primaryButtonStyle}>
                  送金確定
                </button>
              </form>
            ) : null}
          </div>

          <section style={cardStyle}>
            <div style={sectionTitleRowStyle}>
              <h2 style={sectionTitleStyle}>締め一覧</h2>
              <Link
                href={buildUrl("/admin/sales/monthly", {
                  placeId: selectedPlace.id,
                  month,
                })}
                style={linkStyle}
              >
                月間売上を見る
              </Link>
            </div>

            {!hasSettlement ? (
              <div style={emptyTextStyle}>この月の締めはありません。</div>
            ) : (
              <div style={tableWrapStyle}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={thStyle}>状態</th>
                      <th style={thStyle}>作成日</th>
                      <th style={thStyle}>売上総額</th>
                      <th style={thStyle}>調整件数</th>
                      <th style={thStyle}>最低利用料調整</th>
                      <th style={thStyle}>オーナー振込</th>
                      <th style={thStyle}>代理店振込</th>
                      <th style={thStyle}>精算書</th>
                    </tr>
                  </thead>
                  <tbody>
                    {settlements.map((s) => (
                      <tr key={s.id}>
                        <td style={tdStyle}>
                          <span style={statusBadgeStyle(s.status)}>
                            {statusLabel(s.status)}
                          </span>
                        </td>
                        <td style={tdStyle}>{fmtDateTime(s.createdAt)}</td>
                        <td style={tdStyle}>{fmtYen(s.totalGrossAmount)}</td>
                        <td style={tdStyle}>{s.adjustmentCount}</td>
                        <td style={tdStyle}>{fmtYen(s.monthlyMinFeeAdjustment)}</td>
                        <td style={tdStyle}>{fmtYen(s.finalOwnerPayoutAmount)}</td>
                        <td style={tdStyle}>{fmtYen(s.finalAgentPayoutAmount)}</td>
                        <td style={tdStyle}>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <a
                              href={`/admin/settlements/${s.id}/pdf?target=owner`}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={pdfLinkStyle}
                            >
                              オーナー精算書
                            </a>
                            {s.agentId ? (
                              <a
                                href={`/admin/settlements/${s.id}/pdf?target=agent`}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={pdfLinkStyle}
                              >
                                代理店精算書
                              </a>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section style={{ ...cardStyle, marginTop: 24 }}>
            <div style={sectionTitleRowStyle}>
              <h2 style={sectionTitleStyle}>返金 / 調整一覧</h2>
            </div>

            {recentAdjustments.length === 0 ? (
              <div style={emptyTextStyle}>この月の返金・調整はありません。</div>
            ) : (
              <div style={tableWrapStyle}>
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
                    </tr>
                  </thead>
                  <tbody>
                    {recentAdjustments.map((a) => (
                      <tr key={a.id}>
                        <td style={tdStyle}>{fmtDateTime(a.createdAt)}</td>
                        <td style={tdStyle}>{a.kind}</td>
                        <td style={tdStyle}>{a.reason}</td>
                        <td style={tdStyle}>{fmtSignedYen(a.grossDeltaAmount)}</td>
                        <td style={tdStyle}>{fmtSignedYen(a.ownerDeltaAmount)}</td>
                        <td style={tdStyle}>{fmtSignedYen(a.agentDeltaAmount)}</td>
                        <td style={tdStyle}>{fmtSignedYen(a.platformDeltaAmount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section style={{ ...cardStyle, marginTop: 24 }}>
            <div style={sectionTitleRowStyle}>
              <h2 style={sectionTitleStyle}>最近の売上</h2>
            </div>

            {recentPayments.length === 0 ? (
              <div style={emptyTextStyle}>この月の売上はありません。</div>
            ) : (
              <div style={tableWrapStyle}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={thStyle}>日時</th>
                      <th style={thStyle}>利用日</th>
                      <th style={thStyle}>種別</th>
                      <th style={thStyle}>顧客</th>
                      <th style={thStyle}>売上額</th>
                      <th style={thStyle}>オーナー</th>
                      <th style={thStyle}>代理店</th>
                      <th style={thStyle}>本部</th>
                      <th style={thStyle}>返金済</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentPayments.map((p) => (
                      <tr key={p.id}>
                        <td style={tdStyle}>{fmtDateTime(p.createdAt)}</td>
                        <td style={tdStyle}>{p.serviceDate ?? fmtDate(p.recognizedDate)}</td>
                        <td style={tdStyle}>{p.kind}</td>
                        <td style={tdStyle}>{p.customerNameSnapshot ?? "-"}</td>
                        <td style={tdStyle}>{fmtYen(p.grossAmount)}</td>
                        <td style={tdStyle}>{fmtYen(p.ownerAmount)}</td>
                        <td style={tdStyle}>{fmtYen(p.agentAmount)}</td>
                        <td style={tdStyle}>{fmtYen(p.platformAmount)}</td>
                        <td style={tdStyle}>{p.refunded ? "はい" : "いいえ"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </section>

        <aside style={sideCardStyle}>
          <form method="get" style={formBlockStyle}>
            <div style={fieldBlockStyle}>
              <label style={labelStyle}>Place</label>
              <select
                name="placeId"
                defaultValue={selectedPlace.id}
                style={inputStyle}
              >
                {places.map((place) => (
                  <option key={place.id} value={place.id}>
                    {place.name} ({place.slug})
                  </option>
                ))}
              </select>
            </div>

            <div style={fieldBlockStyle}>
              <label style={labelStyle}>月</label>
              <input
                type="month"
                name="month"
                defaultValue={month}
                style={inputStyle}
              />
            </div>

            <button type="submit" style={secondaryButtonStyle}>
              表示
            </button>
          </form>

          {!hasSettlement ? (
            canCreateSettlement ? (
              <form action="/api/admin/settlements/create" method="post">
                <input type="hidden" name="placeId" value={selectedPlace.id} />
                <input type="hidden" name="month" value={month} />
                <button type="submit" style={primaryButtonStyle}>
                  月締めを実行
                </button>
              </form>
            ) : (
              <div style={warnBoxStyle}>締め対象の Payment / Adjustment がありません。</div>
            )
          ) : (
            <div style={doneBoxStyle}>この月の締めは作成済みです。</div>
          )}
        </aside>
      </div>
    </main>
  );
}

const pageStyle: CSSProperties = {
  maxWidth: 1280,
  margin: "0 auto",
  padding: "32px 24px 80px",
};

const navRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 12,
  marginBottom: 24,
};

const navButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  textDecoration: "none",
  border: "1px solid #e5e7eb",
  background: "#fff",
  color: "#111827",
  borderRadius: 14,
  padding: "12px 18px",
  fontWeight: 600,
};

const navButtonActiveStyle: CSSProperties = {
  ...navButtonStyle,
  background: "#111827",
  color: "#fff",
  borderColor: "#111827",
};

const headerRowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 16,
  marginBottom: 20,
};

const titleStyle: CSSProperties = {
  fontSize: 40,
  lineHeight: 1.1,
  fontWeight: 800,
  margin: 0,
  color: "#111827",
};

const subInfoStyle: CSSProperties = {
  marginTop: 8,
  fontSize: 18,
  color: "#4b5563",
};

const successBoxStyle: CSSProperties = {
  border: "1px solid #a7f3d0",
  background: "#ecfdf5",
  color: "#065f46",
  borderRadius: 16,
  padding: "14px 16px",
  marginBottom: 16,
};

const infoBoxStyle: CSSProperties = {
  border: "1px solid #bfdbfe",
  background: "#eff6ff",
  color: "#1d4ed8",
  borderRadius: 16,
  padding: "14px 16px",
  marginBottom: 16,
};

const warnBoxStyle: CSSProperties = {
  border: "1px solid #fde68a",
  background: "#fffbeb",
  color: "#92400e",
  borderRadius: 16,
  padding: "14px 16px",
  marginBottom: 16,
};

const layoutStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) 320px",
  gap: 24,
  alignItems: "start",
};

const cardStyle: CSSProperties = {
  border: "1px solid #e5e7eb",
  background: "#fff",
  borderRadius: 24,
  padding: 24,
};

const heroCardStyle: CSSProperties = {
  border: "1px solid #dbeafe",
  background: "#f8fbff",
  borderRadius: 24,
  padding: 24,
  marginBottom: 24,
};

const heroTopStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 16,
};

const heroTitleStyle: CSSProperties = {
  fontSize: 30,
  fontWeight: 800,
  color: "#0f172a",
};

const heroSubStyle: CSSProperties = {
  marginTop: 8,
  color: "#334155",
  fontSize: 14,
  wordBreak: "break-all",
};

const badgeBaseStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  border: "1px solid",
  borderRadius: 999,
  padding: "6px 12px",
  fontSize: 13,
  fontWeight: 700,
  whiteSpace: "nowrap",
};

const summaryGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 16,
  marginTop: 20,
};

const summaryCardStyle: CSSProperties = {
  border: "1px solid #dbeafe",
  borderRadius: 18,
  background: "#fff",
  padding: 16,
};

const summaryLabelStyle: CSSProperties = {
  fontSize: 13,
  color: "#6b7280",
  marginBottom: 8,
};

const summaryValueStyle: CSSProperties = {
  fontSize: 28,
  fontWeight: 800,
  color: "#111827",
};

const summarySubValueStyle: CSSProperties = {
  marginTop: 8,
  fontSize: 12,
  color: "#6b7280",
};

const metaGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
  marginTop: 20,
};

const metaItemStyle: CSSProperties = {
  border: "1px solid #dbeafe",
  background: "#fff",
  borderRadius: 16,
  padding: 14,
};

const metaLabelStyle: CSSProperties = {
  fontSize: 12,
  color: "#6b7280",
  marginBottom: 6,
};

const metaValueStyle: CSSProperties = {
  fontSize: 16,
  fontWeight: 700,
  color: "#111827",
};

const sideCardStyle: CSSProperties = {
  border: "1px solid #e5e7eb",
  background: "#fff",
  borderRadius: 24,
  padding: 20,
  position: "sticky",
  top: 24,
};

const formBlockStyle: CSSProperties = {
  display: "grid",
  gap: 16,
  marginBottom: 20,
};

const fieldBlockStyle: CSSProperties = {
  display: "grid",
  gap: 8,
};

const labelStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: "#4b5563",
};

const inputStyle: CSSProperties = {
  width: "100%",
  border: "1px solid #d1d5db",
  borderRadius: 14,
  padding: "12px 14px",
  fontSize: 16,
  background: "#fff",
  color: "#111827",
};

const primaryButtonStyle: CSSProperties = {
  width: "100%",
  border: "none",
  borderRadius: 14,
  background: "#16a34a",
  color: "#fff",
  padding: "14px 18px",
  fontSize: 16,
  fontWeight: 700,
  cursor: "pointer",
};

const secondaryButtonStyle: CSSProperties = {
  width: "100%",
  border: "1px solid #111827",
  borderRadius: 14,
  background: "#111827",
  color: "#fff",
  padding: "14px 18px",
  fontSize: 16,
  fontWeight: 700,
  cursor: "pointer",
};

const doneBoxStyle: CSSProperties = {
  border: "1px solid #a7f3d0",
  background: "#ecfdf5",
  color: "#065f46",
  borderRadius: 16,
  padding: "14px 16px",
  fontSize: 14,
  fontWeight: 700,
};

const sectionTitleRowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 16,
  marginBottom: 16,
};

const sectionTitleStyle: CSSProperties = {
  fontSize: 28,
  fontWeight: 800,
  margin: 0,
  color: "#111827",
};

const linkStyle: CSSProperties = {
  color: "#2563eb",
  textDecoration: "none",
  fontWeight: 700,
};

const pdfLinkStyle: CSSProperties = {
  display: "inline-block",
  padding: "4px 10px",
  border: "1px solid #d1d5db",
  borderRadius: 6,
  background: "#fff",
  color: "#111827",
  textDecoration: "none",
  fontSize: 12,
  fontWeight: 700,
  whiteSpace: "nowrap",
};

const csvBtnStyle: CSSProperties = {
  display: "inline-block",
  padding: "8px 14px",
  border: "1px solid #111827",
  borderRadius: 8,
  background: "#fff",
  color: "#111827",
  textDecoration: "none",
  fontSize: 13,
  fontWeight: 700,
  whiteSpace: "nowrap",
};

const tableWrapStyle: CSSProperties = {
  overflowX: "auto",
};

const tableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
};

const thStyle: CSSProperties = {
  textAlign: "left",
  fontSize: 13,
  color: "#6b7280",
  fontWeight: 700,
  padding: "12px 10px",
  borderBottom: "1px solid #e5e7eb",
  whiteSpace: "nowrap",
};

const tdStyle: CSSProperties = {
  padding: "14px 10px",
  borderBottom: "1px solid #f3f4f6",
  fontSize: 14,
  color: "#111827",
  verticalAlign: "middle",
  whiteSpace: "nowrap",
};

const emptyTextStyle: CSSProperties = {
  color: "#6b7280",
  fontSize: 16,
};

const emptyCardStyle: CSSProperties = {
  marginTop: 20,
  border: "1px solid #e5e7eb",
  borderRadius: 20,
  padding: 24,
  background: "#fff",
  color: "#374151",
};