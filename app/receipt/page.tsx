"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function buildReceiptPdfUrl(params: {
  paymentRef: string;
  name: string;
  note: string;
}) {
  const qs = new URLSearchParams();
  qs.set("name", params.name);
  qs.set("note", params.note);
  return `/api/receipt/${encodeURIComponent(params.paymentRef)}/pdf?${qs.toString()}`;
}

function ReceiptRequestPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const paymentRef = String(searchParams.get("paymentRef") ?? "").trim();
  const defaultName = String(searchParams.get("name") ?? "").trim();
  const defaultNote = String(searchParams.get("note") ?? "").trim();

  const [receiptName, setReceiptName] = useState(defaultName || "上様");
  const [receiptNote, setReceiptNote] = useState(defaultNote || "駐車料金として");
  const [error, setError] = useState("");

  const previewUrl = useMemo(() => {
    if (!paymentRef) return "";
    return buildReceiptPdfUrl({
      paymentRef,
      name: receiptName.trim() || "上様",
      note: receiptNote.trim() || "駐車料金として",
    });
  }, [paymentRef, receiptName, receiptNote]);

  function handleOpenReceipt() {
    if (!paymentRef) {
      setError("paymentRef が不足しています。領収書リンクから開き直してください。");
      return;
    }

    setError("");
    window.open(previewUrl, "_blank");
  }

  return (
    <main style={pageStyle}>
      <h1 style={titleStyle}>領収書発行</h1>

      <div style={descStyle}>
        宛名と但し書きを入力して、領収書を表示できます。
        <br />
        日貸し・時間貸し共通で利用できます。
      </div>

      <div style={cardStyle}>
        <FormRow label="決済ID">
          <input
            value={paymentRef}
            readOnly
            placeholder="paymentRef"
            style={{ ...inputStyle, background: "#f9fafb", color: "#666" }}
          />
        </FormRow>

        <FormRow label="宛名">
          <input
            value={receiptName}
            onChange={(e) => setReceiptName(e.target.value)}
            placeholder="例: 株式会社〇〇 / 上様"
            style={inputStyle}
          />
        </FormRow>

        <FormRow label="但し書き">
          <input
            value={receiptNote}
            onChange={(e) => setReceiptNote(e.target.value)}
            placeholder="例: 駐車料金として"
            style={inputStyle}
          />
        </FormRow>

        <div style={helpBoxStyle}>
          よく使う例
          <br />
          ・宛名: 上様
          <br />
          ・但し書き: 駐車料金として
        </div>

        {error ? <div style={errorStyle}>{error}</div> : null}

        <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
          <button
            type="button"
            onClick={handleOpenReceipt}
            style={primaryButtonStyle}
          >
            領収書を表示する
          </button>

          <button
            type="button"
            onClick={() => router.back()}
            style={secondaryButtonStyle}
          >
            戻る
          </button>
        </div>
      </div>

      {paymentRef ? (
        <div style={previewBoxStyle}>
          <div style={previewLabelStyle}>生成URL</div>
          <div style={previewUrlStyle}>{previewUrl}</div>
        </div>
      ) : null}
    </main>
  );
}

export default function ReceiptRequestPage() {
  return (
    <Suspense fallback={<main style={pageStyle}>読み込み中...</main>}>
      <ReceiptRequestPageInner />
    </Suspense>
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
    <label style={{ display: "block", marginBottom: 16 }}>
      <div style={labelStyle}>{label}</div>
      {children}
    </label>
  );
}

const pageStyle: React.CSSProperties = {
  maxWidth: 720,
  margin: "0 auto",
  padding: 24,
};

const titleStyle: React.CSSProperties = {
  fontSize: 32,
  fontWeight: 900,
  marginBottom: 12,
};

const descStyle: React.CSSProperties = {
  color: "#555",
  lineHeight: 1.8,
  marginBottom: 20,
};

const cardStyle: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 16,
  padding: 20,
};

const labelStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  marginBottom: 8,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 44,
  borderRadius: 10,
  border: "1px solid #d1d5db",
  padding: "0 12px",
  fontSize: 16,
};

const helpBoxStyle: React.CSSProperties = {
  border: "1px solid #fde68a",
  background: "#fffbeb",
  color: "#92400e",
  borderRadius: 12,
  padding: 12,
  lineHeight: 1.8,
  fontSize: 14,
};

const errorStyle: React.CSSProperties = {
  marginTop: 12,
  border: "1px solid #fecaca",
  background: "#fef2f2",
  color: "#b91c1c",
  borderRadius: 12,
  padding: 12,
};

const primaryButtonStyle: React.CSSProperties = {
  width: "100%",
  height: 48,
  borderRadius: 12,
  border: "1px solid #111827",
  background: "#111827",
  color: "#fff",
  fontWeight: 800,
  fontSize: 16,
  cursor: "pointer",
};

const secondaryButtonStyle: React.CSSProperties = {
  width: "100%",
  height: 44,
  borderRadius: 12,
  border: "1px solid #d1d5db",
  background: "#fff",
  color: "#111",
  fontWeight: 700,
  fontSize: 16,
  cursor: "pointer",
};

const previewBoxStyle: React.CSSProperties = {
  marginTop: 20,
  background: "#f9fafb",
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  padding: 16,
};

const previewLabelStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: "#666",
  marginBottom: 8,
};

const previewUrlStyle: React.CSSProperties = {
  wordBreak: "break-all",
  fontSize: 13,
  color: "#374151",
  lineHeight: 1.7,
};