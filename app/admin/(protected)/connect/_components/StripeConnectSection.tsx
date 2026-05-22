"use client";

import { useState } from "react";

type Props = {
  targetType: "owner" | "agent";
  targetId: string;
  stripeAccountId: string | null;
  stripeOnboardingComplete: boolean;
};

export default function StripeConnectSection({
  targetType,
  targetId,
  stripeAccountId,
  stripeOnboardingComplete,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [errMessage, setErrMessage] = useState("");
  const [errCode, setErrCode] = useState<string | null>(null);
  const [errType, setErrType] = useState<string | null>(null);

  async function startOnboarding() {
    setBusy(true);
    setErrMessage("");
    setErrCode(null);
    setErrType(null);
    try {
      const res = await fetch(`/api/admin/connect/onboard`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetType, targetId }),
      });
      const json = await res.json();
      if (json?.ok && json.url) {
        window.location.href = json.url;
      } else {
        // Stripe / サーバーから返ってきた message をそのまま表示する
        setErrMessage(
          json?.message ?? json?.error ?? "onboarding URLの取得に失敗"
        );
        setErrCode(json?.code ?? null);
        setErrType(json?.error ?? null);
        setBusy(false);
      }
    } catch (e) {
      setErrMessage(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <div style={card}>
      <h2 style={sectionTitle}>Stripe Connect 連携</h2>

      {!stripeAccountId && (
        <>
          <p style={mutedText}>
            報酬の受取に必要な Stripe アカウントを連携します。
          </p>
          <button
            type="button"
            onClick={startOnboarding}
            disabled={busy}
            style={{ ...primaryBtn, opacity: busy ? 0.6 : 1 }}
          >
            {busy ? "リダイレクト中..." : "Stripe連携を開始"}
          </button>
        </>
      )}

      {stripeAccountId && stripeOnboardingComplete && (
        <div style={okBox}>
          ✅ Stripe連携済み
          <div style={subText}>account: {stripeAccountId}</div>
        </div>
      )}

      {stripeAccountId && !stripeOnboardingComplete && (
        <>
          <div style={warnBox}>
            ⚠️ 連携未完了 — 残りの登録項目を完了してください
            <div style={subText}>account: {stripeAccountId}</div>
          </div>
          <button
            type="button"
            onClick={startOnboarding}
            disabled={busy}
            style={{ ...primaryBtn, opacity: busy ? 0.6 : 1 }}
          >
            {busy ? "リダイレクト中..." : "連携を続ける"}
          </button>
        </>
      )}

      {errMessage ? (
        <div style={errorBox}>
          <div style={errorMessageText}>{errMessage}</div>
          {(errType || errCode) && (
            <div style={errorMeta}>
              {errType && <span>type: {errType}</span>}
              {errType && errCode && <span> / </span>}
              {errCode && <span>code: {errCode}</span>}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

const card: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 14,
  padding: 16,
  background: "#fff",
  marginBottom: 16,
};

const sectionTitle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 800,
  margin: "0 0 10px",
};

const mutedText: React.CSSProperties = {
  color: "#6b7280",
  fontSize: 13,
  lineHeight: 1.7,
  margin: "0 0 12px",
};

const subText: React.CSSProperties = {
  fontSize: 11,
  color: "#6b7280",
  marginTop: 4,
  wordBreak: "break-all",
};

const okBox: React.CSSProperties = {
  background: "#f0fdf4",
  border: "1px solid #bbf7d0",
  color: "#166534",
  padding: 12,
  borderRadius: 10,
  fontWeight: 700,
};

const warnBox: React.CSSProperties = {
  background: "#fffbeb",
  border: "1px solid #fde68a",
  color: "#92400e",
  padding: 12,
  borderRadius: 10,
  fontWeight: 700,
  marginBottom: 12,
};

const errorBox: React.CSSProperties = {
  background: "#fef2f2",
  border: "1px solid #fecaca",
  color: "#b91c1c",
  padding: 12,
  borderRadius: 10,
  marginTop: 12,
};

const errorMessageText: React.CSSProperties = {
  fontWeight: 700,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  fontSize: 13,
  lineHeight: 1.6,
};

const errorMeta: React.CSSProperties = {
  marginTop: 6,
  fontSize: 11,
  color: "#991b1b",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  opacity: 0.85,
};

const primaryBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 16px",
  border: "1px solid #111",
  background: "#111",
  color: "#fff",
  borderRadius: 10,
  fontWeight: 800,
  cursor: "pointer",
};
