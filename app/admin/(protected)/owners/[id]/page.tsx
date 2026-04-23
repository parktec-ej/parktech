import type { CSSProperties } from "react";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";
import { notFound } from "next/navigation";

function ymd(date: Date | null | undefined) {
  if (!date) return "";
  return new Date(date).toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}

export default async function OwnerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;

  const owner = await prisma.owner.findUnique({
    where: { id },
  });

  if (!owner) return notFound();

  return (
    <main style={pageStyle}>
      <div style={headerRowStyle}>
        <div>
          <h1 style={titleStyle}>オーナー編集</h1>
          <div style={subTextStyle}>
            オーナー情報の更新と、このオーナーに紐づくPLACE追加ができます
          </div>
        </div>

        <Link
          href={`/admin/places/new?ownerId=${owner.id}`}
          style={primaryLinkStyle}
        >
          このオーナーでPLACE新規作成
        </Link>
      </div>

      <form method="post" action={`/api/admin/owners/${owner.id}/update`} style={formCardStyle}>
        <SectionTitle>基本情報</SectionTitle>

        <div style={grid2Style}>
          <FormRow label="名前">
            <input name="name" required defaultValue={owner.name} style={inputStyle} />
          </FormRow>
          <FormRow label="表示名">
            <input name="displayName" defaultValue={owner.displayName ?? ""} style={inputStyle} />
          </FormRow>
        </div>

        <div style={grid2Style}>
          <FormRow label="メール">
            <input name="email" type="email" required defaultValue={owner.email} style={inputStyle} />
          </FormRow>
          <FormRow label="電話番号">
            <input name="phone" defaultValue={owner.phone ?? ""} style={inputStyle} />
          </FormRow>
        </div>

        <div style={grid2Style}>
          <FormRow label="新しいパスワード（変更時のみ）">
            <input name="password" type="password" style={inputStyle} />
          </FormRow>
          <FormRow label="状態">
            <select name="status" defaultValue={owner.status} style={inputStyle}>
              <option value="ACTIVE">有効</option>
              <option value="INACTIVE">停止</option>
              <option value="SUSPENDED">一時停止</option>
            </select>
          </FormRow>
        </div>

        <div style={grid2Style}>
          <FormRow label="個人/法人">
            <select name="businessType" defaultValue={owner.businessType ?? ""} style={inputStyle}>
              <option value="">未設定</option>
              <option value="INDIVIDUAL">個人</option>
              <option value="CORPORATION">法人</option>
            </select>
          </FormRow>
          <FormRow label="インボイス番号">
            <input name="invoiceNo" defaultValue={owner.invoiceNo ?? ""} style={inputStyle} />
          </FormRow>
        </div>

        <SectionTitle>住所・契約</SectionTitle>

        <div style={grid2Style}>
          <FormRow label="郵便番号">
            <input name="postalCode" defaultValue={owner.postalCode ?? ""} style={inputStyle} />
          </FormRow>
          <FormRow label="住所1">
            <input name="address1" defaultValue={owner.address1 ?? ""} style={inputStyle} />
          </FormRow>
        </div>

        <FormRow label="住所2">
          <input name="address2" defaultValue={owner.address2 ?? ""} style={inputStyle} />
        </FormRow>

        <div style={grid2Style}>
          <FormRow label="契約開始日">
            <input
              name="contractStartDate"
              type="date"
              defaultValue={ymd(owner.contractStartDate)}
              style={inputStyle}
            />
          </FormRow>
          <FormRow label="契約終了日">
            <input
              name="contractEndDate"
              type="date"
              defaultValue={ymd(owner.contractEndDate)}
              style={inputStyle}
            />
          </FormRow>
        </div>

        <SectionTitle>振込先</SectionTitle>

        <div style={grid2Style}>
          <FormRow label="銀行名">
            <input name="bankName" defaultValue={owner.bankName ?? ""} style={inputStyle} />
          </FormRow>
          <FormRow label="支店名">
            <input name="bankBranchName" defaultValue={owner.bankBranchName ?? ""} style={inputStyle} />
          </FormRow>
        </div>

        <div style={grid3Style}>
          <FormRow label="口座種別">
            <input
              name="bankAccountType"
              defaultValue={owner.bankAccountType ?? ""}
              style={inputStyle}
            />
          </FormRow>
          <FormRow label="口座番号">
            <input
              name="bankAccountNo"
              defaultValue={owner.bankAccountNo ?? ""}
              style={inputStyle}
            />
          </FormRow>
          <FormRow label="口座名義">
            <input
              name="bankAccountName"
              defaultValue={owner.bankAccountName ?? ""}
              style={inputStyle}
            />
          </FormRow>
        </div>

        <FormRow label="メモ">
          <textarea name="notes" rows={4} defaultValue={owner.notes ?? ""} style={textareaStyle} />
        </FormRow>

        <button type="submit" style={primaryButtonStyle}>
          更新する
        </button>
      </form>
    </main>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 style={sectionTitleStyle}>{children}</h2>;
}

function FormRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "block", marginBottom: 16 }}>
      <div style={labelStyle}>{label}</div>
      {children}
    </label>
  );
}

const pageStyle: CSSProperties = {
  maxWidth: 900,
  margin: "0 auto",
  padding: 24,
};

const headerRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 16,
  flexWrap: "wrap",
  marginBottom: 20,
};

const titleStyle: CSSProperties = {
  fontSize: 30,
  fontWeight: 900,
  marginBottom: 8,
};

const subTextStyle: CSSProperties = {
  fontSize: 14,
  color: "#666",
};

const sectionTitleStyle: CSSProperties = {
  fontSize: 18,
  fontWeight: 800,
  margin: "8px 0 16px",
};

const formCardStyle: CSSProperties = {
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 16,
  padding: 20,
};

const labelStyle: CSSProperties = {
  fontSize: 13,
  color: "#666",
  marginBottom: 6,
};

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #d1d5db",
  fontSize: 14,
};

const textareaStyle: CSSProperties = {
  ...inputStyle,
  resize: "vertical",
};

const grid2Style: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 16,
};

const grid3Style: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 16,
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
  whiteSpace: "nowrap",
};