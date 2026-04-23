"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

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

function fmtYen(value?: number | null) {
  return `${(value ?? 0).toLocaleString("ja-JP")}円`;
}

function fmtDate(value?: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

type DashboardResponse = {
  ok: boolean;
  month?: string;
  agent?: {
    id: string;
    code: string;
    name: string;
    displayName: string | null;
    email: string | null;
  };
  totals?: {
    gross: number;
    agentAmount: number;
    settledAgentAmount: number;
    placeCount: number;
    paymentCount: number;
  };
  places?: Array<{
    placeId: string;
    placeName: string;
    placeSlug: string | null;
    address: string | null;
    ownerId: string | null;
    ownerName: string | null;
    ownerDisplayName: string | null;
    startsAt: string | null;
    endsAt: string | null;
    gross: number;
    agentAmount: number;
    settledAgentAmount: number;
    paymentCount: number;
  }>;
  daily?: Array<{
    date: string;
    gross: number;
    agentAmount: number;
    paymentCount: number;
  }>;
  error?: string;
  message?: string;
};

function updateUrl(
  router: ReturnType<typeof useRouter>,
  current: URLSearchParams,
  patch: Record<string, string>
) {
  const next = new URLSearchParams(current.toString());

  Object.entries(patch).forEach(([key, value]) => {
    if (value === "") {
      next.delete(key);
    } else {
      next.set(key, value);
    }
  });

  const qs = next.toString();
  router.replace(qs ? `/agent/dashboard?${qs}` : "/agent/dashboard", {
    scroll: false,
  });
}

export default function AgentDashboardPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const initialMonth = searchParams.get("month") || ymNowJst();

  const [month, setMonth] = useState(initialMonth);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [data, setData] = useState<DashboardResponse | null>(null);

  const currentSearchParams = useMemo(
    () => new URLSearchParams(searchParams.toString()),
    [searchParams]
  );

  async function loadDashboard(targetMonth: string) {
    setLoading(true);
    setErr("");

    try {
      const params = new URLSearchParams({
        month: targetMonth,
      });

      const res = await fetch(`/api/agent/dashboard?${params.toString()}`, {
        cache: "no-store",
      });

      const text = await res.text();
      let json: DashboardResponse | null = null;

      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        setErr(`APIがJSONを返していません (${res.status})`);
        setData(null);
        return;
      }

      if (!res.ok || !json?.ok) {
        setErr(json?.message ?? json?.error ?? "ダッシュボード取得に失敗しました");
        setData(null);
        return;
      }

      setData(json);
    } catch (e: any) {
      setErr(String(e?.message ?? e));
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDashboard(month);
  }, [month]);

  const totals = data?.totals;
  const places = data?.places ?? [];
  const daily = data?.daily ?? [];
  const agentName = data?.agent?.displayName || data?.agent?.name || "-";

  return (
    <main style={pageStyle}>
      <div style={headerRowStyle}>
        <div>
          <h1 style={titleStyle}>代理店ダッシュボード</h1>
          <div style={subInfoStyle}>代理店: {agentName}</div>
          <div style={subInfoStyle}>コード: {data?.agent?.code ?? "-"}</div>
          <div style={subInfoStyle}>対象月: {data?.month ?? month}</div>
        </div>

        <div style={headerActionsStyle}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              updateUrl(router, currentSearchParams, { month });
              loadDashboard(month);
            }}
            style={monthFormStyle}
          >
            <div style={fieldBlockStyle}>
              <label style={labelStyle}>月</label>
              <input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                style={inputStyle}
              />
            </div>
            <button type="submit" style={buttonStyle}>
              表示
            </button>
          </form>

          <form action="/agent/logout" method="post">
            <button type="submit" style={logoutButtonStyle}>
              ログアウト
            </button>
          </form>
        </div>
      </div>

      {err ? <div style={errorCardStyle}>{err}</div> : null}

      <section style={summaryGridStyle}>
        <div style={summaryCardStyle}>
          <div style={summaryLabelStyle}>担当売上合計</div>
          <div style={summaryValueStyle}>{fmtYen(totals?.gross)}</div>
        </div>
        <div style={summaryCardStyle}>
          <div style={summaryLabelStyle}>代理店報酬合計</div>
          <div style={summaryValueStyle}>{fmtYen(totals?.agentAmount)}</div>
        </div>
        <div style={summaryCardStyle}>
          <div style={summaryLabelStyle}>精算済報酬</div>
          <div style={summaryValueStyle}>{fmtYen(totals?.settledAgentAmount)}</div>
        </div>
        <div style={summaryCardStyle}>
          <div style={summaryLabelStyle}>担当Place数</div>
          <div style={summaryValueStyle}>{totals?.placeCount ?? 0}件</div>
        </div>
      </section>

      <section style={sectionStyle}>
        <div style={sectionHeaderStyle}>
          <h2 style={sectionTitleStyle}>Place別売上</h2>
          <div style={sectionMetaStyle}>
            決済件数: {totals?.paymentCount ?? 0}件
          </div>
        </div>

        {loading ? (
          <div style={loadingCardStyle}>読み込み中...</div>
        ) : places.length === 0 ? (
          <div style={emptyCardStyle}>対象データがありません。</div>
        ) : (
          <div style={tableWrapStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Place</th>
                  <th style={thStyle}>オーナー</th>
                  <th style={thStyle}>期間</th>
                  <th style={thStyleRight}>売上総額</th>
                  <th style={thStyleRight}>代理店報酬</th>
                  <th style={thStyleRight}>精算済</th>
                  <th style={thStyleRight}>件数</th>
                </tr>
              </thead>
              <tbody>
                {places.map((row) => (
                  <tr key={row.placeId}>
                    <td style={tdStyle}>
                      <div style={cellTitleStyle}>{row.placeName}</div>
                      <div style={cellSubStyle}>{row.address || "-"}</div>
                    </td>
                    <td style={tdStyle}>
                      {row.ownerDisplayName || row.ownerName || "-"}
                    </td>
                    <td style={tdStyle}>
                      <div>{fmtDate(row.startsAt)}</div>
                      <div style={cellSubStyle}>〜 {fmtDate(row.endsAt)}</div>
                    </td>
                    <td style={tdStyleRight}>{fmtYen(row.gross)}</td>
                    <td style={tdStyleRight}>{fmtYen(row.agentAmount)}</td>
                    <td style={tdStyleRight}>{fmtYen(row.settledAgentAmount)}</td>
                    <td style={tdStyleRight}>{row.paymentCount}件</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section style={sectionStyle}>
        <div style={sectionHeaderStyle}>
          <h2 style={sectionTitleStyle}>日別売上</h2>
        </div>

        {loading ? (
          <div style={loadingCardStyle}>読み込み中...</div>
        ) : daily.length === 0 ? (
          <div style={emptyCardStyle}>日別データがありません。</div>
        ) : (
          <div style={tableWrapStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>日付</th>
                  <th style={thStyleRight}>売上総額</th>
                  <th style={thStyleRight}>代理店報酬</th>
                  <th style={thStyleRight}>件数</th>
                </tr>
              </thead>
              <tbody>
                {daily.map((row) => (
                  <tr key={row.date}>
                    <td style={tdStyle}>{row.date}</td>
                    <td style={tdStyleRight}>{fmtYen(row.gross)}</td>
                    <td style={tdStyleRight}>{fmtYen(row.agentAmount)}</td>
                    <td style={tdStyleRight}>{row.paymentCount}件</td>
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

const pageStyle: React.CSSProperties = {
  padding: 24,
  display: "grid",
  gap: 20,
};

const headerRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 16,
  flexWrap: "wrap",
};

const titleStyle: React.CSSProperties = {
  fontSize: 28,
  fontWeight: 700,
  margin: 0,
};

const subInfoStyle: React.CSSProperties = {
  marginTop: 6,
  color: "#555",
  fontSize: 14,
};

const headerActionsStyle: React.CSSProperties = {
  display: "flex",
  gap: 12,
  flexWrap: "wrap",
  alignItems: "flex-end",
};

const monthFormStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "flex-end",
  flexWrap: "wrap",
};

const fieldBlockStyle: React.CSSProperties = {
  display: "grid",
  gap: 6,
};

const labelStyle: React.CSSProperties = {
  fontSize: 13,
  color: "#444",
};

const inputStyle: React.CSSProperties = {
  border: "1px solid #ccc",
  borderRadius: 8,
  padding: "8px 10px",
  fontSize: 14,
};

const buttonStyle: React.CSSProperties = {
  border: 0,
  borderRadius: 8,
  padding: "9px 14px",
  background: "#111",
  color: "#fff",
  cursor: "pointer",
};

const logoutButtonStyle: React.CSSProperties = {
  border: "1px solid #ccc",
  borderRadius: 8,
  padding: "9px 14px",
  background: "#fff",
  cursor: "pointer",
};

const summaryGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const summaryCardStyle: React.CSSProperties = {
  border: "1px solid #e5e5e5",
  borderRadius: 12,
  padding: 16,
  background: "#fff",
};

const summaryLabelStyle: React.CSSProperties = {
  fontSize: 13,
  color: "#666",
  marginBottom: 8,
};

const summaryValueStyle: React.CSSProperties = {
  fontSize: 24,
  fontWeight: 700,
};

const sectionStyle: React.CSSProperties = {
  border: "1px solid #e5e5e5",
  borderRadius: 12,
  background: "#fff",
  padding: 16,
};

const sectionHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  marginBottom: 12,
  flexWrap: "wrap",
};

const sectionTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 18,
  fontWeight: 700,
};

const sectionMetaStyle: React.CSSProperties = {
  fontSize: 13,
  color: "#666",
};

const tableWrapStyle: React.CSSProperties = {
  overflowX: "auto",
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  borderBottom: "1px solid #e5e5e5",
  padding: "10px 8px",
  fontSize: 13,
  color: "#666",
  whiteSpace: "nowrap",
};

const thStyleRight: React.CSSProperties = {
  ...thStyle,
  textAlign: "right",
};

const tdStyle: React.CSSProperties = {
  borderBottom: "1px solid #f0f0f0",
  padding: "12px 8px",
  fontSize: 14,
  verticalAlign: "top",
};

const tdStyleRight: React.CSSProperties = {
  ...tdStyle,
  textAlign: "right",
  whiteSpace: "nowrap",
};

const cellTitleStyle: React.CSSProperties = {
  fontWeight: 600,
};

const cellSubStyle: React.CSSProperties = {
  color: "#666",
  fontSize: 12,
  marginTop: 4,
};

const loadingCardStyle: React.CSSProperties = {
  padding: 18,
  borderRadius: 10,
  background: "#fafafa",
};

const emptyCardStyle: React.CSSProperties = {
  padding: 18,
  borderRadius: 10,
  background: "#fafafa",
  color: "#666",
};

const errorCardStyle: React.CSSProperties = {
  padding: 14,
  borderRadius: 10,
  background: "#fff3f3",
  color: "#b00020",
  border: "1px solid #f3caca",
};