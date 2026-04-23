"use client";

import { useEffect, useMemo, useState } from "react";

type SummaryBlock = {
  count?: number;
  grossAmount?: number;
  ownerAmount?: number;
  agentAmount?: number;
  platformAmount?: number;
  grossDeltaAmount?: number;
  ownerDeltaAmount?: number;
  agentDeltaAmount?: number;
  platformDeltaAmount?: number;
  netGrossAmount?: number;
  netOwnerAmount?: number;
  netAgentAmount?: number;
  netPlatformAmount?: number;
};

type ByPlaceRow = {
  placeId: string;
  placeName: string;
  paymentCount: number;
  adjustmentCount: number;
  grossAmount: number;
  grossDeltaAmount: number;
  netGrossAmount: number;
  ownerAmount: number;
  ownerDeltaAmount: number;
  netOwnerAmount: number;
  agentAmount: number;
  agentDeltaAmount: number;
  netAgentAmount: number;
  platformAmount: number;
  platformDeltaAmount: number;
  netPlatformAmount: number;
};

type RecentPayment = {
  id: string;
  kind: string;
  status: string;
  recognizedMonth: string;
  recognizedDate: string;
  serviceDate: string | null;
  paymentRef: string | null;
  placeId: string;
  placeNameSnapshot: string;
  ownerId: string;
  ownerNameSnapshot: string;
  agentId: string | null;
  agentNameSnapshot: string | null;
  grossAmount: number;
  ownerAmount: number;
  agentAmount: number;
  platformAmount: number;
  refunded: boolean;
  customerNameSnapshot: string | null;
  plateSnapshot: string | null;
};

type RecentAdjustment = {
  id: string;
  paymentId: string;
  paymentRef: string | null;
  placeName: string;
  ownerName: string;
  agentName: string | null;
  kind: string;
  status: string;
  recognizedMonth: string;
  recognizedDate: string;
  grossDeltaAmount: number;
  ownerDeltaAmount: number;
  agentDeltaAmount: number;
  platformDeltaAmount: number;
  reason: string;
  note: string | null;
  createdAt: string;
};

type ApiResponse = {
  ok: boolean;
  month: string;
  summary: {
    payments: SummaryBlock;
    adjustments: SummaryBlock;
    net: SummaryBlock;
  };
  byPlace: ByPlaceRow[];
  recentPayments: RecentPayment[];
  recentAdjustments: RecentAdjustment[];
  message?: string;
};

function currentMonth() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function yen(value: number | null | undefined) {
  return `${Number(value ?? 0).toLocaleString("ja-JP")}円`;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const d = new Date(value);
  return d.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
}

export default function AdminSettlementPage() {
  const [month, setMonth] = useState(currentMonth());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<ApiResponse | null>(null);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    params.set("month", month);
    return params.toString();
  }, [month]);

  async function load() {
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`/api/admin/settlement?${query}`, {
        cache: "no-store",
      });

      const json: ApiResponse = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.message || "取得に失敗しました");
      }

      setData(json);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [query]);

  return (
    <main
      style={{
        maxWidth: 1480,
        margin: "32px auto",
        padding: "0 20px 48px",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <h1 style={{ fontSize: 30, fontWeight: 900, marginBottom: 20 }}>
        月次売上 / 返金 / 純売上ダッシュボード
      </h1>

      <section
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 16,
          padding: 16,
          background: "#fff",
          marginBottom: 20,
        }}
      >
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <label style={smallLabel}>対象月</label>
            <br />
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              style={inputStyle}
            />
          </div>

          <button onClick={() => void load()} style={buttonStyle}>
            再読み込み
          </button>
        </div>
      </section>

      {loading ? (
        <section style={panelStyle}>読み込み中...</section>
      ) : error ? (
        <section style={{ ...panelStyle, color: "#b00020" }}>{error}</section>
      ) : !data ? (
        <section style={panelStyle}>データがありません。</section>
      ) : (
        <>
          <section
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              gap: 16,
              marginBottom: 20,
            }}
          >
            <SummaryCard
              title="売上"
              lines={[
                `件数: ${data.summary.payments.count ?? 0}`,
                `総売上: ${yen(data.summary.payments.grossAmount)}`,
                `オーナー配分: ${yen(data.summary.payments.ownerAmount)}`,
                `代理店配分: ${yen(data.summary.payments.agentAmount)}`,
                `本部分配: ${yen(data.summary.payments.platformAmount)}`,
              ]}
            />
            <SummaryCard
              title="返金 / 調整"
              lines={[
                `件数: ${data.summary.adjustments.count ?? 0}`,
                `返金総額: ${yen(data.summary.adjustments.grossDeltaAmount)}`,
                `オーナー差額: ${yen(data.summary.adjustments.ownerDeltaAmount)}`,
                `代理店差額: ${yen(data.summary.adjustments.agentDeltaAmount)}`,
                `本部差額: ${yen(data.summary.adjustments.platformDeltaAmount)}`,
              ]}
            />
            <SummaryCard
              title="純売上"
              lines={[
                `純売上: ${yen(data.summary.net.netGrossAmount)}`,
                `純オーナー: ${yen(data.summary.net.netOwnerAmount)}`,
                `純代理店: ${yen(data.summary.net.netAgentAmount)}`,
                `純本部: ${yen(data.summary.net.netPlatformAmount)}`,
              ]}
              strong
            />
          </section>

          <section style={{ ...panelStyle, marginBottom: 20 }}>
            <h2 style={sectionTitle}>駐車場別集計</h2>
            <div style={{ overflowX: "auto" }}>
              <table style={tableStyle}>
                <thead>
                  <tr style={theadRowStyle}>
                    <th style={thStyle}>駐車場</th>
                    <th style={thStyle}>売上件数</th>
                    <th style={thStyle}>返金件数</th>
                    <th style={thStyle}>総売上</th>
                    <th style={thStyle}>返金総額</th>
                    <th style={thStyle}>純売上</th>
                    <th style={thStyle}>純オーナー</th>
                    <th style={thStyle}>純代理店</th>
                    <th style={thStyle}>純本部</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byPlace.map((row) => (
                    <tr key={row.placeId} style={tbodyRowStyle}>
                      <td style={tdStyle}>{row.placeName}</td>
                      <td style={tdStyle}>{row.paymentCount}</td>
                      <td style={tdStyle}>{row.adjustmentCount}</td>
                      <td style={tdStyle}>{yen(row.grossAmount)}</td>
                      <td style={tdStyle}>{yen(row.grossDeltaAmount)}</td>
                      <td style={{ ...tdStyle, fontWeight: 800 }}>
                        {yen(row.netGrossAmount)}
                      </td>
                      <td style={tdStyle}>{yen(row.netOwnerAmount)}</td>
                      <td style={tdStyle}>{yen(row.netAgentAmount)}</td>
                      <td style={tdStyle}>{yen(row.netPlatformAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section style={{ ...panelStyle, marginBottom: 20 }}>
            <h2 style={sectionTitle}>最近の売上</h2>
            <div style={{ overflowX: "auto" }}>
              <table style={tableStyle}>
                <thead>
                  <tr style={theadRowStyle}>
                    <th style={thStyle}>日時</th>
                    <th style={thStyle}>駐車場</th>
                    <th style={thStyle}>利用日</th>
                    <th style={thStyle}>顧客</th>
                    <th style={thStyle}>予約種別</th>
                    <th style={thStyle}>金額</th>
                    <th style={thStyle}>オーナー</th>
                    <th style={thStyle}>代理店</th>
                    <th style={thStyle}>本部</th>
                    <th style={thStyle}>返金済</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentPayments.map((row) => (
                    <tr key={row.id} style={tbodyRowStyle}>
                      <td style={tdStyle}>{formatDateTime(row.recognizedDate)}</td>
                      <td style={tdStyle}>{row.placeNameSnapshot}</td>
                      <td style={tdStyle}>{row.serviceDate ?? "-"}</td>
                      <td style={tdStyle}>{row.customerNameSnapshot ?? "-"}</td>
                      <td style={tdStyle}>{row.kind}</td>
                      <td style={tdStyle}>{yen(row.grossAmount)}</td>
                      <td style={tdStyle}>{yen(row.ownerAmount)}</td>
                      <td style={tdStyle}>{yen(row.agentAmount)}</td>
                      <td style={tdStyle}>{yen(row.platformAmount)}</td>
                      <td style={tdStyle}>{row.refunded ? "はい" : "いいえ"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section style={panelStyle}>
            <h2 style={sectionTitle}>最近の返金 / 調整</h2>
            <div style={{ overflowX: "auto" }}>
              <table style={tableStyle}>
                <thead>
                  <tr style={theadRowStyle}>
                    <th style={thStyle}>日時</th>
                    <th style={thStyle}>駐車場</th>
                    <th style={thStyle}>種別</th>
                    <th style={thStyle}>理由</th>
                    <th style={thStyle}>返金額</th>
                    <th style={thStyle}>オーナー差額</th>
                    <th style={thStyle}>代理店差額</th>
                    <th style={thStyle}>本部差額</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentAdjustments.map((row) => (
                    <tr key={row.id} style={tbodyRowStyle}>
                      <td style={tdStyle}>{formatDateTime(row.createdAt)}</td>
                      <td style={tdStyle}>{row.placeName}</td>
                      <td style={tdStyle}>{row.kind}</td>
                      <td style={tdStyle}>{row.reason}</td>
                      <td style={tdStyle}>{yen(row.grossDeltaAmount)}</td>
                      <td style={tdStyle}>{yen(row.ownerDeltaAmount)}</td>
                      <td style={tdStyle}>{yen(row.agentDeltaAmount)}</td>
                      <td style={tdStyle}>{yen(row.platformDeltaAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </main>
  );
}

function SummaryCard({
  title,
  lines,
  strong = false,
}: {
  title: string;
  lines: string[];
  strong?: boolean;
}) {
  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 16,
        background: "#fff",
        padding: 18,
      }}
    >
      <div
        style={{
          fontSize: 18,
          fontWeight: 900,
          marginBottom: 12,
        }}
      >
        {title}
      </div>
      <div style={{ lineHeight: 1.9, fontWeight: strong ? 800 : 500 }}>
        {lines.map((line) => (
          <div key={line}>{line}</div>
        ))}
      </div>
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 16,
  background: "#fff",
  padding: 16,
};

const sectionTitle: React.CSSProperties = {
  fontSize: 20,
  fontWeight: 900,
  marginBottom: 12,
};

const smallLabel: React.CSSProperties = {
  fontSize: 12,
  color: "#666",
};

const inputStyle: React.CSSProperties = {
  marginTop: 6,
  padding: "10px 12px",
  border: "1px solid #d1d5db",
  borderRadius: 10,
  fontSize: 14,
};

const buttonStyle: React.CSSProperties = {
  marginTop: 22,
  padding: "10px 16px",
  border: "none",
  borderRadius: 10,
  background: "#111",
  color: "#fff",
  fontWeight: 700,
  cursor: "pointer",
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 14,
};

const theadRowStyle: React.CSSProperties = {
  background: "#f8fafc",
};

const tbodyRowStyle: React.CSSProperties = {
  borderTop: "1px solid #eee",
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "12px 10px",
  whiteSpace: "nowrap",
  fontWeight: 800,
};

const tdStyle: React.CSSProperties = {
  padding: "12px 10px",
  whiteSpace: "nowrap",
  verticalAlign: "top",
};