"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const COLORS = {
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

const hintStyle: React.CSSProperties = {
  margin: "6px 0 0",
  fontSize: 12,
  color: COLORS.ink3,
  lineHeight: 1.7,
};

const fieldWrapStyle: React.CSSProperties = {
  marginBottom: 18,
};

const dividerStyle: React.CSSProperties = {
  border: "none",
  borderTop: `1px solid ${COLORS.line}`,
  margin: "22px 0 16px",
};

export default function ReservationVerifyPage() {
  const router = useRouter();

  const [date, setDate] = useState("");
  const [pin, setPin] = useState("");
  const [plate, setPlate] = useState("");
  const [phone, setPhone] = useState("");

  const [err, setErr] = useState("");
  const [notice, setNotice] = useState("");
  const [sending, setSending] = useState(false);
  const [focused, setFocused] = useState<string | null>(null);
  const [hovered, setHovered] = useState(false);

  function inputStyle(name: string): React.CSSProperties {
    return {
      width: "100%",
      boxSizing: "border-box",
      borderRadius: 12,
      border: `1px solid ${focused === name ? COLORS.blue600 : COLORS.line}`,
      boxShadow: focused === name ? "0 0 0 3px rgba(37,99,235,.18)" : "none",
      outline: "none",
      fontSize: 16,
      padding: "12px 14px",
      color: COLORS.ink,
      background: "#fff",
    };
  }

  function clearMessages() {
    setErr("");
    setNotice("");
  }

  async function handleSubmit() {
    if (!date) {
      setErr("ご利用日を選択してください");
      return;
    }
    if (!pin.trim()) {
      setErr("PINコードを入力してください");
      return;
    }
    if (!plate.trim()) {
      setErr("車両ナンバーを入力してください");
      return;
    }

    clearMessages();
    setSending(true);

    try {
      const res = await fetch("/api/reservations/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          pin: pin.trim(),
          plate: plate.trim(),
          phone: phone.trim(),
        }),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.ok) {
        // 対象外予約とレート制限は電話案内を含む別扱いの文言
        if (json?.error === "unsupported" || json?.error === "rate_limited") {
          setNotice(json.message);
          return;
        }

        setErr(json?.message ?? "照会に失敗しました");
        return;
      }

      router.push(json.manageUrl);
    } catch {
      setErr("照会に失敗しました。時間をおいてお試しください。");
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={pageStyle}>
      <div style={heroStyle}>
        <h1 style={{ margin: 0, fontSize: 25, fontWeight: 700, color: "#fff" }}>
          ご予約の照会
        </h1>
        <p style={{ margin: "8px 0 0", fontSize: 14, color: COLORS.blue300 }}>
          メールが届かない方はこちらから
        </p>
      </div>

      <div style={containerStyle}>
        <div style={cardStyle}>
          <p
            style={{
              margin: "0 0 20px",
              fontSize: 14,
              lineHeight: 1.9,
              color: COLORS.ink2,
            }}
          >
            ご予約完了メールに記載の内容をご入力ください。
            <br />
            確認できましたら、予約内容の確認・変更画面へ進みます。
          </p>

          <div style={fieldWrapStyle}>
            <label htmlFor="verify-date" style={labelStyle}>
              ご利用日
            </label>
            <input
              id="verify-date"
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                clearMessages();
              }}
              onFocus={() => setFocused("date")}
              onBlur={() => setFocused(null)}
              style={inputStyle("date")}
            />
          </div>

          <div style={fieldWrapStyle}>
            <label htmlFor="verify-pin" style={labelStyle}>
              PINコード
            </label>
            <input
              id="verify-pin"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={pin}
              placeholder="4桁の数字"
              onChange={(e) => {
                setPin(e.target.value);
                clearMessages();
              }}
              onFocus={() => setFocused("pin")}
              onBlur={() => setFocused(null)}
              style={inputStyle("pin")}
            />
            <p style={hintStyle}>ご予約完了メールに記載の4桁の数字です。</p>
          </div>

          <div style={fieldWrapStyle}>
            <label htmlFor="verify-plate" style={labelStyle}>
              車両ナンバー
            </label>
            <input
              id="verify-plate"
              type="text"
              value={plate}
              placeholder="例: 宮城300 あ 1234"
              onChange={(e) => {
                setPlate(e.target.value);
                clearMessages();
              }}
              onFocus={() => setFocused("plate")}
              onBlur={() => setFocused(null)}
              style={inputStyle("plate")}
            />
            <p style={hintStyle}>
              スペースの有無や全角・半角は問いません。
            </p>
          </div>

          <div style={fieldWrapStyle}>
            <label htmlFor="verify-phone" style={labelStyle}>
              電話番号
            </label>
            <input
              id="verify-phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={phone}
              placeholder="例: 090-1234-5678"
              onChange={(e) => {
                setPhone(e.target.value);
                clearMessages();
              }}
              onFocus={() => setFocused("phone")}
              onBlur={() => setFocused(null)}
              style={inputStyle("phone")}
            />
            <p style={hintStyle}>
              ご予約時に電話番号をご登録いただいた場合は、必ずご入力ください。
            </p>
          </div>

          {err && (
            <p style={{ margin: "0 0 12px", fontSize: 13, color: "#dc2626" }}>
              {err}
            </p>
          )}

          {notice && (
            <div
              style={{
                margin: "0 0 12px",
                padding: "12px 14px",
                borderRadius: 12,
                background: "#fef3c7",
                color: "#92400e",
                fontSize: 13,
                lineHeight: 1.9,
              }}
            >
              {notice}
            </div>
          )}

          <button
            type="button"
            disabled={sending}
            onClick={handleSubmit}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{
              width: "100%",
              border: "none",
              borderRadius: 999,
              background:
                hovered && !sending ? COLORS.blue800 : COLORS.blue700,
              color: "#fff",
              fontSize: 16,
              fontWeight: 700,
              padding: "14px 20px",
              cursor: sending ? "not-allowed" : "pointer",
              opacity: sending ? 0.6 : 1,
            }}
          >
            {sending ? "照会中…" : "予約を照会する"}
          </button>

          <hr style={dividerStyle} />

          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.9, color: COLORS.ink3 }}>
            ご入力内容が確認できない場合や、バスでのご予約は{" "}
            <a href="tel:05017934785" style={{ color: COLORS.blue700, fontWeight: 700 }}>
              050-1793-4785
            </a>{" "}
            までお電話ください。
          </p>
        </div>
      </div>
    </div>
  );
}
