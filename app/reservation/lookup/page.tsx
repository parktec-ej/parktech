"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

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

const hintStyle: React.CSSProperties = {
  margin: "6px 0 0",
  fontSize: 12,
  color: COLORS.ink3,
  lineHeight: 1.7,
};

const fieldWrapStyle: React.CSSProperties = {
  marginBottom: 18,
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

const backLinkStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  marginTop: 16,
  padding: 13,
  textAlign: "center",
  borderRadius: 999,
  border: `1px solid ${COLORS.blue300}`,
  background: "#fff",
  color: COLORS.blue700,
  fontWeight: 700,
  fontSize: 15,
  textDecoration: "none",
  boxSizing: "border-box",
};

function BackToTopLink() {
  const [hovered, setHovered] = useState(false);

  return (
    <Link
      href="/"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...backLinkStyle,
        background: hovered ? COLORS.blue50 : "#fff",
      }}
    >
      トップページに戻る
    </Link>
  );
}

export default function ReservationLookupPage() {
  const router = useRouter();

  // 主導線：予約日 + PIN + ナンバー（+ 電話番号）で照合する
  const [date, setDate] = useState("");
  const [pin, setPin] = useState("");
  const [plate, setPlate] = useState("");
  const [phone, setPhone] = useState("");

  const [err, setErr] = useState("");
  const [notice, setNotice] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [focused, setFocused] = useState<string | null>(null);
  const [hovered, setHovered] = useState(false);

  // 副導線：PINが分からない方へメールで確認リンクを送る
  const [mailOpen, setMailOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [mailErr, setMailErr] = useState("");
  const [mailSending, setMailSending] = useState(false);
  const [mailDone, setMailDone] = useState<string | null>(null);

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

  async function handleVerify() {
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
    setVerifying(true);

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
      setVerifying(false);
    }
  }

  async function handleSendMail() {
    const value = email.trim();

    if (!value || !value.includes("@")) {
      setMailErr("メールアドレスを入力してください");
      return;
    }

    setMailErr("");
    setMailSending(true);

    try {
      const res = await fetch("/api/reservations/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: value }),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.ok) {
        // ロック時も「送信しました」の成功表示に落とさず、待ち時間を伝える
        setMailErr(
          json?.message ?? "送信に失敗しました。時間をおいてお試しください。"
        );
        return;
      }

      setMailDone(String(json.message ?? ""));
    } catch {
      setMailErr("送信に失敗しました。時間をおいてお試しください。");
    } finally {
      setMailSending(false);
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
            <label htmlFor="lookup-date" style={labelStyle}>
              ご利用日
            </label>
            <input
              id="lookup-date"
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
            <label htmlFor="lookup-pin" style={labelStyle}>
              PINコード
            </label>
            <input
              id="lookup-pin"
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
            <label htmlFor="lookup-plate" style={labelStyle}>
              車両ナンバー
            </label>
            <input
              id="lookup-plate"
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
            <p style={hintStyle}>スペースの有無や全角・半角は問いません。</p>
          </div>

          <div style={fieldWrapStyle}>
            <label htmlFor="lookup-phone" style={labelStyle}>
              電話番号
            </label>
            <input
              id="lookup-phone"
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
            disabled={verifying}
            onClick={handleVerify}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{
              ...buttonStyle,
              background:
                hovered && !verifying ? COLORS.blue800 : COLORS.blue700,
              opacity: verifying ? 0.6 : 1,
              cursor: verifying ? "not-allowed" : "pointer",
            }}
          >
            {verifying ? "照会中…" : "予約を照会する"}
          </button>

          <hr style={dividerStyle} />

          {/* 副導線：PINが分からない場合はメールで管理リンクを送る */}
          {mailDone === null ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setMailOpen((v) => !v);
                  setMailErr("");
                }}
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  borderRadius: 12,
                  border: `1px solid ${COLORS.line}`,
                  background: "#fff",
                  color: COLORS.blue700,
                  fontWeight: 700,
                  fontSize: 14,
                  textAlign: "left",
                  cursor: "pointer",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 8,
                }}
                aria-expanded={mailOpen}
              >
                <span>PINコードが分からない方はこちら</span>
                <span style={{ color: COLORS.ink3, fontSize: 12 }}>
                  {mailOpen ? "閉じる" : "開く"}
                </span>
              </button>

              {mailOpen && (
                <div
                  style={{
                    marginTop: 12,
                    padding: 16,
                    borderRadius: 12,
                    background: "#f9fafb",
                    border: `1px solid ${COLORS.line}`,
                  }}
                >
                  <p
                    style={{
                      margin: "0 0 14px",
                      fontSize: 13,
                      lineHeight: 1.9,
                      color: COLORS.ink2,
                    }}
                  >
                    ご予約時に入力されたメールアドレス宛に、確認・変更用のリンクをお送りします。
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
                      setMailErr("");
                    }}
                    onFocus={() => setFocused("email")}
                    onBlur={() => setFocused(null)}
                    style={inputStyle("email")}
                  />

                  {mailErr && (
                    <p
                      style={{
                        margin: "8px 0 0",
                        fontSize: 13,
                        color: "#dc2626",
                      }}
                    >
                      {mailErr}
                    </p>
                  )}

                  <p style={{ ...hintStyle, marginBottom: 14 }}>
                    ご予約完了メールを受け取ったアドレスをご入力ください。
                  </p>

                  <button
                    type="button"
                    disabled={mailSending}
                    onClick={handleSendMail}
                    style={{
                      ...buttonStyle,
                      fontSize: 15,
                      padding: "12px 18px",
                      background: mailSending ? "#d1d5db" : COLORS.blue700,
                      cursor: mailSending ? "not-allowed" : "pointer",
                    }}
                  >
                    {mailSending ? "送信中…" : "確認リンクを送る"}
                  </button>
                </div>
              )}
            </>
          ) : (
            <div
              style={{
                padding: 16,
                borderRadius: 12,
                background: COLORS.blue50,
                border: `1px solid ${COLORS.blue300}`,
              }}
            >
              <div
                style={{
                  fontSize: 15,
                  fontWeight: 700,
                  color: COLORS.blue700,
                  marginBottom: 6,
                }}
              >
                確認リンクを送信しました
              </div>
              <p
                style={{
                  margin: 0,
                  fontSize: 13,
                  lineHeight: 1.9,
                  color: COLORS.ink2,
                }}
              >
                {mailDone}
                <br />
                メールが届かない場合は、迷惑メールフォルダをご確認ください。
              </p>
            </div>
          )}

          <hr style={dividerStyle} />

          <p style={noteStyle}>
            ご利用日の24時間前まで変更できます。
            <br />
            ご入力内容が確認できない場合や、バスでのご予約は{" "}
            <a
              href="tel:05017934785"
              style={{ color: COLORS.blue700, fontWeight: 700 }}
            >
              050-1793-4785
            </a>{" "}
            までお電話ください。
          </p>

          <BackToTopLink />
        </div>
      </div>
    </div>
  );
}
