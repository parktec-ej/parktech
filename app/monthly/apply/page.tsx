"use client";

import { useEffect, useState } from "react";

type PlaceLite = {
  id: string;
  slug: string;
  name: string;
  address: string | null;
};

type PlacesResponse = {
  ok: boolean;
  places?: PlaceLite[];
};

type SlotLite = {
  code: string;
  spotId: string | null;
  available: boolean;
};

type SlotsResponse = {
  ok: boolean;
  placeName?: string;
  slots?: SlotLite[];
};

type ApplyResponse = {
  ok: boolean;
  contractId?: string;
  totalFeeYen?: number;
  error?: string;
  message?: string;
};

type Plan = "NON_EVENT_ONLY" | "INCLUDES_EVENT";

const MONTHLY_FEE_YEN = 3300;

const PLAN_OPTIONS: Array<{ value: Plan; label: string; desc: string }> = [
  {
    value: "NON_EVENT_ONLY",
    label: "プラン1：非イベント日のみ",
    desc: "イベント開催日を除く日に駐車できます。",
  },
  {
    value: "INCLUDES_EVENT",
    label: "プラン2：イベント日も駐車可",
    desc: "イベント日も都度予約のうえ駐車できます。",
  },
];

function formatYen(value: number) {
  return `¥${value.toLocaleString("ja-JP")}`;
}

export default function MonthlyApplyPage() {
  const [places, setPlaces] = useState<PlaceLite[]>([]);
  const [placeId, setPlaceId] = useState("");
  const [plan, setPlan] = useState<Plan>("NON_EVENT_ONLY");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [address, setAddress] = useState("");
  const [vehicleType, setVehicleType] = useState("");
  const [plate, setPlate] = useState("");
  const [agreed, setAgreed] = useState(false);

  const [slots, setSlots] = useState<SlotLite[]>([]);
  const [spotId, setSpotId] = useState("");
  const [slotsLoading, setSlotsLoading] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/public/places", { cache: "no-store" });
        const json: PlacesResponse = await res.json().catch(() => ({ ok: false }));
        if (cancelled) return;
        const list = Array.isArray(json.places) ? json.places : [];
        setPlaces(list);
        // 利府グランディ前（rifu-main）を優先して初期選択
        const def =
          list.find((p) => p.slug === "rifu-main") ?? list[0];
        if (def) setPlaceId(def.id);
      } catch {
        if (!cancelled) setPlaces([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 月極の空き区画（A-17〜A-20）を取得。利府メイン固定。
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setSlotsLoading(true);
        const res = await fetch("/api/monthly/slots", { cache: "no-store" });
        const json: SlotsResponse = await res
          .json()
          .catch(() => ({ ok: false }));
        if (cancelled) return;
        setSlots(Array.isArray(json.slots) ? json.slots : []);
      } catch {
        if (!cancelled) setSlots([]);
      } finally {
        if (!cancelled) setSlotsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");

    if (!placeId) return setErr("駐車場を選択してください");
    if (!spotId) return setErr("駐車区画を選択してください");
    if (!name.trim()) return setErr("氏名を入力してください");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return setErr("メールアドレスの形式が正しくありません");
    }
    if (!phone.trim()) return setErr("電話番号を入力してください");
    if (!address.trim()) return setErr("住所を入力してください");
    if (!vehicleType.trim()) return setErr("車種を入力してください");
    if (!plate.trim()) return setErr("車のナンバーを入力してください");
    if (!agreed) return setErr("重要事項にご同意ください");

    setSubmitting(true);
    try {
      const res = await fetch("/api/monthly/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          placeId,
          spotId,
          plan,
          billingTerm: "MONTHLY",
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim(),
          postalCode: postalCode.trim(),
          address: address.trim(),
          vehicleType: vehicleType.trim(),
          plate: plate.trim(),
          importantTermsAgreed: agreed,
        }),
      });
      const json: ApplyResponse = await res.json().catch(() => ({ ok: false }));

      if (res.status === 409) {
        setErr(
          json.message ||
            "このメールアドレスではすでに申込・契約が存在します。"
        );
        return;
      }
      if (!res.ok || !json.ok) {
        setErr(json.message || json.error || "申込に失敗しました");
        return;
      }

      window.location.href = "/monthly/apply/success";
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main style={pageStyle}>
      <div style={containerStyle}>
        <h1 style={titleStyle}>月極駐車場 お申し込み</h1>
        <p style={descStyle}>
          必要事項をご入力ください。お申し込み後、受付確認メールをお送りし、担当者が内容を確認のうえご連絡いたします。
          <br />
          ※ この時点では契約は成立しません。
        </p>

        <form onSubmit={submit} style={cardStyle}>
          <div style={fieldStyle}>
            <label style={labelStyle}>駐車場</label>
            <div style={fixedFieldStyle}>
              {places.find((p) => p.id === placeId)?.name ??
                "PARKTEC 利府グランディー前駐車場"}
            </div>
            <span style={{ fontSize: 12, color: "#6b7280" }}>
              ※ 月極のお申し込みは利府グランディー前のみ承っております。
            </span>
          </div>

          <div style={fieldStyle}>
            <label style={labelStyle}>駐車区画（4区画から選択）</label>
            {slotsLoading ? (
              <div style={{ fontSize: 14, color: "#6b7280" }}>
                空き状況を確認しています…
              </div>
            ) : slots.length === 0 ? (
              <div style={{ fontSize: 14, color: "#991b1b" }}>
                区画情報を取得できませんでした。時間をおいて再度お試しください。
              </div>
            ) : (
              <div style={slotGridStyle}>
                {slots.map((s) => {
                  const selected = spotId !== "" && spotId === s.spotId;
                  const disabled = !s.available || !s.spotId;
                  return (
                    <button
                      key={s.code}
                      type="button"
                      disabled={disabled}
                      onClick={() => s.spotId && setSpotId(s.spotId)}
                      style={{
                        ...slotButtonStyle,
                        ...(selected ? slotButtonActiveStyle : null),
                        ...(disabled ? slotButtonDisabledStyle : null),
                      }}
                    >
                      <span style={{ fontSize: 18, fontWeight: 900 }}>
                        {s.code}
                      </span>
                      <span style={{ fontSize: 12, marginTop: 2 }}>
                        {disabled ? "満車" : selected ? "選択中" : "空き"}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div style={fieldStyle}>
            <label style={labelStyle}>プラン</label>
            <div style={{ display: "grid", gap: 10 }}>
              {PLAN_OPTIONS.map((p) => (
                <label
                  key={p.value}
                  style={{
                    ...choiceStyle,
                    ...(plan === p.value ? choiceActiveStyle : null),
                  }}
                >
                  <input
                    type="radio"
                    name="plan"
                    checked={plan === p.value}
                    onChange={() => setPlan(p.value)}
                  />
                  <span>
                    <strong>{p.label}</strong>
                    <br />
                    <span style={{ fontSize: 13, color: "#6b7280" }}>
                      {p.desc}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div style={totalBoxStyle}>
            <div>
              <span style={totalLabelStyle}>月額（税込）</span>
              <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                毎月自動更新（Stripeサブスクリプション）
              </div>
            </div>
            <span style={totalValueStyle}>{formatYen(MONTHLY_FEE_YEN)}</span>
          </div>

          <hr style={hrStyle} />

          <div style={fieldStyle}>
            <label style={labelStyle}>お名前</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={inputStyle}
              placeholder="例: 山田 太郎"
            />
          </div>

          <div style={fieldStyle}>
            <label style={labelStyle}>メールアドレス</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={inputStyle}
              placeholder="例: taro@example.com"
            />
          </div>

          <div style={fieldStyle}>
            <label style={labelStyle}>電話番号</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              style={inputStyle}
              placeholder="例: 090-1234-5678"
            />
          </div>

          <div style={rowStyle}>
            <div style={{ ...fieldStyle, flex: "0 0 140px" }}>
              <label style={labelStyle}>郵便番号</label>
              <input
                value={postalCode}
                onChange={(e) => setPostalCode(e.target.value)}
                style={inputStyle}
                placeholder="例: 981-0101"
              />
            </div>
            <div style={{ ...fieldStyle, flex: 1 }}>
              <label style={labelStyle}>住所</label>
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                style={inputStyle}
                placeholder="例: 宮城県宮城郡利府町..."
              />
            </div>
          </div>

          <div style={rowStyle}>
            <div style={{ ...fieldStyle, flex: 1 }}>
              <label style={labelStyle}>車種</label>
              <input
                value={vehicleType}
                onChange={(e) => setVehicleType(e.target.value)}
                style={inputStyle}
                placeholder="例: トヨタ プリウス"
              />
            </div>
            <div style={{ ...fieldStyle, flex: 1 }}>
              <label style={labelStyle}>車のナンバー</label>
              <input
                value={plate}
                onChange={(e) => setPlate(e.target.value)}
                style={inputStyle}
                placeholder="例: 仙台 300 あ 12-34"
              />
            </div>
          </div>

          <label style={agreeRowStyle}>
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
            />
            <span>
              重要事項説明・利用規約に同意します（契約は当社の承認をもって成立します）。
            </span>
          </label>

          {err ? <div style={errorBoxStyle}>{err}</div> : null}

          <button
            type="submit"
            disabled={submitting}
            style={{
              ...submitButtonStyle,
              opacity: submitting ? 0.6 : 1,
              cursor: submitting ? "not-allowed" : "pointer",
            }}
          >
            {submitting ? "送信中..." : "この内容で申し込む"}
          </button>
        </form>
      </div>
    </main>
  );
}

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "#f9fafb",
  padding: 24,
};
const containerStyle: React.CSSProperties = { maxWidth: 680, margin: "0 auto" };
const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 28,
  fontWeight: 900,
  color: "#111827",
};
const descStyle: React.CSSProperties = {
  marginTop: 10,
  marginBottom: 20,
  color: "#6b7280",
  lineHeight: 1.7,
  fontSize: 14,
};
const cardStyle: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 20,
  background: "#fff",
  padding: 20,
  display: "grid",
  gap: 16,
};
const fieldStyle: React.CSSProperties = { display: "grid", gap: 8 };
const rowStyle: React.CSSProperties = { display: "flex", gap: 12, flexWrap: "wrap" };
const labelStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  color: "#374151",
};
const inputStyle: React.CSSProperties = {
  width: "100%",
  border: "1px solid #d1d5db",
  borderRadius: 12,
  padding: "12px 14px",
  fontSize: 16,
  background: "#fff",
  boxSizing: "border-box",
};
const choiceStyle: React.CSSProperties = {
  display: "flex",
  gap: 10,
  alignItems: "flex-start",
  border: "1px solid #d1d5db",
  borderRadius: 12,
  padding: "12px 14px",
  cursor: "pointer",
  lineHeight: 1.6,
};
const choiceActiveStyle: React.CSSProperties = {
  border: "2px solid #111827",
  background: "#f9fafb",
};
const totalBoxStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  border: "1px solid #e5e7eb",
  borderRadius: 14,
  background: "#f9fafb",
  padding: "14px 16px",
};
const totalLabelStyle: React.CSSProperties = {
  color: "#6b7280",
  fontSize: 15,
  fontWeight: 800,
};
const totalValueStyle: React.CSSProperties = {
  color: "#111827",
  fontSize: 24,
  fontWeight: 900,
};
const hrStyle: React.CSSProperties = {
  border: 0,
  borderTop: "1px solid #e5e7eb",
  margin: "4px 0",
};
const agreeRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 10,
  fontSize: 14,
  fontWeight: 600,
  color: "#374151",
  lineHeight: 1.6,
};
const errorBoxStyle: React.CSSProperties = {
  border: "1px solid #fecaca",
  background: "#fef2f2",
  color: "#991b1b",
  borderRadius: 14,
  padding: "12px 14px",
  fontWeight: 700,
  lineHeight: 1.7,
};
const submitButtonStyle: React.CSSProperties = {
  border: "1px solid #111827",
  borderRadius: 14,
  background: "#111827",
  color: "#fff",
  padding: "14px 18px",
  fontSize: 16,
  fontWeight: 800,
};
const fixedFieldStyle: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  padding: "12px 14px",
  fontSize: 16,
  fontWeight: 700,
  color: "#111827",
  background: "#f9fafb",
};
const slotGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, 1fr)",
  gap: 10,
};
const slotButtonStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  border: "1px solid #d1d5db",
  borderRadius: 12,
  padding: "14px 8px",
  background: "#fff",
  color: "#111827",
  cursor: "pointer",
};
const slotButtonActiveStyle: React.CSSProperties = {
  border: "2px solid #111827",
  background: "#111827",
  color: "#fff",
};
const slotButtonDisabledStyle: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  background: "#f3f4f6",
  color: "#9ca3af",
  cursor: "not-allowed",
};
