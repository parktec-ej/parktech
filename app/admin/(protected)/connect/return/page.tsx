"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

type StatusResp = {
  ok: boolean;
  connected?: boolean;
  stripeOnboardingComplete?: boolean;
  chargesEnabled?: boolean;
  payoutsEnabled?: boolean;
  detailsSubmitted?: boolean;
  error?: string;
  message?: string;
};

function Inner() {
  const sp = useSearchParams();
  const targetType = sp.get("targetType") ?? "";
  const targetId = sp.get("targetId") ?? "";

  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<StatusResp | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!targetType || !targetId) {
      setErr("targetType または targetId が指定されていません");
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const res = await fetch(
          `/api/admin/connect/status?targetType=${encodeURIComponent(
            targetType
          )}&targetId=${encodeURIComponent(targetId)}`,
          { cache: "no-store" }
        );
        const json: StatusResp = await res.json();
        setStatus(json);

        if (json.ok && json.chargesEnabled && json.payoutsEnabled) {
          // 完了フラグを立てる
          await fetch(`/api/admin/connect/complete`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ targetType, targetId }),
          });
        }
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [targetType, targetId]);

  const backHref =
    targetType === "agent" ? "/admin/agents" : "/admin/owners";
  const backLabel = targetType === "agent" ? "代理店一覧へ" : "オーナー一覧へ";

  if (loading) {
    return (
      <main style={page}>
        <div style={card}>
          <h1 style={title}>Stripe Connect 連携</h1>
          <p style={mutedText}>連携状況を確認しています...</p>
        </div>
      </main>
    );
  }

  if (err) {
    return (
      <main style={page}>
        <div style={card}>
          <h1 style={title}>Stripe Connect 連携</h1>
          <div style={errorBox}>{err}</div>
          <Link href={backHref} style={backLink}>
            ← {backLabel}
          </Link>
        </div>
      </main>
    );
  }

  if (!status?.ok) {
    return (
      <main style={page}>
        <div style={card}>
          <h1 style={title}>Stripe Connect 連携</h1>
          <div style={errorBox}>
            {status?.message ?? status?.error ?? "状態取得に失敗しました"}
          </div>
          <Link href={backHref} style={backLink}>
            ← {backLabel}
          </Link>
        </div>
      </main>
    );
  }

  const allDone =
    status.connected && status.chargesEnabled && status.payoutsEnabled;

  return (
    <main style={page}>
      <div style={card}>
        <h1 style={title}>Stripe Connect 連携</h1>

        {allDone ? (
          <div style={okBox}>
            ✅ Stripe 連携が完了しました。受け取り口座の登録を含むすべての確認が
            完了しています。
          </div>
        ) : (
          <div style={warnBox}>
            ⚠️ 追加情報が必要です。Stripe 側で必要書類・口座情報の登録を完了させて
            ください。
          </div>
        )}

        <div style={detailGrid}>
          <Row k="charges_enabled" v={String(!!status.chargesEnabled)} />
          <Row k="payouts_enabled" v={String(!!status.payoutsEnabled)} />
          <Row k="details_submitted" v={String(!!status.detailsSubmitted)} />
          <Row
            k="stripeOnboardingComplete (DB)"
            v={String(!!status.stripeOnboardingComplete || allDone)}
          />
        </div>

        {!allDone && (
          <button
            type="button"
            onClick={async () => {
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
                }
              } catch (e) {
                setErr(e instanceof Error ? e.message : String(e));
              }
            }}
            style={primaryBtn}
          >
            Stripe 連携を続ける →
          </button>
        )}

        <Link href={backHref} style={backLink}>
          ← {backLabel}
        </Link>
      </div>
    </main>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #f1f5f9", fontSize: 13 }}>
      <span style={{ color: "#6b7280" }}>{k}</span>
      <strong>{v}</strong>
    </div>
  );
}

export default function ConnectReturnPage() {
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
const mutedText: React.CSSProperties = { color: "#6b7280", lineHeight: 1.7 };
const okBox: React.CSSProperties = {
  background: "#f0fdf4",
  border: "1px solid #bbf7d0",
  color: "#166534",
  padding: 12,
  borderRadius: 12,
  marginBottom: 16,
  fontWeight: 700,
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
const detailGrid: React.CSSProperties = { marginBottom: 16 };
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
