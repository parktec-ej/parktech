"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type OperationMode =
  | "RESERVATION_ONLY"
  | "HOURLY_ONLY"
  | "RESERVATION_THEN_HOURLY"
  | "EVENT_ONLY"
  | "CLOSED";

type ContractType =
  | "HQ_BULK"
  | "OWNER_DIRECT"
  | "OWNER_AGENT_PLATFORM";

type OwnerItem = {
  id: string;
  name: string;
  displayName?: string | null;
  status: string;
};

type AgentItem = {
  id: string;
  name: string;
  displayName?: string | null;
  defaultAgentRateBps: number;
  status: string;
};

const operationModes: OperationMode[] = [
  "RESERVATION_ONLY",
  "HOURLY_ONLY",
  "RESERVATION_THEN_HOURLY",
  "EVENT_ONLY",
  "CLOSED",
];

export default function PlaceEditPage() {
  const router = useRouter();
  const params = useParams();
  const id = String(params.id ?? "");

  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [googleMapUrl, setGoogleMapUrl] = useState("");
  const [operationMode, setOperationMode] =
    useState<OperationMode>("RESERVATION_ONLY");

  const [assignmentId, setAssignmentId] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [agentId, setAgentId] = useState("");
  const [contractType, setContractType] =
    useState<ContractType>("OWNER_AGENT_PLATFORM");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");

  const [ownerRateBps, setOwnerRateBps] = useState(8000);
  const [agentRateBps, setAgentRateBps] = useState(0);
  const [platformRateBps, setPlatformRateBps] = useState(2000);

  const [owners, setOwners] = useState<OwnerItem[]>([]);
  const [agents, setAgents] = useState<AgentItem[]>([]);

  const [loading, setLoading] = useState(true);
  const [loadingMasters, setLoadingMasters] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const rateTotal = useMemo(
    () => ownerRateBps + agentRateBps + platformRateBps,
    [ownerRateBps, agentRateBps, platformRateBps]
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setMsg("");

      try {
        const [placeRes, ownersRes, agentsRes] = await Promise.all([
          fetch(`/api/admin/places/${id}`, { cache: "no-store" }),
          fetch("/api/admin/owners-list", { cache: "no-store" }),
          fetch("/api/admin/agents-list", { cache: "no-store" }),
        ]);

        const placeJson = await placeRes.json().catch(() => null);
        const ownersJson = await ownersRes.json().catch(() => null);
        const agentsJson = await agentsRes.json().catch(() => null);

        if (!placeRes.ok || !placeJson?.ok) {
          if (!cancelled) {
            setMsg(placeJson?.message ?? "読み込みに失敗しました。");
          }
          return;
        }

        if (!ownersRes.ok || !ownersJson?.ok) {
          if (!cancelled) {
            setMsg(ownersJson?.message ?? ownersJson?.error ?? "オーナー一覧の取得に失敗しました。");
          }
          return;
        }

        if (!agentsRes.ok || !agentsJson?.ok) {
          if (!cancelled) {
            setMsg(agentsJson?.message ?? agentsJson?.error ?? "代理店一覧の取得に失敗しました。");
          }
          return;
        }

        if (cancelled) return;

        const place = placeJson.place;
        const currentAssignment = place.currentAssignment ?? null;

        setSlug(place.slug ?? "");
        setName(place.name ?? "");
        setAddress(place.address ?? "");
        setGoogleMapUrl(place.googleMapUrl ?? "");
        setOperationMode(
          (place.operationMode ?? "RESERVATION_ONLY") as OperationMode
        );

        setAssignmentId(currentAssignment?.id ?? "");
        setOwnerId(currentAssignment?.ownerId ?? place.ownerId ?? "");
        setAgentId(currentAssignment?.agentId ?? "");
        setContractType(
          (currentAssignment?.contractType ??
            "OWNER_AGENT_PLATFORM") as ContractType
        );
        setStartsAt(
          currentAssignment?.startsAt
            ? String(currentAssignment.startsAt).slice(0, 10)
            : ""
        );
        setEndsAt(
          currentAssignment?.endsAt
            ? String(currentAssignment.endsAt).slice(0, 10)
            : ""
        );

        setOwnerRateBps(Number(currentAssignment?.ownerRateBps ?? 8000));
        setAgentRateBps(Number(currentAssignment?.agentRateBps ?? 0));
        setPlatformRateBps(
          Number(currentAssignment?.platformRateBps ?? 2000)
        );

        setOwners(Array.isArray(ownersJson.owners) ? ownersJson.owners : []);
        setAgents(Array.isArray(agentsJson.agents) ? agentsJson.agents : []);
      } catch (e: any) {
        if (!cancelled) {
          setMsg(String(e?.message ?? e));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setLoadingMasters(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (contractType === "HQ_BULK" || contractType === "OWNER_DIRECT") {
      setAgentId("");
      setAgentRateBps(0);
      setPlatformRateBps(Math.max(0, 10000 - ownerRateBps));
      return;
    }

    if (!agentId) {
      setAgentRateBps(0);
      setPlatformRateBps(Math.max(0, 10000 - ownerRateBps));
      return;
    }

    const selected = agents.find((a) => a.id === agentId);
    if (!selected) return;

    const nextAgentRate = Number(selected.defaultAgentRateBps ?? 0);
    setAgentRateBps(nextAgentRate);
    setPlatformRateBps(Math.max(0, 10000 - ownerRateBps - nextAgentRate));
  }, [contractType, agentId, agents, ownerRateBps]);

  function handleOwnerRateChange(value: string) {
    const nextOwner = Number(value || 0);
    setOwnerRateBps(nextOwner);
    setPlatformRateBps(
      Math.max(
        0,
        10000 -
          nextOwner -
          (contractType === "OWNER_AGENT_PLATFORM" ? agentRateBps : 0)
      )
    );
  }

  function handleAgentRateChange(value: string) {
    const nextAgent = Number(value || 0);
    setAgentRateBps(nextAgent);
    setPlatformRateBps(Math.max(0, 10000 - ownerRateBps - nextAgent));
  }

  async function onSave() {
    setSaving(true);
    setMsg("");

    try {
      if (!ownerId) {
        setMsg("オーナーを選択してください。");
        return;
      }

      if (!startsAt) {
        setMsg("適用開始日を入力してください。");
        return;
      }

      if (rateTotal !== 10000) {
        setMsg("配分率の合計は10000bpsにしてください。");
        return;
      }

      const res = await fetch(`/api/admin/places/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          slug,
          name,
          address,
          googleMapUrl,
          operationMode,

          assignmentId: assignmentId || null,
          ownerId,
          contractType,
          agentId:
            contractType === "OWNER_AGENT_PLATFORM" ? agentId || null : null,
          ownerRateBps,
          agentRateBps:
            contractType === "OWNER_AGENT_PLATFORM" ? agentRateBps : 0,
          platformRateBps,
          startsAt,
          endsAt: endsAt || null,
        }),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.ok) {
        setMsg(json?.message ?? "保存に失敗しました。");
        return;
      }

      router.push("/admin/places");
    } catch (e: any) {
      setMsg(String(e?.message ?? e));
    } finally {
      setSaving(false);
    }
  }

  if (loading || loadingMasters) {
    return <div style={{ padding: 24 }}>読み込み中...</div>;
  }

  return (
    <div style={{ maxWidth: 860, margin: "24px auto", padding: 16 }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 16 }}>
        Place 編集
      </h1>

      <div style={cardStyle}>
        <div>
          <div style={labelStyle}>slug</div>
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            style={inputStyle}
          />
        </div>

        <div>
          <div style={labelStyle}>名前</div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={inputStyle}
          />
        </div>

        <div>
          <div style={labelStyle}>住所</div>
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            style={inputStyle}
          />
        </div>

        <div>
          <div style={labelStyle}>Google Map URL</div>
          <input
            value={googleMapUrl}
            onChange={(e) => setGoogleMapUrl(e.target.value)}
            style={inputStyle}
          />
        </div>

        <div>
          <div style={labelStyle}>operationMode</div>
          <select
            value={operationMode}
            onChange={(e) => setOperationMode(e.target.value as OperationMode)}
            style={inputStyle}
          >
            {operationModes.map((mode) => (
              <option key={mode} value={mode}>
                {mode}
              </option>
            ))}
          </select>
        </div>

        <div style={dividerStyle} />

        <h3 style={sectionTitleStyle}>契約・配分設定</h3>

        <div style={grid2Style}>
          <label style={labelBlockStyle}>
            <div style={labelStyle}>オーナー</div>
            <select
              value={ownerId}
              onChange={(e) => setOwnerId(e.target.value)}
              style={inputStyle}
            >
              <option value="">選択してください</option>
              {owners.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.displayName || o.name}
                </option>
              ))}
            </select>
          </label>

          <label style={labelBlockStyle}>
            <div style={labelStyle}>契約タイプ</div>
            <select
              value={contractType}
              onChange={(e) => setContractType(e.target.value as ContractType)}
              style={inputStyle}
            >
              <option value="OWNER_AGENT_PLATFORM">OWNER_AGENT_PLATFORM</option>
              <option value="OWNER_DIRECT">OWNER_DIRECT</option>
              <option value="HQ_BULK">HQ_BULK</option>
            </select>
          </label>
        </div>

        <div style={grid2Style}>
          <label style={labelBlockStyle}>
            <div style={labelStyle}>代理店</div>
            <select
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              style={inputStyle}
              disabled={contractType !== "OWNER_AGENT_PLATFORM"}
            >
              <option value="">
                {contractType === "OWNER_AGENT_PLATFORM"
                  ? "選択してください"
                  : "代理店なし"}
              </option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.displayName || a.name}
                </option>
              ))}
            </select>
          </label>

          <label style={labelBlockStyle}>
            <div style={labelStyle}>適用開始日</div>
            <input
              type="date"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              style={inputStyle}
            />
          </label>
        </div>

        <div style={grid2Style}>
          <label style={labelBlockStyle}>
            <div style={labelStyle}>適用終了日</div>
            <input
              type="date"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              style={inputStyle}
            />
          </label>
        </div>

        <div style={grid3Style}>
          <div>
            <div style={labelStyle}>ownerRateBps</div>
            <input
              type="number"
              value={ownerRateBps}
              onChange={(e) => handleOwnerRateChange(e.target.value)}
              style={inputStyle}
            />
          </div>

          <div>
            <div style={labelStyle}>agentRateBps</div>
            <input
              type="number"
              value={agentRateBps}
              onChange={(e) => handleAgentRateChange(e.target.value)}
              style={inputStyle}
              disabled={contractType !== "OWNER_AGENT_PLATFORM"}
            />
          </div>

          <div>
            <div style={labelStyle}>platformRateBps</div>
            <input
              type="number"
              value={platformRateBps}
              onChange={(e) => setPlatformRateBps(Number(e.target.value))}
              style={inputStyle}
            />
          </div>
        </div>

        <div
          style={{
            color: rateTotal === 10000 ? "#166534" : "#b00020",
            fontWeight: 700,
            fontSize: 14,
          }}
        >
          合計: {rateTotal} bps
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onSave} disabled={saving} style={saveButton}>
            {saving ? "保存中..." : "保存"}
          </button>

          <button
            onClick={() => router.push("/admin/places")}
            style={cancelButton}
          >
            戻る
          </button>
        </div>

        {msg && <div style={errorStyle}>{msg}</div>}
      </div>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  display: "grid",
  gap: 12,
  padding: 16,
  border: "1px solid #e5e7eb",
  borderRadius: 16,
  background: "#fff",
};

const dividerStyle: React.CSSProperties = {
  borderTop: "1px solid #e5e7eb",
  marginTop: 4,
  paddingTop: 4,
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 800,
  margin: 0,
};

const labelBlockStyle: React.CSSProperties = {
  display: "block",
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#666",
  marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: 12,
  border: "1px solid #ddd",
  borderRadius: 12,
};

const grid2Style: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 12,
};

const grid3Style: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 12,
};

const saveButton: React.CSSProperties = {
  padding: "12px 18px",
  borderRadius: 12,
  border: "1px solid #111",
  background: "#111",
  color: "#fff",
  fontWeight: 700,
  cursor: "pointer",
};

const cancelButton: React.CSSProperties = {
  padding: "12px 18px",
  borderRadius: 12,
  border: "1px solid #ddd",
  background: "#fff",
  fontWeight: 700,
  cursor: "pointer",
};

const errorStyle: React.CSSProperties = {
  color: "#b00020",
  background: "#fff3f5",
  border: "1px solid #ffd0d8",
  borderRadius: 12,
  padding: 10,
};