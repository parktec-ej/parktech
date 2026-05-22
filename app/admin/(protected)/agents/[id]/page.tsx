import type { CSSProperties } from "react";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";
import { notFound } from "next/navigation";
import StripeConnectSection from "@/app/admin/(protected)/connect/_components/StripeConnectSection";

export default async function AgentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;

  const agent = await prisma.agent.findUnique({
    where: { id },
  });

  if (!agent) return notFound();

  return (
    <main style={pageStyle}>
      <h1 style={titleStyle}>代理店編集</h1>

      <StripeConnectSection
        targetType="agent"
        targetId={agent.id}
        stripeAccountId={agent.stripeAccountId}
        stripeOnboardingComplete={agent.stripeOnboardingComplete}
      />

      <form method="post" action={`/api/admin/agents/${agent.id}/update`} style={formCardStyle}>
        <SectionTitle>基本情報</SectionTitle>

        <div style={grid2Style}>
          <FormRow label="代理店名">
            <input name="name" required defaultValue={agent.name} style={inputStyle} />
          </FormRow>
          <FormRow label="表示名">
            <input name="displayName" defaultValue={agent.displayName ?? ""} style={inputStyle} />
          </FormRow>
        </div>

        <div style={grid2Style}>
          <FormRow label="メール">
            <input name="email" type="email" defaultValue={agent.email ?? ""} style={inputStyle} />
          </FormRow>
          <FormRow label="電話番号">
            <input name="phone" defaultValue={agent.phone ?? ""} style={inputStyle} />
          </FormRow>
        </div>

        <div style={grid2Style}>
          <FormRow label="新しいパスワード（変更時のみ）">
            <input name="password" type="password" style={inputStyle} />
          </FormRow>
          <FormRow label="状態">
            <select name="status" defaultValue={agent.status} style={inputStyle}>
              <option value="ACTIVE">有効</option>
              <option value="INACTIVE">停止</option>
              <option value="SUSPENDED">一時停止</option>
            </select>
          </FormRow>
        </div>

        <div style={grid2Style}>
          <FormRow label="標準代理店率 (bps)">
            <input
              name="defaultAgentRateBps"
              type="number"
              required
              defaultValue={agent.defaultAgentRateBps}
              style={inputStyle}
            />
          </FormRow>
          <FormRow label="インボイス番号">
            <input name="invoiceNo" defaultValue={agent.invoiceNo ?? ""} style={inputStyle} />
          </FormRow>
        </div>

        <SectionTitle>住所</SectionTitle>

        <div style={grid2Style}>
          <FormRow label="郵便番号">
            <input name="postalCode" defaultValue={agent.postalCode ?? ""} style={inputStyle} />
          </FormRow>
          <FormRow label="住所1">
            <input name="address1" defaultValue={agent.address1 ?? ""} style={inputStyle} />
          </FormRow>
        </div>

        <FormRow label="住所2">
          <input name="address2" defaultValue={agent.address2 ?? ""} style={inputStyle} />
        </FormRow>

        <SectionTitle>振込先</SectionTitle>

        <div style={grid2Style}>
          <FormRow label="銀行名">
            <input name="bankName" defaultValue={agent.bankName ?? ""} style={inputStyle} />
          </FormRow>
          <FormRow label="支店名">
            <input name="bankBranchName" defaultValue={agent.bankBranchName ?? ""} style={inputStyle} />
          </FormRow>
        </div>

        <div style={grid3Style}>
          <FormRow label="口座種別">
            <input
              name="bankAccountType"
              defaultValue={agent.bankAccountType ?? ""}
              style={inputStyle}
            />
          </FormRow>
          <FormRow label="口座番号">
            <input
              name="bankAccountNo"
              defaultValue={agent.bankAccountNo ?? ""}
              style={inputStyle}
            />
          </FormRow>
          <FormRow label="口座名義">
            <input
              name="bankAccountName"
              defaultValue={agent.bankAccountName ?? ""}
              style={inputStyle}
            />
          </FormRow>
        </div>

        <FormRow label="メモ">
          <textarea name="notes" rows={4} defaultValue={agent.notes ?? ""} style={textareaStyle} />
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