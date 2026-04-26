import Link from "next/link";
import type { CSSProperties } from "react";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";

type AssignmentRow = {
  id: string;
  placeId: string;
  ownerId: string;
  agentId: string | null;
  ownerRateBps: number;
  agentRateBps: number;
  platformRateBps: number;
  startsAt: Date;
  endsAt: Date | null;
  isActive: boolean;
  note: string | null;

  Place: {
    id: string;
    name: string;
    slug: string;
  };

  Owner: {
    id: string;
    name: string;
  };

  Agent: {
    id: string;
    name: string | null;
  } | null;
};

function ymd(date: Date | null) {
  if (!date) return "-";
  return new Date(date).toLocaleDateString("ja-JP");
}

function rate(bps: number) {
  return `${(bps / 100).toFixed(2)}%`;
}

export default async function AssignmentsPage() {
  await requireAdmin();

  const rows = (await prisma.placeAssignment.findMany({
    include: {
      Place: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
      Owner: {
        select: {
          id: true,
          name: true,
        },
      },
      Agent: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: [{ isActive: "desc" }, { startsAt: "desc" }],
  })) as AssignmentRow[];

  return (
    <div style={pageStyle}>
      <div style={headerStyle}>
        <div>
          <h1 style={titleStyle}>配分契約管理</h1>
          <p style={subStyle}>駐車場ごとのオーナー・代理店・本部配分設定</p>
        </div>

        <Link href="/admin/assignments/new" style={buttonStyle}>
          新規契約登録
        </Link>
      </div>

      <div style={cardStyle}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={th}>状態</th>
              <th style={th}>駐車場</th>
              <th style={th}>オーナー</th>
              <th style={th}>代理店</th>
              <th style={th}>オーナー率</th>
              <th style={th}>代理店率</th>
              <th style={th}>本部率</th>
              <th style={th}>開始日</th>
              <th style={th}>終了日</th>
              <th style={th}>操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td style={td}>{row.isActive ? "有効" : "停止"}</td>
                <td style={td}>{row.Place.name}</td>
                <td style={td}>{row.Owner.name}</td>
                <td style={td}>{row.Agent?.name ?? "-"}</td>
                <td style={td}>{rate(row.ownerRateBps)}</td>
                <td style={td}>{rate(row.agentRateBps)}</td>
                <td style={td}>{rate(row.platformRateBps)}</td>
                <td style={td}>{ymd(row.startsAt)}</td>
                <td style={td}>{ymd(row.endsAt)}</td>
                <td style={td}>
                  <Link
                    href={`/admin/assignments/${row.id}`}
                    style={miniButton}
                  >
                    編集
                  </Link>
                </td>
              </tr>
            ))}

            {rows.length === 0 && (
              <tr>
                <td colSpan={10} style={emptyStyle}>
                  契約データがありません
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const pageStyle: CSSProperties = {
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
  fontSize: 28,
  fontWeight: 800,
  margin: 0,
};

const subStyle: CSSProperties = {
  color: "#6b7280",
  marginTop: 8,
};

const cardStyle: CSSProperties = {
  background: "#fff",
  borderRadius: 16,
  border: "1px solid #e5e7eb",
  padding: 16,
  overflowX: "auto",
};

const tableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
};

const th: CSSProperties = {
  textAlign: "left",
  padding: 12,
  borderBottom: "1px solid #e5e7eb",
  color: "#6b7280",
  fontSize: 13,
};

const td: CSSProperties = {
  padding: 12,
  borderBottom: "1px solid #f1f5f9",
};

const buttonStyle: CSSProperties = {
  background: "#111827",
  color: "#fff",
  padding: "12px 16px",
  borderRadius: 12,
  textDecoration: "none",
  fontWeight: 700,
};

const miniButton: CSSProperties = {
  background: "#111827",
  color: "#fff",
  padding: "8px 12px",
  borderRadius: 10,
  textDecoration: "none",
  fontWeight: 700,
};

const emptyStyle: CSSProperties = {
  textAlign: "center",
  padding: 24,
  color: "#6b7280",
};