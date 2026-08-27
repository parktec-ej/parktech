"use client";

import { useState } from "react";

const COLORS = {
  blue900: "#12266b",
  blue800: "#1a3a9c",
  blue700: "#1d4ed8",
  blue600: "#2563eb",
  blue300: "#93c5fd",
  blue50: "#eff6ff",
  ink: "#111827",
  ink2: "#4b5563",
  ink3: "#6b7280",
  line: "#e5e7eb",
  page: "#f7f8fb",
};

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: COLORS.page,
  color: COLORS.ink,
};

const heroStyle: React.CSSProperties = {
  background: `linear-gradient(160deg, ${COLORS.blue800}, ${COLORS.blue600})`,
  color: "#fff",
  textAlign: "center",
  padding: "34px 20px 30px",
};

const containerStyle: React.CSSProperties = {
  maxWidth: 560,
  margin: "0 auto",
  padding: "20px 16px 48px",
};

const cardStyle: React.CSSProperties = {
  background: "#fff",
  border: `1px solid ${COLORS.line}`,
  borderRadius: 18,
  padding: "24px 20px",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 14,
  fontWeight: 700,
  color: COLORS.ink,
  marginBottom: 8,
};

const buttonStyle: React.CSSProperties = {
  width: "100%",
  border: "none",
  borderRadius: 999,
  background: COLORS.blue700,
  color: "#fff",
  fontSize: 16,
  fontWeight: 700,
  padding: "14px 20px",
  cursor: "pointer",
};

const dividerStyle: React.CSSProperties = {
  border: "none",
  borderTop: `1px solid ${COLORS.line}`,
  margin: "22px 0 16px",
};

const noteStyle: React.CSSProperties = {
  fontSize: 13,
  lineHeight: 1.9,
  color: COLORS.ink3,
  margin: 0,
};

export default function ReservationLookupPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [doneMessage, setDoneMessage] = useState<string | null>(null);

  const inputStyle: React.CSSProperties = {
    width: "100%",
    boxSizing: "border-box",
    borderRadius: 12,
    border: `1px solid ${focused ? COLORS.blue600 : COLORS.line}`,
    boxShadow: focused ? "0 0 0 3px rgba(37,99,235,.18)" : "none",
    outline: "none",
    fontSize: 16,
    padding: "12px 14px",
    color: COLORS.ink,
    background: "#fff",
  };

  async function handleSubmit() {
    const value = email.trim();

    if (!value || !value.includes("@")) {
      setError("メールアドレスを入力してください");
      return;
    }

    setError(null);
    setSending(true);

    try {
      const res = await fetch("/api/reservations/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: value }),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.ok) {
        setError(json?.message ?? "送信に失敗しました。時間をおいてお試しください。");
        return;
      }

      setDoneMessage(String(json.message ?? ""));
    } catch {
      setError("送信に失敗しました。時間をおいてお試しください。");
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={pageStyle}>
      <div style={heroStyle}>
        <h1 style={{ margin: 0, fontSize: 25, fontWeight: 700, color: "#fff" }}>
          予約内容の確認・変更
        </h1>
        <p style={{ margin: "8px 0 0", fontSize: 14, color: COLORS.blue300 }}>
          日付の変更・キャンセルはこちらから
        </p>
      </div>

      <div style={containerStyle}>
        {doneMessage === null ? (
          <div style={cardStyle}>
            <p
              style={{
                margin: "0 0 20px",
                fontSize: 14,
                lineHeight: 1.9,
                color: COLORS.ink2,
              }}
            >
              ご予約時に入力されたメールアドレスをお知らせください。
              <br />
              確認・変更用のリンクをメールでお送りします。
            </p>

            <label htmlFor="lookup-email" style={labelStyle}>
              メールアドレス
            </label>

            <input
              id="lookup-email"
              type="email"
              value={email}
              placeholder="name@example.com"
              autoComplete="email"
              onChange={(e) => {
                setEmail(e.target.value);
                setError(null);
              }}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              style={inputStyle}
            />

            {error ? (
              <p style={{ margin: "8px 0 0", fontSize: 13, color: "#dc2626" }}>
                {error}
              </p>
            ) : null}

            <p style={{ margin: "8px 0 20px", fontSize: 13, color: COLORS.ink3 }}>
              ご予約完了メールを受け取ったアドレスをご入力ください。
            </p>

            <button
              type="button"
              disabled={sending}
              onClick={handleSubmit}
              onMouseEnter={() => setHovered(true)}
              onMouseLeave={() => setHovered(false)}
              style={{
                ...buttonStyle,
                background: hovered && !sending ? COLORS.blue800 : COLORS.blue700,
                opacity: sending ? 0.6 : 1,
                cursor: sending ? "not-allowed" : "pointer",
              }}
            >
              {sending ? "送信中…" : "確認リンクを送る"}
            </button>

            <hr style={dividerStyle} />

            <p style={noteStyle}>
              ご利用日の24時間前まで変更できます。
              <br />
              お急ぎの場合は{" "}
              <a href="tel:05017934785" style={{ color: COLORS.blue700, fontWeight: 700 }}>
                050-1793-4785
              </a>{" "}
              までお電話ください。
            </p>
          </div>
        ) : (
          <div style={{ ...cardStyle, textAlign: "center" }}>
            <div
              style={{
                width: 54,
                height: 54,
                borderRadius: 999,
                background: COLORS.blue50,
                color: COLORS.blue700,
                fontSize: 26,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto",
              }}
            >
              ✓
            </div>

            <h2 style={{ margin: "16px 0 0", fontSize: 19, fontWeight: 700 }}>
              確認リンクを送信しました
            </h2>

            <p
              style={{
                margin: "12px 0 0",
                fontSize: 14,
                lineHeight: 1.9,
                color: COLORS.ink2,
              }}
            >
              {doneMessage}
            </p>

            <hr style={dividerStyle} />

            <p style={{ ...noteStyle, textAlign: "left" }}>
              メールが届かない場合は、迷惑メールフォルダをご確認ください。
              <br />
              それでも見つからない場合は{" "}
              <a href="tel:05017934785" style={{ color: COLORS.blue700, fontWeight: 700 }}>
                050-1793-4785
              </a>{" "}
              までお問い合わせください。
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
