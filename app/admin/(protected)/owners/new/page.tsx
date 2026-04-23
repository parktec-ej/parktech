import type { CSSProperties } from "react";
import { requireAdmin } from "@/lib/admin-auth";

export default async function NewOwnerPage() {
  await requireAdmin();

  return (
    <main style={pageStyle}>
      <h1 style={titleStyle}>オーナー新規登録</h1>

      <form method="post" action="/api/admin/owners/create" style={formCardStyle}>
        <SectionTitle>基本情報</SectionTitle>

        <div style={grid2Style}>
          <FormRow label="名前">
            <input name="name" required style={inputStyle} />
          </FormRow>
          <FormRow label="表示名">
            <input name="displayName" style={inputStyle} />
          </FormRow>
        </div>

        <div style={grid2Style}>
          <FormRow label="メール">
            <input name="email" type="email" required style={inputStyle} />
          </FormRow>
          <FormRow label="電話番号">
            <input name="phone" style={inputStyle} />
          </FormRow>
        </div>

        <div style={grid2Style}>
          <FormRow label="パスワード">
            <input name="password" type="password" required style={inputStyle} />
          </FormRow>
          <FormRow label="状態">
            <select name="status" defaultValue="ACTIVE" style={inputStyle}>
              <option value="ACTIVE">有効</option>
              <option value="INACTIVE">停止</option>
              <option value="SUSPENDED">一時停止</option>
            </select>
          </FormRow>
        </div>

        <div style={grid2Style}>
          <FormRow label="個人/法人">
            <select name="businessType" defaultValue="" style={inputStyle}>
              <option value="">未設定</option>
              <option value="INDIVIDUAL">個人</option>
              <option value="CORPORATION">法人</option>
            </select>
          </FormRow>
          <FormRow label="インボイス番号">
            <input name="invoiceNo" style={inputStyle} />
          </FormRow>
        </div>

        <SectionTitle>住所・契約</SectionTitle>

        <div style={grid2Style}>
          <FormRow label="郵便番号">
            <input name="postalCode" style={inputStyle} />
          </FormRow>
          <FormRow label="住所1">
            <input name="address1" style={inputStyle} />
          </FormRow>
        </div>

        <FormRow label="住所2">
          <input name="address2" style={inputStyle} />
        </FormRow>

        <div style={grid2Style}>
          <FormRow label="契約開始日">
            <input name="contractStartDate" type="date" style={inputStyle} />
          </FormRow>
          <FormRow label="契約終了日">
            <input name="contractEndDate" type="date" style={inputStyle} />
          </FormRow>
        </div>

        <SectionTitle>振込先</SectionTitle>

        <div style={grid2Style}>
          <FormRow label="銀行名">
            <input name="bankName" style={inputStyle} />
          </FormRow>
          <FormRow label="支店名">
            <input name="bankBranchName" style={inputStyle} />
          </FormRow>
        </div>

        <div style={grid3Style}>
          <FormRow label="口座種別">
            <input name="bankAccountType" placeholder="普通 / 当座" style={inputStyle} />
          </FormRow>
          <FormRow label="口座番号">
            <input name="bankAccountNo" style={inputStyle} />
          </FormRow>
          <FormRow label="口座名義">
            <input name="bankAccountName" style={inputStyle} />
          </FormRow>
        </div>

        <FormRow label="メモ">
          <textarea name="notes" rows={4} style={textareaStyle} />
        </FormRow>

        <button type="submit" style={primaryButtonStyle}>
          登録する
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

const titleStyle: CSSProperties = {
  fontSize: 30,
  fontWeight: 900,
  marginBottom: 20,
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