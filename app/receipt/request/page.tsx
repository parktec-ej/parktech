"use client";

import Link from "next/link";
import { Suspense, useMemo, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";

function ReceiptRequestPageInner() {
  const searchParams = useSearchParams();
  const paymentRefParam = searchParams.get("paymentRef") ?? "";
  const reservationId = searchParams.get("reservationId") ?? "";

  const [name, setName] = useState("");
  const [note, setNote] = useState("駐車場利用料として");
  const [touched, setTouched] = useState(false);
  const [paymentRef, setPaymentRef] = useState(paymentRefParam);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    try {
      const savedName = localStorage.getItem("parktech_receipt_name");
      const savedNote = localStorage.getItem("parktech_receipt_note");

      if (savedName) setName(savedName);
      if (savedNote) setNote(savedNote);
    } catch {}
  }, []);

  useEffect(() => {
    if (!touched) return;

    try {
      localStorage.setItem("parktech_receipt_name", name);
      localStorage.setItem("parktech_receipt_note", note);
    } catch {}
  }, [name, note, touched]);

  // Resolve paymentRef from reservationId when only the latter is given
  useEffect(() => {
    if (paymentRefParam) return;
    if (!reservationId) return;
    let cancelled = false;
    setResolving(true);
    setResolveError(null);
    fetch(
      `/api/receipt/by-reservation?reservationId=${encodeURIComponent(reservationId)}`,
      { cache: "no-store" }
    )
      .then(async (res) => {
        const json = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok || !json?.ok || !json?.paymentRef) {
          setResolveError(
            json?.error === "paymentRef_not_found"
              ? "この予約に対応する決済情報が見つかりませんでした。"
              : "予約情報の取得に失敗しました。"
          );
          return;
        }
        setPaymentRef(String(json.paymentRef));
      })
      .catch(() => {
        if (cancelled) return;
        setResolveError("通信エラーが発生しました。");
      })
      .finally(() => {
        if (!cancelled) setResolving(false);
      });
    return () => {
      cancelled = true;
    };
  }, [paymentRefParam, reservationId]);

  const pdfUrl = useMemo(() => {
    if (!paymentRef) return "#";

    const qs = new URLSearchParams({
      name: name.trim() || "ご利用者様",
      note: note.trim() || "駐車場利用料として",
    });

    return `/api/receipt/${encodeURIComponent(paymentRef)}/pdf?${qs.toString()}`;
  }, [paymentRef, name, note]);

  const nameError = name.trim().length === 0;

  if (!paymentRefParam && !reservationId) {
    return (
      <main style={pageStyle}>
        <div style={cardStyle}>
          <h1 style={titleStyle}>領収書発行</h1>
          <p style={mutedStyle}>
            paymentRef または reservationId が見つかりません。メール内のリンクからもう一度お開きください。
          </p>
          <div style={{ marginTop: 20 }}>
            <Link href="/" style={backLinkStyle}>
              トップへ戻る
            </Link>
          </div>
        </div>
      </main>
    );
  }

  if (resolving) {
    return (
      <main style={pageStyle}>
        <div style={cardStyle}>
          <h1 style={titleStyle}>領収書発行</h1>
          <p style={mutedStyle}>予約情報を読み込んでいます...</p>
        </div>
      </main>
    );
  }

  if (!paymentRef) {
    return (
      <main style={pageStyle}>
        <div style={cardStyle}>
          <h1 style={titleStyle}>領収書発行</h1>
          <p style={mutedStyle}>
            {resolveError ??
              "決済情報が見つかりません。メール内のリンクからもう一度お開きください。"}
          </p>
          <div style={{ marginTop: 20 }}>
            <Link href="/" style={backLinkStyle}>
              トップへ戻る
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main style={pageStyle}>
      <div style={cardStyle}>
        <div style={badgeStyle}>ParkTec</div>

        <h1 style={titleStyle}>領収書発行</h1>

        <p style={leadStyle}>
          宛名と但し書きを入力すると、領収書を表示できます。
        </p>

        <div style={infoBoxStyle}>
          <div style={infoLabelStyle}>決済参照ID</div>
          <div style={infoValueStyle}>{paymentRef}</div>
        </div>

        <div style={formGroupStyle}>
          <label htmlFor="receipt-name" style={labelStyle}>
            宛名 <span style={requiredStyle}>必須</span>
          </label>
          <input
            id="receipt-name"
            type="text"
            inputMode="text"
            autoComplete="organization"
            value={name}
            onChange={(e) => {
              setTouched(true);
              setName(e.target.value);
            }}
            placeholder="例）株式会社〇〇 / 山田 太郎"
            style={{
              ...inputStyle,
              borderColor: nameError ? "#fca5a5" : "#d1d5db",
              background: "#fff",
            }}
          />
          {nameError ? (
            <div style={errorStyle}>宛名を入力してください。</div>
          ) : (
            <div style={helpStyle}>
              法人名・屋号・個人名のいずれでも入力できます。
            </div>
          )}
        </div>

        <div style={formGroupStyle}>
          <label htmlFor="receipt-note" style={labelStyle}>
            但し書き <span style={optionalStyle}>任意</span>
          </label>
          <input
            id="receipt-note"
            type="text"
            inputMode="text"
            autoComplete="off"
            value={note}
            onChange={(e) => {
              setTouched(true);
              setNote(e.target.value);
            }}
            placeholder="例）駐車場利用料として"
            style={inputStyle}
          />
          <div style={helpStyle}>
            未入力でも「駐車場利用料として」が入ります。
          </div>
        </div>

        <div style={previewBoxStyle}>
          <div style={previewTitleStyle}>プレビュー</div>
          <div style={previewRowStyle}>
            <span style={previewKeyStyle}>宛名</span>
            <strong>{name.trim() || "ご利用者様"}</strong>
          </div>
          <div style={previewRowStyle}>
            <span style={previewKeyStyle}>但し書き</span>
            <strong>{note.trim() || "駐車場利用料として"}</strong>
          </div>
        </div>

        <a
          href={nameError ? "#" : pdfUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => {
            if (nameError) {
              e.preventDefault();
              setTouched(true);
            }
          }}
          style={{
            ...primaryButtonStyle,
            opacity: nameError ? 0.55 : 1,
            pointerEvents: "auto",
          }}
        >
          領収書を表示する
        </a>

        <div style={subActionsStyle}>
          <button
            type="button"
            onClick={() => {
              setTouched(true);
              setName("");
              setNote("駐車場利用料として");
              try {
                localStorage.removeItem("parktech_receipt_name");
                localStorage.removeItem("parktech_receipt_note");
              } catch {}
            }}
            style={secondaryButtonStyle}
          >
            入力をリセット
          </button>
        </div>

        <p style={footNoteStyle}>
          表示後、ブラウザの「印刷 / PDF保存」から保存できます。
        </p>
      </div>
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

const pageStyle: React.CSSProperties = {
  minHeight: "100dvh",
  background: "#f8fafc",
  padding: "24px 16px 40px",
};

const cardStyle: React.CSSProperties = {
  maxWidth: 560,
  margin: "0 auto",
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 20,
  padding: 20,
  boxShadow: "0 8px 30px rgba(0,0,0,0.04)",
};

const badgeStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "6px 10px",
  borderRadius: 999,
  background: "#111827",
  color: "#fff",
  fontSize: 12,
  fontWeight: 800,
  marginBottom: 12,
};

const titleStyle: React.CSSProperties = {
  fontSize: 28,
  fontWeight: 900,
  margin: "0 0 8px",
  color: "#111827",
};

const leadStyle: React.CSSProperties = {
  margin: "0 0 18px",
  color: "#4b5563",
  lineHeight: 1.7,
  fontSize: 14,
};

const mutedStyle: React.CSSProperties = {
  color: "#4b5563",
  lineHeight: 1.8,
};

const infoBoxStyle: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  background: "#f9fafb",
  borderRadius: 14,
  padding: 14,
  marginBottom: 18,
};

const infoLabelStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#6b7280",
  marginBottom: 4,
};

const infoValueStyle: React.CSSProperties = {
  fontSize: 13,
  color: "#111827",
  wordBreak: "break-all",
  fontWeight: 700,
};

const formGroupStyle: React.CSSProperties = {
  marginBottom: 18,
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 14,
  fontWeight: 800,
  marginBottom: 8,
  color: "#111827",
};

const requiredStyle: React.CSSProperties = {
  color: "#dc2626",
  fontSize: 12,
  marginLeft: 6,
};

const optionalStyle: React.CSSProperties = {
  color: "#6b7280",
  fontSize: 12,
  marginLeft: 6,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 48,
  padding: "12px 14px",
  borderRadius: 12,
  border: "1px solid #d1d5db",
  fontSize: 16,
  outline: "none",
  boxSizing: "border-box",
};

const helpStyle: React.CSSProperties = {
  marginTop: 8,
  fontSize: 12,
  color: "#6b7280",
  lineHeight: 1.6,
};

const errorStyle: React.CSSProperties = {
  marginTop: 8,
  fontSize: 12,
  color: "#dc2626",
  lineHeight: 1.6,
  fontWeight: 700,
};

const previewBoxStyle: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  background: "#fafafa",
  borderRadius: 14,
  padding: 14,
  marginBottom: 18,
};

const previewTitleStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 800,
  color: "#374151",
  marginBottom: 10,
};

const previewRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
  padding: "6px 0",
  borderBottom: "1px solid #f1f5f9",
};

const previewKeyStyle: React.CSSProperties = {
  color: "#6b7280",
  fontSize: 13,
  minWidth: 70,
};

const primaryButtonStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "center",
  textDecoration: "none",
  background: "#111827",
  color: "#fff",
  borderRadius: 14,
  padding: "14px 16px",
  fontWeight: 900,
  fontSize: 16,
};

const subActionsStyle: React.CSSProperties = {
  marginTop: 12,
  display: "flex",
  justifyContent: "center",
};

const secondaryButtonStyle: React.CSSProperties = {
  appearance: "none",
  border: "1px solid #d1d5db",
  background: "#fff",
  color: "#111827",
  borderRadius: 12,
  padding: "10px 14px",
  fontWeight: 800,
  cursor: "pointer",
};

const footNoteStyle: React.CSSProperties = {
  marginTop: 16,
  fontSize: 12,
  color: "#6b7280",
  lineHeight: 1.7,
  textAlign: "center",
};

const backLinkStyle: React.CSSProperties = {
  display: "inline-block",
  textDecoration: "none",
  color: "#2563eb",
  fontWeight: 800,
};