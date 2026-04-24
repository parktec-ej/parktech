import Link from "next/link";
import type { CSSProperties } from "react";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";

type OwnerItem = {
  id: string;
  name: string | null;
  displayName: string | null;
  email: string | null;
  phone: string | null;
  registeredAt: Date;
  bankName: string | null;
  bankBranchName: string | null;
};

export default async function OwnersPage({
  searchParams,
}: {
  searchParams?: Promise<{ created?: string; updated?: string }>;
}) {
  await requireAdmin();
  const sp = (await searchParams) ?? {};

  const owners: OwnerItem[] = await prisma.owner.findMany({
    orderBy: { registeredAt: "desc" },
    select: {
      id: true,
      name: true,
      displayName: true,
      email: true,
      phone: true,
      registeredAt: true,
      bankName: true,
      bankBranchName: true,
    },
  });

  return (
    <div style={pageStyle}>
      <div style={headerRowStyle}>
        <div>
          <h1 style={titleStyle}>オーナー管理</h1>
          <p style={subtitleStyle}>登録情報・振込先・状態を管理</p>
        </div>
        <Link href="/admin/owners/new" style={primaryButtonStyle}>
          新規登録
        </Link>
      </div>

      {(sp.created === "1" || sp.updated === "1") && (
        <div style={noticeStyle}>
          {sp.created === "1" && <div>オーナーを登録しました。</div>}
          {sp.updated === "1" && <div>オーナー情報を更新しました。</div>}
        </div>
      )}

      <section style={cardStyle}>
        <div style={tableWrapStyle}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>登録日</th>
                <th style={thStyle}>名前</th>
                <th style={thStyle}>表示名</th>
                <th style={thStyle}>メール</th>
                <th style={thStyle}>電話</th>
                <th style={thStyle}>振込先</th>
                <th style={thStyle}>操作</th>
              </tr>
            </thead>

            <tbody>
              {owners.length === 0 ? (
                <tr>
                  <td style={emptyStyle} colSpan={7}>
                    オーナーがまだ登録されていません。
                  </td>
                </tr>
              ) : (
                owners.map((owner: OwnerItem) => (
                  <tr key={owner.id}>
                    <td style={tdStyle}>{formatDate(owner.registeredAt)}</td>
                    <td style={tdStyle}>{owner.name || "-"}</td>
                    <td style={tdStyle}>{owner.displayName || "-"}</td>
                    <td style={tdStyle}>{owner.email || "-"}</td>
                    <td style={tdStyle}>{owner.phone || "-"}</td>
                    <td style={tdStyle}>
                      {[owner.bankName, owner.bankBranchName]
                        .filter(Boolean)
                        .join(" ") || "-"}
                    </td>
                    <td style={tdStyle}>
                      <Link
                        href={`/admin/owners/${owner.id}`}
                        style={editButtonStyle}
                      >
                        編集
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

const pageStyle: CSSProperties = {
  padding: 24,
};

const headerRowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 16,
  marginBottom: 20,
  flexWrap: "wrap",
};

const titleStyle: CSSProperties = {
  fontSize: 28,
  fontWeight: 800,
  margin: 0,
};

const subtitleStyle: CSSProperties = {
  marginTop: 8,
  color: "#6b7280",
  fontSize: 14,
};

const cardStyle: CSSProperties = {
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 16,
  padding: 16,
};

const noticeStyle: CSSProperties = {
  background: "#f8fafc",
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  padding: "12px 14px",
  marginBottom: 16,
  color: "#111827",
  fontWeight: 600,
};

const tableWrapStyle: CSSProperties = {
  overflowX: "auto",
};

const tableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  minWidth: 840,
};

const thStyle: CSSProperties = {
  textAlign: "left",
  padding: "12px 10px",
  borderBottom: "1px solid #e5e7eb",
  fontSize: 13,
  color: "#6b7280",
  fontWeight: 700,
  whiteSpace: "nowrap",
};

const tdStyle: CSSProperties = {
  padding: "14px 10px",
  borderBottom: "1px solid #f1f5f9",
  verticalAlign: "middle",
  whiteSpace: "nowrap",
};

const emptyStyle: CSSProperties = {
  padding: 24,
  textAlign: "center",
  color: "#6b7280",
};

const primaryButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 12,
  padding: "12px 18px",
  background: "#0f172a",
  color: "#fff",
  textDecoration: "none",
  fontWeight: 800,
};

const editButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: 72,
  borderRadius: 10,
  padding: "8px 12px",
  background: "#111827",
  color: "#fff",
  fontWeight: 700,
  textDecoration: "none",
};