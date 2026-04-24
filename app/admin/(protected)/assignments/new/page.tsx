import type { CSSProperties } from "react";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";

type PlaceItem = {
  id: string;
  name: string;
  slug: string;
};

type OwnerItem = {
  id: string;
  name: string;
};

type AgentItem = {
  id: string;
  name: string;
  defaultAgentRateBps: number;
};

export default async function NewAssignmentPage() {
  await requireAdmin();

  const [places, owners, agents]: [PlaceItem[], OwnerItem[], AgentItem[]] =
    await Promise.all([
      prisma.place.findMany({
        where: { isActive: true },
        select: { id: true, name: true, slug: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.owner.findMany({
        where: { status: "ACTIVE" },
        select: { id: true, name: true },
        orderBy: { registeredAt: "asc" },
      }),
      prisma.agent.findMany({
        where: { status: "ACTIVE" },
        select: { id: true, name: true, defaultAgentRateBps: true },
        orderBy: { registeredAt: "asc" },
      }),
    ]);

  return (
    <main style={pageStyle}>
      <h1 style={titleStyle}>PlaceAssignment 新規登録</h1>

      <form
        method="post"
        action="/api/admin/assignments/create"
        style={formCardStyle}
      >
        <FormRow label="Place">
          <select name="placeId" required style={inputStyle}>
            <option value="">選択してください</option>
            {places.map((p: PlaceItem) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.slug})
              </option>
            ))}
          </select>
        </FormRow>

        <FormRow label="Owner">
          <select name="ownerId" required style={inputStyle}>
            <option value="">選択してください</option>
            {owners.map((o: OwnerItem) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </FormRow>

        <FormRow label="Agent">
          <select name="agentId" style={inputStyle}>
            <option value="">なし</option>
            {agents.map((a: AgentItem) => (
              <option key={a.id} value={a.id}>
                {a.name}（標準 {(a.defaultAgentRateBps / 100).toFixed(2)}%）
              </option>
            ))}
          </select>
        </FormRow>

        <div style={grid3Style}>
          <FormRow label="Owner率 (bps)">
            <input
              name="ownerRateBps"
              type="number"
              defaultValue={8000}
              required
              style={inputStyle}
            />
          </FormRow>

          <FormRow label="Agent率 (bps)">
            <input
              name="agentRateBps"
              type="number"
              defaultValue={0}
              required
              style={inputStyle}
            />
          </FormRow>

          <FormRow label="本部率 (bps)">
            <input
              name="platformRateBps"
              type="number"
              defaultValue={2000}
              required
              style={inputStyle}
            />
          </FormRow>
        </div>

        <div style={grid2Style}>
          <FormRow label="適用開始日">
            <input
              name="startsAt"
              type="date"
              required
              defaultValue={new Date().toLocaleDateString("sv-SE", {
                timeZone: "Asia/Tokyo",
              })}
              style={inputStyle}
            />
          </FormRow>

          <FormRow label="適用終了日">
            <input name="endsAt" type="date" style={inputStyle} />
          </FormRow>
        </div>

        <label style={checkboxRowStyle}>
          <input name="isActive" type="checkbox" defaultChecked />
          <span>有効にする</span>
        </label>

        <FormRow label="メモ">
          <textarea name="note" rows={4} style={textareaStyle} />
        </FormRow>

        <div style={{ fontSize: 13, color: "#666", marginBottom: 16 }}>
          合計は 10000 bps（100.00%）にしてください。過去Paymentは変更されません。
        </div>

        <button type="submit" style={primaryButtonStyle}>
          登録する
        </button>
      </form>
    </main>
  );
}

function FormRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "block" }}>
      <div style={labelStyle}>{label}</div>
      {children}
    </label>
  );
}

const pageStyle: CSSProperties = {
  maxWidth: 860,
  margin: "0 auto",
  padding: 24,
};

const titleStyle: CSSProperties = {
  fontSize: 30,
  fontWeight: 900,
  marginBottom: 20,
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
  marginTop: 16,
  marginBottom: 16,
};

const grid3Style: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 16,
  marginTop: 16,
  marginBottom: 16,
};

const checkboxRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  marginBottom: 16,
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