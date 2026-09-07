"use client";

import { useState } from "react";

type Field = "email" | "plate";

type Props = {
  field: Field;
  reservationId: string;
  currentValue: string | null;
  onClose: () => void;
  /** 更新後に一覧を再読み込みさせる */
  onUpdated: (message: string) => void;
};

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.4)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 16,
  zIndex: 50,
};

const modalStyle: React.CSSProperties = {
  background: "#fff",
  borderRadius: 16,
  padding: 20,
  width: "100%",
  maxWidth: 460,
  boxSizing: "border-box",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: 10,
  borderRadius: 8,
  border: "1px solid #d1d5db",
  fontSize: 16,
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#666",
  marginBottom: 4,
};

export default function EditReservationFieldModal({
  field,
  reservationId,
  currentValue,
  onClose,
  onUpdated,
}: Props) {
  const isEmail = field === "email";

  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const [resendMail, setResendMail] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  // 更新は成功したがメール送信に失敗した状態。アドレスは直っているので再送だけやり直す。
  const [mailFailed, setMailFailed] = useState(false);
  const [resendMsg, setResendMsg] = useState("");

  async function submit() {
    const next = value.trim();

    if (!next) {
      setErr(isEmail ? "メールアドレスを入力してください" : "ナンバーを入力してください");
      return;
    }

    setBusy(true);
    setErr("");

    try {
      const res = await fetch(
        `/api/admin/reservations/${encodeURIComponent(reservationId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            field,
            value: next,
            reason,
            resendMail: isEmail ? resendMail : false,
          }),
        }
      );

      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.ok) {
        setErr(json?.message ?? json?.error ?? "更新に失敗しました");
        return;
      }

      if (json.mailSent === false) {
        // モーダルは閉じず、再送ボタンを出す
        setMailFailed(true);
        return;
      }

      onUpdated(
        isEmail
          ? json.mailSent
            ? "メールアドレスを更新し、確認メールを再送しました"
            : "メールアドレスを更新しました"
          : "ナンバーを更新しました"
      );
      onClose();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function retryMail() {
    setBusy(true);
    setErr("");
    setResendMsg("");

    try {
      const res = await fetch("/api/admin/emergency/resend-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reservationId,
          reason: reason || "メールアドレス変更後の再送",
        }),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.ok) {
        setErr(json?.message ?? json?.error ?? "再送に失敗しました");
        return;
      }

      setResendMsg(`確認メールを再送しました（宛先: ${json.to}）`);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 14 }}>
          {isEmail ? "メールアドレスの編集" : "ナンバーの変更"}
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={labelStyle}>現在の値</div>
          <div style={{ fontWeight: 700, wordBreak: "break-all" }}>
            {currentValue || "(未設定)"}
          </div>
        </div>

        {mailFailed ? (
          <>
            <div
              style={{
                padding: 12,
                borderRadius: 8,
                background: "#fef3c7",
                color: "#92400e",
                fontSize: 13,
                lineHeight: 1.8,
                marginBottom: 14,
              }}
            >
              アドレスは更新しましたが、確認メールの送信に失敗しました。
              <br />
              下のボタンから再送できます。
            </div>

            {resendMsg && (
              <div
                style={{
                  padding: 10,
                  borderRadius: 8,
                  background: "#dcfce7",
                  color: "#166534",
                  fontSize: 13,
                  marginBottom: 12,
                }}
              >
                {resendMsg}
              </div>
            )}

            {err && (
              <div style={{ color: "#b91c1c", fontSize: 13, marginBottom: 12 }}>
                {err}
              </div>
            )}

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                onClick={retryMail}
                disabled={busy}
                style={{
                  padding: "10px 16px",
                  borderRadius: 10,
                  border: "none",
                  background: busy ? "#d1d5db" : "#2563eb",
                  color: "#fff",
                  fontWeight: 800,
                  cursor: busy ? "not-allowed" : "pointer",
                }}
              >
                {busy ? "送信中..." : "確認メールを再送"}
              </button>
              <button
                onClick={() => {
                  onUpdated("メールアドレスを更新しました");
                  onClose();
                }}
                style={{
                  padding: "10px 16px",
                  borderRadius: 10,
                  border: "1px solid #d1d5db",
                  background: "#fff",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                閉じる
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={{ marginBottom: 12 }}>
              <div style={labelStyle}>
                {isEmail ? "新しいメールアドレス" : "新しいナンバー"}
              </div>
              <input
                type={isEmail ? "email" : "text"}
                value={value}
                onChange={(e) => {
                  setValue(e.target.value);
                  setErr("");
                }}
                placeholder={isEmail ? "name@example.com" : "品川 300 あ 12-34"}
                autoComplete={isEmail ? "email" : "off"}
                style={inputStyle}
              />
            </div>

            {isEmail && (
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 12,
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={resendMail}
                  onChange={(e) => setResendMail(e.target.checked)}
                />
                確認メールを再送する
              </label>
            )}

            <div style={{ marginBottom: 14 }}>
              <div style={labelStyle}>理由</div>
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="電話依頼 等"
                style={inputStyle}
              />
            </div>

            {err && (
              <div style={{ color: "#b91c1c", fontSize: 13, marginBottom: 12 }}>
                {err}
              </div>
            )}

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                onClick={submit}
                disabled={busy || !value.trim()}
                style={{
                  padding: "10px 16px",
                  borderRadius: 10,
                  border: "none",
                  background: busy || !value.trim() ? "#d1d5db" : "#111",
                  color: "#fff",
                  fontWeight: 800,
                  cursor: busy || !value.trim() ? "not-allowed" : "pointer",
                }}
              >
                {busy ? "更新中..." : "更新する"}
              </button>
              <button
                onClick={onClose}
                style={{
                  padding: "10px 16px",
                  borderRadius: 10,
                  border: "1px solid #d1d5db",
                  background: "#fff",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                キャンセル
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
