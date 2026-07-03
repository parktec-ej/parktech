"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type OperationMode =
  | "RESERVATION_ONLY"
  | "HOURLY_ONLY"
  | "RESERVATION_THEN_HOURLY"
  | "EVENT_ONLY"
  | "CLOSED"
  | "MONTHLY";

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

function PlaceNewPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const presetOwnerId = searchParams.get("ownerId") ?? "";

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [address, setAddress] = useState("");
  const [googleMapUrl, setGoogleMapUrl] = useState("");
  const [spotCount, setSpotCount] = useState(10);
  const [operationMode, setOperationMode] =
    useState<OperationMode>("RESERVATION_THEN_HOURLY");

  const [ownerId, setOwnerId] = useState(presetOwnerId);
  const [agentId, setAgentId] = useState("");
  const [contractType, setContractType] =
    useState<ContractType>("OWNER_AGENT_PLATFORM");

  const [startsAt, setStartsAt] = useState(
    new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" })
  );
  const [endsAt, setEndsAt] = useState("");

  const [ownerRateBps, setOwnerRateBps] = useState(8000);
  const [agentRateBps, setAgentRateBps] = useState(0);
  const [platformRateBps, setPlatformRateBps] = useState(2000);

  const [policyStartMonth, setPolicyStartMonth] = useState(
    new Date()
      .toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" })
      .slice(0, 7)
  );
  const [policyEndMonth, setPolicyEndMonth] = useState("");
  const [taxRateBps, setTaxRateBps] = useState(1000);
  const [monthlyMinFeeThreshold, setMonthlyMinFeeThreshold] = useState(300);
  const [ownerPayoutFeeBurden, setOwnerPayoutFeeBurden] = useState(false);
  const [agentPayoutFeeBurden, setAgentPayoutFeeBurden] = useState(false);
  const [billingNote, setBillingNote] = useState("");

  const [owners, setOwners] = useState<OwnerItem[]>([]);
  const [agents, setAgents] = useState<AgentItem[]>([]);

  const [loadingMasters, setLoadingMasters] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const rateTotal = useMemo(
    () => ownerRateBps + agentRateBps + platformRateBps,
    [ownerRateBps, agentRateBps, platformRateBps]
  );

  useEffect(() => {
    async function loadMasters() {
      setLoadingMasters(true);
      setErr("");

      try {
        const [ownersRes, agentsRes] = await Promise.all([
          fetch("/api/admin/owners-list", { cache: "no-store" }),
          fetch("/api/admin/agents-list", { cache: "no-store" }),
        ]);

        const ownersJson = await ownersRes.json();
        const agentsJson = await agentsRes.json();

        if (!ownersJson?.ok) {
          throw new Error(ownersJson?.error ?? "owners_load_failed");
        }
        if (!agentsJson?.ok) {
          throw new Error(agentsJson?.error ?? "agents_load_failed");
        }

        setOwners(ownersJson.owners ?? []);
        setAgents(agentsJson.agents ?? []);
      } catch (e: any) {
        setErr(String(e?.message ?? e));
      } finally {
        setLoadingMasters(false);
      }
    }

    loadMasters();
  }, []);

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

    const agent = agents.find((a) => a.id === agentId);
    if (!agent) return;

    const nextAgent = agent.defaultAgentRateBps ?? 0;
    const nextPlatform = 10000 - ownerRateBps - nextAgent;

    setAgentRateBps(nextAgent);
    setPlatformRateBps(nextPlatform >= 0 ? nextPlatform : 0);
  }, [contractType, agentId, agents, ownerRateBps]);

  function normalizeSlug(input: string) {
    return input
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-_]/g, "");
  }

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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr("");

    try {
      const res = await fetch("/api/admin/places", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          slug: normalizeSlug(slug),
          address,
          googleMapUrl,
          spotCount,
          operationMode,

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

          policyStartMonth,
          policyEndMonth: policyEndMonth || null,
          taxRateBps,
          monthlyMinFeeThreshold,
          ownerPayoutFeeBurden,
          agentPayoutFeeBurden,
          billingNote: billingNote || null,
        }),
      });

      const text = await res.text();
      const json = text ? JSON.parse(text) : null;

      if (!res.ok || !json?.ok) {
        setErr(json?.message ?? json?.error ?? "作成に失敗しました");
        return;
      }

      router.push(
        ownerId
          ? `/admin/owners/${ownerId}?placeCreated=1`
          : "/admin/places?created=1"
      );
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <main style={{ maxWidth: 860, margin: "0 auto", padding: 24 }}>
      <h1 style={{ fontSize: 28, fontWeight: 900, marginBottom: 8 }}>
        Place 新規作成
      </h1>
      <div style={{ color: "#666", marginBottom: 20 }}>
        Place / Spot / PlaceAssignment / BillingPolicy を一括作成します
      </div>

      <form onSubmit={submit} style={{ display: "grid", gap: 16 }}>
        <section style={cardStyle}>
          <h2 style={sectionTitleStyle}>基本情報</h2>

          <div style={grid2Style}>
            <Input
              label="名前"
              value={name}
              onChange={setName}
              placeholder="例: ParkTech 利府北駐車場"
            />
            <Input
              label="slug"
              value={slug}
              onChange={setSlug}
              placeholder="例: rifu-north"
            />
          </div>

          <div style={grid2Style}>
            <Input
              label="住所"
              value={address}
              onChange={setAddress}
              placeholder="宮城県..."
            />
            <Input
              label="Google Map URL"
              value={googleMapUrl}
              onChange={setGoogleMapUrl}
              placeholder="https://maps.google.com/..."
            />
          </div>

          <div style={grid2Style}>
            <label style={labelBlockStyle}>
              <div style={labelStyle}>初期営業モード</div>
              <select
                value={operationMode}
                onChange={(e) =>
                  setOperationMode(e.target.value as OperationMode)
                }
                style={inputStyle}
              >
                <option value="RESERVATION_ONLY">RESERVATION_ONLY</option>
                <option value="HOURLY_ONLY">HOURLY_ONLY</option>
                <option value="RESERVATION_THEN_HOURLY">
                  RESERVATION_THEN_HOURLY
                </option>
                <option value="EVENT_ONLY">EVENT_ONLY</option>
                <option value="CLOSED">CLOSED</option>
              </select>
            </label>

            <label style={labelBlockStyle}>
              <div style={labelStyle}>初期SLOT数</div>
              <input
                type="number"
                min={1}
                max={300}
                value={spotCount}
                onChange={(e) => setSpotCount(Number(e.target.value))}
                style={inputStyle}
              />
            </label>
          </div>
        </section>

        <section style={cardStyle}>
          <h2 style={sectionTitleStyle}>契約・配分設定</h2>

          {loadingMasters ? (
            <div style={{ color: "#666" }}>
              オーナー / 代理店を読み込み中...
            </div>
          ) : (
            <>
              <div style={grid2Style}>
                <label style={labelBlockStyle}>
                  <div style={labelStyle}>オーナー</div>
                  <select
                    value={ownerId}
                    onChange={(e) => setOwnerId(e.target.value)}
                    style={inputStyle}
                    required
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
                    onChange={(e) =>
                      setContractType(e.target.value as ContractType)
                    }
                    style={inputStyle}
                  >
                    <option value="OWNER_AGENT_PLATFORM">
                      OWNER_AGENT_PLATFORM
                    </option>
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
                        {a.displayName || a.name}（標準{" "}
                        {(a.defaultAgentRateBps / 100).toFixed(2)}%）
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
                    required
                  />
                </label>
              </div>

              <div style={grid3Style}>
                <label style={labelBlockStyle}>
                  <div style={labelStyle}>Owner率 (bps)</div>
                  <input
                    type="number"
                    value={ownerRateBps}
                    onChange={(e) => handleOwnerRateChange(e.target.value)}
                    style={inputStyle}
                    required
                  />
                </label>

                <label style={labelBlockStyle}>
                  <div style={labelStyle}>Agent率 (bps)</div>
                  <input
                    type="number"
                    value={agentRateBps}
                    onChange={(e) => handleAgentRateChange(e.target.value)}
                    style={inputStyle}
                    required
                    disabled={contractType !== "OWNER_AGENT_PLATFORM"}
                  />
                </label>

                <label style={labelBlockStyle}>
                  <div style={labelStyle}>本部率 (bps)</div>
                  <input
                    type="number"
                    value={platformRateBps}
                    onChange={(e) => setPlatformRateBps(Number(e.target.value))}
                    style={inputStyle}
                    required
                  />
                </label>
              </div>

              <div
                style={{
                  fontSize: 13,
                  color: rateTotal === 10000 ? "#166534" : "#b91c1c",
                }}
              >
                合計: {rateTotal} bps{" "}
                {rateTotal === 10000
                  ? "（OK）"
                  : "（10000にしてください）"}
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

                <label style={labelBlockStyle}>
                  <div style={labelStyle}>課税開始月</div>
                  <input
                    type="month"
                    value={policyStartMonth}
                    onChange={(e) => setPolicyStartMonth(e.target.value)}
                    style={inputStyle}
                    required
                  />
                </label>
              </div>
            </>
          )}
        </section>

        <section style={cardStyle}>
          <h2 style={sectionTitleStyle}>請求・税設定</h2>

          <div style={grid2Style}>
            <label style={labelBlockStyle}>
              <div style={labelStyle}>課税終了月</div>
              <input
                type="month"
                value={policyEndMonth}
                onChange={(e) => setPolicyEndMonth(e.target.value)}
                style={inputStyle}
              />
            </label>

            <label style={labelBlockStyle}>
              <div style={labelStyle}>税率 (bps)</div>
              <input
                type="number"
                value={taxRateBps}
                onChange={(e) => setTaxRateBps(Number(e.target.value))}
                style={inputStyle}
              />
            </label>
          </div>

          <div style={grid2Style}>
            <label style={labelBlockStyle}>
              <div style={labelStyle}>月額最低利用料</div>
              <input
                type="number"
                value={monthlyMinFeeThreshold}
                onChange={(e) =>
                  setMonthlyMinFeeThreshold(Number(e.target.value))
                }
                style={inputStyle}
              />
            </label>

            <Input
              label="請求メモ"
              value={billingNote}
              onChange={setBillingNote}
              placeholder="任意"
            />
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            <label style={checkboxRowStyle}>
              <input
                type="checkbox"
                checked={ownerPayoutFeeBurden}
                onChange={(e) => setOwnerPayoutFeeBurden(e.target.checked)}
              />
              <span>オーナー振込手数料をオーナー負担にする</span>
            </label>

            <label style={checkboxRowStyle}>
              <input
                type="checkbox"
                checked={agentPayoutFeeBurden}
                onChange={(e) => setAgentPayoutFeeBurden(e.target.checked)}
              />
              <span>代理店振込手数料を代理店負担にする</span>
            </label>
          </div>
        </section>

        <div style={{ display: "flex", gap: 12 }}>
          <button
            style={buttonStyle}
            disabled={saving || loadingMasters || rateTotal !== 10000}
          >
            {saving ? "作成中..." : "保存"}
          </button>

          <button type="button" style={cancelButton} onClick={() => router.back()}>
            戻る
          </button>
        </div>

        {err && <div style={{ color: "red", fontWeight: 700 }}>{err}</div>}
      </form>
    </main>
  );
}

export default function PlaceNewPage() {
  return (
    <Suspense
      fallback={
        <main style={{ maxWidth: 860, margin: "0 auto", padding: 24 }}>
          読み込み中...
        </main>
      }
    >
      <PlaceNewPageInner />
    </Suspense>
  );
}

function Input({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label style={labelBlockStyle}>
      <div style={labelStyle}>{label}</div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={inputStyle}
      />
    </label>
  );
}

const cardStyle: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 16,
  background: "#fff",
  padding: 20,
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 800,
  marginBottom: 16,
};

const labelBlockStyle: React.CSSProperties = {
  display: "block",
};

const labelStyle: React.CSSProperties = {
  fontSize: 13,
  color: "#666",
  marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: 12,
  borderRadius: 10,
  border: "1px solid #ddd",
};

const grid2Style: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 16,
};

const grid3Style: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 16,
};

const checkboxRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
};

const buttonStyle: React.CSSProperties = {
  padding: 12,
  borderRadius: 10,
  border: "none",
  background: "#111",
  color: "#fff",
  fontWeight: 700,
};

const cancelButton: React.CSSProperties = {
  padding: 12,
  borderRadius: 10,
  border: "1px solid #ccc",
  background: "#fff",
};