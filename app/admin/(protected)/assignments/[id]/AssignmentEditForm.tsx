"use client";

import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";

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

type AssignmentInput = {
  id: string;
  placeId: string;
  ownerId: string;
  agentId: string;
  ownerRateBps: number;
  agentRateBps: number;
  platformRateBps: number;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
  note: string;
};

export default function AssignmentEditForm({
  assignment,
  places,
  owners,
  agents,
}: {
  assignment: AssignmentInput;
  places: PlaceItem[];
  owners: OwnerItem[];
  agents: AgentItem[];
}) {
  const [placeId, setPlaceId] = useState(assignment.placeId);
  const [ownerId, setOwnerId] = useState(assignment.ownerId);
  const [agentId, setAgentId] = useState(assignment.agentId);

  const [ownerRateBps, setOwnerRateBps] = useState<number>(assignment.ownerRateBps);
  const [agentRateBps, setAgentRateBps] = useState<number>(assignment.agentRateBps);
  const [platformRateBps, setPlatformRateBps] = useState<number>(assignment.platformRateBps);

  const [startsAt, setStartsAt] = useState(assignment.startsAt);
  const [endsAt, setEndsAt] = useState(assignment.endsAt);
  const [isActive, setIsActive] = useState(assignment.isActive);
  const [note, setNote] = useState(assignment.note);

  const totalBps = useMemo(
    () => ownerRateBps + agentRateBps + platformRateBps,
    [ownerRateBps, agentRateBps, platformRateBps]
  );

  const totalOk = totalBps === 10000;

  const totalPct = (totalBps / 100).toFixed(2);
  const ownerPct = (ownerRateBps / 100).toFixed(2);
  const agentPct = (agentRateBps / 100).toFixed(2);
  const platformPct = (platformRateBps / 100).toFixed(2);

  useEffect(() => {
    if (!agentId) {
      setAgentRateBps(0);
      return;
    }

    const selected = agents.find((a) => a.id === agentId);
    if (!selected) return;

    const nextAgent = selected.defaultAgentRateBps ?? 0;
    setAgentRateBps(nextAgent);
    setPlatformRateBps(Math.max(0, 10000 - ownerRateBps - nextAgent));
  }, [agentId, agents]);

  function onChangeOwnerRate(next: number) {
    setOwnerRateBps(next);
    setPlatformRateBps(Math.max(0, 10000 - next - agentRateBps));
  }

  function onChangeAgentRate(next: number) {
    setAgentRateBps(next);
    setPlatformRateBps(Math.max(0, 10000 - ownerRateBps - next));
  }

  function onChangePlatformRate(next: number) {
    setPlatformRateBps(next);
  }

  return (
    <main style={pageStyle}>
      <h1 style={titleStyle}>PlaceAssignment 編集</h1>

      <form
        method="post"
        action={`/api/admin/assignments/${assignment.id}/update`}
        style={formCardStyle}
      >
        <FormRow label="Place">
          <select
            name="placeId"
            required
            style={inputStyle}
            value={placeId}
            onChange={(e) => setPlaceId(e.target.value)}
          >
            {places.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.slug})
              </option>
            ))}
          </select>
        </FormRow>

        <FormRow label="Owner">
          <select
            name="ownerId"
            required
            style={inputStyle}
            value={ownerId}
            onChange={(e) => setOwnerId(e.target.value)}
          >
            {owners.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </FormRow>

        <FormRow label="Agent">
          <select
            name="agentId"
            style={inputStyle}
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
          >
            <option value="">なし</option>
            {agents.map((a) => (
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
              required
              value={ownerRateBps}
              onChange={(e) => onChangeOwnerRate(Number(e.target.value || 0))}
              style={inputStyle}
            />
            <div style={subTextStyle}>{ownerPct}%</div>
          </FormRow>

          <FormRow label="Agent率 (bps)">
            <input
              name="agentRateBps"
              type="number"
              required
              value={agentRateBps}
              onChange={(e) => onChangeAgentRate(Number(e.target.value || 0))}
              style={inputStyle}
            />
            <div style={subTextStyle}>{agentPct}%</div>
          </FormRow>

          <FormRow label="本部率 (bps)">
            <input
              name="platformRateBps"
              type="number"
              required
              value={platformRateBps}
              onChange={(e) => onChangePlatformRate(Number(e.target.value || 0))}
              style={inputStyle}
            />
            <div style={subTextStyle}>{platformPct}%</div>
          </FormRow>
        </div>

        <div
          style={{
            ...sumBoxStyle,
            background: totalOk ? "#ecfdf5" : "#fef2f2",
            borderColor: totalOk ? "#a7f3d0" : "#fecaca",
            color: totalOk ? "#166534" : "#b91c1c",
          }}
        >
          <div style={{ fontWeight: 800, marginBottom: 4 }}>
            合計: {totalBps} bps（{totalPct}%）
          </div>
          <div style={{ fontSize: 13 }}>
            {totalOk
              ? "OK：このまま保存できます"
              : `NG：あと ${10000 - totalBps} bps 調整してください`}
          </div>
        </div>

        <div style={grid2Style}>
          <FormRow label="適用開始日">
            <input
              name="startsAt"
              type="date"
              required
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              style={inputStyle}
            />
          </FormRow>
          <FormRow label="適用終了日">
            <input
              name="endsAt"
              type="date"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              style={inputStyle}
            />
          </FormRow>
        </div>

        <label style={checkboxRowStyle}>
          <input
            name="isActive"
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
          />
          <span>有効にする</span>
        </label>

        <FormRow label="メモ">
          <textarea
            name="note"
            rows={4}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            style={textareaStyle}
          />
        </FormRow>

        <div style={{ fontSize: 13, color: "#666", marginBottom: 16 }}>
          合計は 10000 bps（100.00%）にしてください。過去Paymentは変更されません。
        </div>

        <button type="submit" style={primaryButtonStyle} disabled={!totalOk}>
          更新する
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

const subTextStyle: CSSProperties = {
  marginTop: 6,
  fontSize: 12,
  color: "#666",
};

const sumBoxStyle: CSSProperties = {
  border: "1px solid",
  borderRadius: 12,
  padding: 14,
  marginBottom: 16,
};