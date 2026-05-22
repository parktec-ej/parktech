"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";

type Owner = {
  id: string;
  name: string;
  displayName: string | null;
  postalCode: string | null;
  address1: string | null;
  address2: string | null;
  invoiceNo: string | null;
  bankName: string | null;
  bankBranchName: string | null;
  bankAccountType: string | null;
  bankAccountNo: string | null;
  bankAccountName: string | null;
};

type Agent = Owner;

type SettlementItem = {
  id: string;
  itemType: string;
  grossAmount: number;
  ownerAmount: number;
  agentAmount: number;
  platformAmount: number;
  Payment: {
    id: string;
    grossAmount: number;
    recognizedDate: string;
    serviceDate: string | null;
    spotLabelSnapshot: string | null;
    spotCodeSnapshot: string | null;
    customerNameSnapshot: string | null;
    plateSnapshot: string | null;
  } | null;
  Adjustment: {
    id: string;
    kind: string;
    reason: string | null;
    createdAt: string;
  } | null;
};

type Settlement = {
  id: string;
  month: string;
  status: string;
  taxRateBps: number;
  totalGrossAmount: number;
  totalNetAmount: number;
  totalTaxAmount: number;
  platformFeeNet: number;
  platformFeeTax: number;
  platformFeeGross: number;
  totalOwnerAmount: number;
  totalAgentAmount: number;
  totalPlatformAmount: number;
  ownerPayoutAmount: number;
  monthlyMinFeeAdjustment: number;
  payoutFeeAmount: number;
  ownerPayoutFeeAmount: number;
  agentPayoutFeeAmount: number;
  finalOwnerPayoutAmount: number;
  finalAgentPayoutAmount: number;
  paidAt: string | null;
  Owner: Owner | null;
  Agent: Agent | null;
  Place: {
    id: string;
    slug: string;
    name: string;
    address: string | null;
  } | null;
  SettlementItem: SettlementItem[];
  Payout: Array<{
    id: string;
    payoutTarget: string;
    status: string;
    actualAmount: number;
    executedAt: string | null;
    stripeTransferId: string | null;
  }>;
};

const ISSUER = {
  name: "パークテックイーストジャパン",
  address: "宮城県塩竈市石堂3-7",
  invoiceNo: "T5810943607466",
};

function fmtYen(n: number | null | undefined) {
  if (n == null) return "-";
  return n.toLocaleString("ja-JP") + " 円";
}

function fmtDate(s: string | null | undefined) {
  if (!s) return "";
  const d = new Date(s);
  return d.toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" });
}

function PdfInner() {
  const params = useParams<{ id: string }>();
  const sp = useSearchParams();
  const id = params.id;
  const target = (sp.get("target") ?? "owner") as "owner" | "agent";

  const [data, setData] = useState<Settlement | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const res = await fetch(`/api/admin/settlements/${id}/detail`, {
          cache: "no-store",
        });
        const json = await res.json();
        if (!json.ok) {
          setErr(json.message ?? json.error ?? "読み込みに失敗");
          return;
        }
        setData(json.settlement as Settlement);
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) return <main style={pageStyle}>読み込み中...</main>;
  if (err) return <main style={pageStyle}><div style={errorBox}>{err}</div></main>;
  if (!data) return <main style={pageStyle}>データが見つかりません</main>;

  const isAgent = target === "agent";
  const recipient = isAgent ? data.Agent : data.Owner;
  const finalPayoutAmount = isAgent
    ? data.finalAgentPayoutAmount
    : data.finalOwnerPayoutAmount;
  const payoutFee = isAgent
    ? data.agentPayoutFeeAmount
    : data.ownerPayoutFeeAmount;
  const subtotal = isAgent ? data.totalAgentAmount : data.totalOwnerAmount;

  if (!recipient && isAgent) {
    return (
      <main style={pageStyle}>
        <div style={errorBox}>
          この精算には代理店が紐づいていないため、代理店精算書は発行できません。
        </div>
        <Link href="/admin/settlements">← 一覧へ戻る</Link>
      </main>
    );
  }

  const today = new Date().toLocaleDateString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <main style={pageStyle}>
      {/* Print stylesheet */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: #fff !important; }
          @page { size: A4; margin: 12mm 10mm; }
        }
      `}</style>

      <div className="no-print" style={toolbarStyle}>
        <Link href="/admin/settlements" style={backLinkStyle}>
          ← 精算一覧へ
        </Link>
        <button
          type="button"
          onClick={() => window.print()}
          style={printBtnStyle}
        >
          🖨 PDFとして保存 / 印刷
        </button>
      </div>

      <article style={paperStyle}>
        <header style={headerStyle}>
          <h1 style={titleStyle}>精算書 / 領収書</h1>
          <div style={subTextStyle}>
            <div>発行日: {today}</div>
            <div>精算月: {data.month}</div>
            <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>
              ID: {data.id}
            </div>
          </div>
        </header>

        <div style={addressGridStyle}>
          <div style={addressBoxStyle}>
            <div style={addressLabelStyle}>宛先</div>
            <div style={{ fontSize: 14, fontWeight: 800 }}>
              {recipient?.displayName || recipient?.name || "-"} 様
            </div>
            {recipient?.postalCode && (
              <div style={{ fontSize: 12 }}>〒{recipient.postalCode}</div>
            )}
            <div style={{ fontSize: 12 }}>
              {recipient?.address1 || ""}
              {recipient?.address2 ? ` ${recipient.address2}` : ""}
            </div>
            {recipient?.invoiceNo && (
              <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>
                登録番号: {recipient.invoiceNo}
              </div>
            )}
          </div>

          <div style={addressBoxStyle}>
            <div style={addressLabelStyle}>発行元</div>
            <div style={{ fontSize: 14, fontWeight: 800 }}>{ISSUER.name}</div>
            <div style={{ fontSize: 12 }}>{ISSUER.address}</div>
            <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>
              登録番号: {ISSUER.invoiceNo}
            </div>
          </div>
        </div>

        <div style={totalBoxStyle}>
          <div style={{ fontSize: 12, color: "#6b7280" }}>差引お支払額</div>
          <div style={{ fontSize: 32, fontWeight: 900, marginTop: 4 }}>
            {fmtYen(finalPayoutAmount)}
          </div>
        </div>

        <section style={sectionStyle}>
          <h2 style={sectionTitleStyle}>明細</h2>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>日付</th>
                <th style={thStyle}>区画</th>
                <th style={thStyle}>利用者</th>
                <th style={thStyleRight}>売上</th>
                <th style={thStyleRight}>オーナー分</th>
                <th style={thStyleRight}>代理店分</th>
                <th style={thStyleRight}>PF分</th>
              </tr>
            </thead>
            <tbody>
              {data.SettlementItem.length === 0 ? (
                <tr>
                  <td colSpan={7} style={emptyCellStyle}>
                    明細がありません
                  </td>
                </tr>
              ) : (
                data.SettlementItem.map((it) => {
                  const p = it.Payment;
                  const a = it.Adjustment;
                  const date = p
                    ? fmtDate(p.recognizedDate)
                    : a
                    ? fmtDate(a.createdAt)
                    : "-";
                  const spot = p
                    ? p.spotLabelSnapshot ?? p.spotCodeSnapshot ?? ""
                    : a
                    ? `[${a.kind}]`
                    : "";
                  const customer = p
                    ? p.customerNameSnapshot ?? p.plateSnapshot ?? ""
                    : a?.reason ?? "";
                  return (
                    <tr key={it.id}>
                      <td style={tdStyle}>{date}</td>
                      <td style={tdStyle}>{spot}</td>
                      <td style={tdStyle}>{customer}</td>
                      <td style={tdStyleRight}>{fmtYen(it.grossAmount)}</td>
                      <td style={tdStyleRight}>{fmtYen(it.ownerAmount)}</td>
                      <td style={tdStyleRight}>{fmtYen(it.agentAmount)}</td>
                      <td style={tdStyleRight}>{fmtYen(it.platformAmount)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </section>

        <section style={sectionStyle}>
          <h2 style={sectionTitleStyle}>集計</h2>
          <div style={summaryGridStyle}>
            <SummaryRow label="売上総額" value={fmtYen(data.totalGrossAmount)} />
            <SummaryRow
              label={isAgent ? "代理店分小計" : "オーナー分小計"}
              value={fmtYen(subtotal)}
            />
            {data.monthlyMinFeeAdjustment !== 0 && !isAgent && (
              <SummaryRow
                label="最低利用料調整"
                value={fmtYen(data.monthlyMinFeeAdjustment)}
              />
            )}
            <SummaryRow
              label="振込手数料"
              value={fmtYen(payoutFee)}
              note="（差し引き）"
            />
            <SummaryRow
              label="差引お支払額"
              value={fmtYen(finalPayoutAmount)}
              bold
            />
          </div>
        </section>

        {recipient && (
          <section style={sectionStyle}>
            <h2 style={sectionTitleStyle}>振込先</h2>
            <div style={bankBoxStyle}>
              <div>銀行: {recipient.bankName ?? "-"}</div>
              <div>支店: {recipient.bankBranchName ?? "-"}</div>
              <div>種別: {recipient.bankAccountType ?? "-"}</div>
              <div>口座番号: {recipient.bankAccountNo ?? "-"}</div>
              <div>口座名義: {recipient.bankAccountName ?? "-"}</div>
            </div>
          </section>
        )}

        {data.Payout.filter((p) =>
          isAgent ? p.payoutTarget === "AGENT" : p.payoutTarget === "OWNER"
        ).length > 0 && (
          <section style={sectionStyle}>
            <h2 style={sectionTitleStyle}>振込履歴</h2>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>実行日</th>
                  <th style={thStyle}>状態</th>
                  <th style={thStyleRight}>金額</th>
                  <th style={thStyle}>Stripe Transfer</th>
                </tr>
              </thead>
              <tbody>
                {data.Payout.filter((p) =>
                  isAgent
                    ? p.payoutTarget === "AGENT"
                    : p.payoutTarget === "OWNER"
                ).map((p) => (
                  <tr key={p.id}>
                    <td style={tdStyle}>{fmtDate(p.executedAt)}</td>
                    <td style={tdStyle}>{p.status}</td>
                    <td style={tdStyleRight}>{fmtYen(p.actualAmount)}</td>
                    <td style={{ ...tdStyle, fontFamily: "ui-monospace, monospace", fontSize: 10 }}>
                      {p.stripeTransferId ?? "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        <footer style={footerStyle}>
          <div style={{ fontSize: 11, color: "#6b7280" }}>
            このページはブラウザの印刷機能（Cmd/Ctrl + P）で PDF として保存できます。
          </div>
        </footer>
      </article>
    </main>
  );
}

function SummaryRow({
  label,
  value,
  bold,
  note,
}: {
  label: string;
  value: string;
  bold?: boolean;
  note?: string;
}) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #e5e7eb" }}>
      <span style={{ fontSize: 13, color: "#374151" }}>
        {label}
        {note && <span style={{ color: "#9ca3af", marginLeft: 6 }}>{note}</span>}
      </span>
      <strong style={{ fontSize: bold ? 16 : 13, fontWeight: bold ? 900 : 700 }}>
        {value}
      </strong>
    </div>
  );
}

export default function SettlementPdfPage() {
  return (
    <Suspense fallback={<main style={pageStyle}>読み込み中...</main>}>
      <PdfInner />
    </Suspense>
  );
}

const pageStyle: React.CSSProperties = {
  background: "#f3f4f6",
  minHeight: "100vh",
  padding: "24px 16px",
};
const toolbarStyle: React.CSSProperties = {
  maxWidth: 820,
  margin: "0 auto 16px",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  flexWrap: "wrap",
  gap: 8,
};
const backLinkStyle: React.CSSProperties = {
  color: "#2563eb",
  fontWeight: 700,
  textDecoration: "none",
};
const printBtnStyle: React.CSSProperties = {
  padding: "10px 18px",
  background: "#111",
  color: "#fff",
  border: "1px solid #111",
  borderRadius: 10,
  fontWeight: 800,
  cursor: "pointer",
};
const paperStyle: React.CSSProperties = {
  maxWidth: 820,
  margin: "0 auto",
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  padding: 32,
  boxShadow: "0 8px 30px rgba(0,0,0,0.06)",
};
const headerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  marginBottom: 24,
  paddingBottom: 16,
  borderBottom: "2px solid #111",
};
const titleStyle: React.CSSProperties = {
  fontSize: 24,
  fontWeight: 900,
  margin: 0,
};
const subTextStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#374151",
  textAlign: "right",
};
const addressGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 16,
  marginBottom: 20,
};
const addressBoxStyle: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  padding: 12,
  background: "#fafafa",
};
const addressLabelStyle: React.CSSProperties = {
  fontSize: 11,
  color: "#6b7280",
  fontWeight: 700,
  marginBottom: 4,
};
const totalBoxStyle: React.CSSProperties = {
  border: "2px solid #111",
  borderRadius: 8,
  padding: 16,
  marginBottom: 24,
  textAlign: "right",
  background: "#fafafa",
};
const sectionStyle: React.CSSProperties = {
  marginBottom: 20,
};
const sectionTitleStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 800,
  margin: "0 0 8px",
  padding: "4px 8px",
  background: "#f3f4f6",
  borderLeft: "4px solid #111",
};
const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 12,
};
const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "8px 10px",
  borderBottom: "2px solid #111",
  background: "#fafafa",
  fontSize: 11,
  fontWeight: 700,
};
const thStyleRight: React.CSSProperties = {
  ...thStyle,
  textAlign: "right",
};
const tdStyle: React.CSSProperties = {
  padding: "6px 10px",
  borderBottom: "1px solid #e5e7eb",
};
const tdStyleRight: React.CSSProperties = {
  ...tdStyle,
  textAlign: "right",
  fontVariantNumeric: "tabular-nums",
};
const emptyCellStyle: React.CSSProperties = {
  padding: 16,
  textAlign: "center",
  color: "#6b7280",
  fontSize: 12,
};
const summaryGridStyle: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  padding: "0 14px",
  background: "#fff",
};
const bankBoxStyle: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  padding: 12,
  background: "#fafafa",
  fontSize: 13,
  lineHeight: 1.8,
};
const footerStyle: React.CSSProperties = {
  marginTop: 24,
  paddingTop: 12,
  borderTop: "1px solid #e5e7eb",
  textAlign: "center",
};
const errorBox: React.CSSProperties = {
  background: "#fef2f2",
  border: "1px solid #fecaca",
  color: "#b91c1c",
  padding: 12,
  borderRadius: 10,
  marginBottom: 16,
  fontWeight: 700,
};
