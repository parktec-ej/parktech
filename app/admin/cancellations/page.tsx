"use client";

import { useEffect, useMemo, useState } from "react";

type CancellationRow = {
  id: string;
  date: string;
  slot: string;
  placeName: string;
  spotLabel: string;
  name: string;
  plate: string;
  price: number;
  status: string;
  refundStatus: string;
  refundAmount: number;
  canceledAt: string | null;
  canceledAtJst: string | null;
  createdAt: string;
  createdAtJst: string | null;
  payment: {
    id: string;
    paymentRef: string | null;
    paymentIntentId: string | null;
    grossAmount: number;
    refunded: boolean;
    createdAt: string;
    createdAtJst: string | null;
  } | null;
  adjustment: {
    id: string;
    kind: string;
    status: string;
    grossDeltaAmount: number;
    recognizedMonth: string;
    reason: string;
    note: string | null;
    createdAt: string;
    createdAtJst: string | null;
  } | null;
};

type ApiResponse = {
  ok: boolean;
  month: string | null;
  filterStatus: string;
  summary: {
    total: number;
    succeeded: number;
    failed: number;
    notRequired: number;
    pending: number;
    none: number;
    refundTotal: number;
  };
  items: CancellationRow[];
  message?: string;
};

const FILTERS = [
  { key: "all", label: "全部" },
  { key: "SUCCEEDED", label: "返金成功" },
  { key: "FAILED", label: "返金失敗" },
  { key: "NOT_REQUIRED", label: "返金不要" },
  { key: "PENDING", label: "返金保留" },
  { key: "NONE", label: "未設定" },
];

function currentMonth() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function yen(value: number | null | undefined) {
  return `${Number(value ?? 0).toLocaleString("ja-JP")}円`;
}

export default function AdminCancellationsPage() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<CancellationRow[]>([]);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("all");
  const [month, setMonth] = useState(currentMonth());
  const [summary, setSummary] = useState<ApiResponse["summary"] | null>(null);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    params.set("status", status);
    if (month) params.set("month", month);
    params.set("limit", "300");
    return params.toString();
  }, [status, month]);

  async function load() {
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`/api/admin/cancellations?${query}`, {
        cache: "no-store",
      });

      const json: ApiResponse = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.message || "取得に失敗しました");
      }

      setItems(json.items || []);
      setSummary(json.summary || null);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      setItems([]);
      setSummary(null);
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
        maxWidth: 1400,
        margin: "32px auto",
        padding: "0 20px 40px",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <h1 style={{ fontSize: 30, fontWeight: 900, marginBottom: 20 }}>
        キャンセル / 返金管理
      </h1>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
          gap: 12,
          marginBottom: 20,
        }}
      >
        <div style={cardStyle}>
          <div style={labelStyle}>件数</div>
          <div style={valueStyle}>{summary?.total ?? 0}</div>
        </div>
        <div style={cardStyle}>
          <div style={labelStyle}>返金成功</div>
          <div style={valueStyle}>{summary?.succeeded ?? 0}</div>
        </div>
        <div style={cardStyle}>
          <div style={labelStyle}>返金失敗</div>
          <div style={valueStyle}>{summary?.failed ?? 0}</div>
        </div>
        <div style={cardStyle}>
          <div style={labelStyle}>返金不要</div>
          <div style={valueStyle}>{summary?.notRequired ?? 0}</div>
        </div>
        <div style={cardStyle}>
          <div style={labelStyle}>返金保留</div>
          <div style={valueStyle}>{summary?.pending ?? 0}</div>
        </div>
        <div style={cardStyle}>
          <div style={labelStyle}>返金総額</div>
          <div style={valueStyle}>{yen(summary?.refundTotal ?? 0)}</div>
        </div>
      </section>

      <section
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 16,
          padding: 16,
          background: "#fff",
          marginBottom: 20,
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 12,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <div>
            <label style={filterLabelStyle}>月</label>
            <br />
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              style={inputStyle}
            />
          </div>

          <div>
            <label style={filterLabelStyle}>状態</label>
            <br />
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              style={inputStyle}
            >
              {FILTERS.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>

          <button onClick={() => void load()} style={buttonStyle}>
            再読み込み
          </button>
        </div>
      </section>

      <section
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 16,
          background: "#fff",
          overflow: "hidden",
        }}
      >
        {loading ? (
          <div style={{ padding: 20 }}>読み込み中...</div>
        ) : error ? (
          <div style={{ padding: 20, color: "#b00020" }}>{error}</div>
        ) : items.length === 0 ? (
          <div style={{ padding: 20 }}>対象データはありません。</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 14,
              }}
            >
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  {[
                    "利用日",
                    "駐車場",
                    "区画",
                    "氏名",
                    "車番",
                    "予約額",
                    "返金額",
                    "返金状態",
                    "キャンセル日時",
                    "Payment",
                    "Adjustment",
                  ].map((h) => (
                    <th key={h} style={thStyle}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={row.id} style={{ borderTop: "1px solid #eee" }}>
                    <td style={tdStyle}>{row.date}</td>
                    <td style={tdStyle}>{row.placeName}</td>
                    <td style={tdStyle}>{row.spotLabel}</td>
                    <td style={tdStyle}>{row.name}</td>
                    <td style={tdStyle}>{row.plate}</td>
                    <td style={tdStyle}>{yen(row.price)}</td>
                    <td style={tdStyle}>{yen(row.refundAmount)}</td>
                    <td style={tdStyle}>
                      <span style={badgeStyle(row.refundStatus)}>
                        {row.refundStatus}
                      </span>
                    </td>
                    <td style={tdStyle}>{row.canceledAtJst ?? "-"}</td>
                    <td style={tdStyle}>
                      {row.payment ? (
                        <div style={{ lineHeight: 1.6 }}>
                          <div>ID: {row.payment.id}</div>
                          <div>refunded: {String(row.payment.refunded)}</div>
                          <div>
                            amount: {yen(row.payment.grossAmount)}
                          </div>
                        </div>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td style={tdStyle}>
                      {row.adjustment ? (
                        <div style={{ lineHeight: 1.6 }}>
                          <div>{row.adjustment.kind}</div>
                          <div>
                            {yen(row.adjustment.grossDeltaAmount)}
                          </div>
                          <div>{row.adjustment.reason}</div>
                        </div>
                      ) : (
                        "-"
                      )}
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

const cardStyle: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 16,
  background: "#fff",
  padding: 16,
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#666",
  marginBottom: 6,
};

const valueStyle: React.CSSProperties = {
  fontSize: 24,
  fontWeight: 900,
};

const filterLabelStyle: React.CSSProperties = {
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

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "12px 10px",
  fontWeight: 800,
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  padding: "12px 10px",
  verticalAlign: "top",
  whiteSpace: "nowrap",
};

function badgeStyle(status: string): React.CSSProperties {
  const common: React.CSSProperties = {
    display: "inline-block",
    padding: "4px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 800,
  };

  if (status === "SUCCEEDED") {
    return {
      ...common,
      background: "#dcfce7",
      color: "#166534",
    };
  }

  if (status === "FAILED") {
    return {
      ...common,
      background: "#fee2e2",
      color: "#991b1b",
    };
  }

  if (status === "NOT_REQUIRED") {
    return {
      ...common,
      background: "#e5e7eb",
      color: "#374151",
    };
  }

  if (status === "PENDING") {
    return {
      ...common,
      background: "#fef3c7",
      color: "#92400e",
    };
  }

  return {
    ...common,
    background: "#e0e7ff",
    color: "#3730a3",
  };
}
