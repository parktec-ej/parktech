import type { CSSProperties } from "react";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";

type AssignmentRow = {
  id: string;
  ownerRateBps: number;
  agentRateBps: number;
  platformRateBps: number;
  startsAt: Date;
  endsAt: Date | null;
  isActive: boolean;
  place: {
    id: string;
    name: string;
    slug: string;
  };
  owner: {
    id: string;
    name: string;
  };
  agent: {
    id: string;
    name: string;
  } | null;
};

function fmtPct(bps: number) {
  return `${(bps / 100).toFixed(2)}%`;
}

function fmtDate(d: Date | null | undefined) {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}

export default async function AssignmentsPage({
  searchParams,
}: {
  searchParams?: Promise<{ created?: string; updated?: string }>;
}) {
  await requireAdmin();
  const sp = (await searchParams) ?? {};

  const rows: AssignmentRow[] = await prisma.placeAssignment.findMany({
    include: {
      place: { select: { id: true, name: true, slug: true } },
      owner: { select: { id: true, name: true } },
      agent: { select: { id: true, name: true } },
    },
    orderBy: [{ placeId: "asc" }, { startsAt: "desc" }],
  });

  return (
    <main style={pageStyle}>
      <div style={headerStyle}>
        <div>
          <h1 style={titleStyle}>料率・帰属設定</h1>
          <div style={subStyle}>Placeごとの Owner / Agent / 率の適用ルール</div>
        </div>
        <Link href="/admin/assignments/new" style={primaryLinkStyle}>
          新規登録
        </Link>
      </div>

      {(sp.created === "1" || sp.updated === "1") && (
        <div style={noticeStyle}>
          {sp.created === "1" && <div>PlaceAssignment を作成しました。</div>}
          {sp.updated === "1" && <div>PlaceAssignment を更新しました。</div>}
        </div>
      )}

      <section style={cardStyle}>
        {rows.length === 0 ? (
          <div style={{ color: "#666" }}>まだ設定がありません。</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Place</th>
                  <th style={thStyle}>Owner</th>
                  <th style={thStyle}>Agent</th>
                  <th style={thStyle}>Owner率</th>
                  <th style={thStyle}>Agent率</th>
                  <th style={thStyle}>本部率</th>
                  <th style={thStyle}>開始日</th>
                  <th style={thStyle}>終了日</th>
                  <th style={thStyle}>状態</th>
                  <th style={thStyle}>編集</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row: AssignmentRow) => (
                  <tr key={row.id}>
                    <td style={tdStyle}>{row.place.name}</td>
                    <td style={tdStyle}>{row.owner.name}</td>
                    <td style={tdStyle}>{row.agent?.name ?? "-"}</td>
                    <td style={tdStyle}>{fmtPct(row.ownerRateBps)}</td>
                    <td style={tdStyle}>{fmtPct(row.agentRateBps)}</td>
                    <td style={tdStyle}>{fmtPct(row.platformRateBps)}</td>
                    <td style={tdStyle}>{fmtDate(row.startsAt)}</td>
                    <td style={tdStyle}>{fmtDate(row.endsAt)}</td>
                    <td style={tdStyle}>{row.isActive ? "有効" : "無効"}</td>
                    <td style={tdStyle}>
                      <Link href={`/admin/assignments/${row.id}`} style={smallLinkStyle}>
                        編集
                      </Link>
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

const pageStyle: CSSProperties = {
  maxWidth: 1100,
  margin: "0 auto",
  padding: 24,
};

const headerStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 16,
  marginBottom: 20,
};

const titleStyle: CSSProperties = {
  fontSize: 30,
  fontWeight: 900,
  marginBottom: 6,
};

const subStyle: CSSProperties = {
  color: "#666",
};

const cardStyle: CSSProperties = {
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 16,
  padding: 16,
};

const noticeStyle: CSSProperties = {
  ...cardStyle,
  marginBottom: 16,
  background: "#f8fafc",
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

const primaryLinkStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 10,
  padding: "10px 14px",
  background: "#111827",
  color: "#fff",
  fontWeight: 700,
  textDecoration: "none",
};

const smallLinkStyle: CSSProperties = {
  color: "#111827",
  fontWeight: 700,
  textDecoration: "none",
};