"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";

function Inner() {
  const sp = useSearchParams();
  const targetType = sp.get("targetType") ?? "";
  const targetId = sp.get("targetId") ?? "";

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const backHref =
    targetType === "agent" ? "/admin/agents" : "/admin/owners";
  const backLabel = targetType === "agent" ? "代理店一覧へ" : "オーナー一覧へ";

  async function restart() {
    if (!targetType || !targetId) {
      setErr("targetType または targetId が指定されていません");
      return;
    }
    setBusy(true);
    setErr("");
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
        setErr(json?.message ?? json?.error ?? "再開URL取得に失敗");
        setBusy(false);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <main style={page}>
      <div style={card}>
        <h1 style={title}>Stripe Connect 連携</h1>

        <div style={warnBox}>
          ⚠️ Stripeの認証リンクの有効期限が切れました。再度連携を開始してください。
        </div>

        {err ? <div style={errorBox}>{err}</div> : null}

        <button
          type="button"
          onClick={restart}
          disabled={busy}
          style={{ ...primaryBtn, opacity: busy ? 0.6 : 1 }}
        >
          {busy ? "リダイレクト中..." : "Stripe連携を再開する →"}
        </button>

        <Link href={backHref} style={backLink}>
          ← {backLabel}
        </Link>
      </div>
    </main>
  );
}

export default function ConnectRefreshPage() {
  return (
    <Suspense fallback={<main style={page}>読み込み中...</main>}>
      <Inner />
    </Suspense>
  );
}

const page: React.CSSProperties = {
  maxWidth: 720,
  margin: "0 auto",
  padding: "24px 16px",
};
const card: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 16,
  padding: 20,
  boxShadow: "0 4px 16px rgba(0,0,0,0.04)",
};
const title: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 900,
  margin: "0 0 14px",
};
const warnBox: React.CSSProperties = {
  background: "#fffbeb",
  border: "1px solid #fde68a",
  color: "#92400e",
  padding: 12,
  borderRadius: 12,
  marginBottom: 16,
  fontWeight: 700,
};
const errorBox: React.CSSProperties = {
  background: "#fef2f2",
  border: "1px solid #fecaca",
  color: "#b91c1c",
  padding: 12,
  borderRadius: 12,
  marginBottom: 16,
  fontWeight: 700,
};
const primaryBtn: React.CSSProperties = {
  display: "block",
  width: "100%",
  padding: "12px 16px",
  border: "1px solid #111",
  background: "#111",
  color: "#fff",
  borderRadius: 12,
  fontWeight: 800,
  cursor: "pointer",
  marginBottom: 12,
};
const backLink: React.CSSProperties = {
  display: "inline-block",
  color: "#2563eb",
  fontWeight: 700,
  textDecoration: "none",
};
