"use client";

import { useState } from "react";

export default function PasswordChange() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setMsg(null);
    if (!current || !next) {
      setMsg({ type: "err", text: "現在のパスワードと新しいパスワードを入力してください。" });
      return;
    }
    if (next.length < 8) {
      setMsg({ type: "err", text: "新しいパスワードは8文字以上にしてください。" });
      return;
    }
    if (next !== confirm) {
      setMsg({ type: "err", text: "新しいパスワード（確認）が一致しません。" });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/tenant/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setMsg({ type: "err", text: data.message || "変更に失敗しました。" });
        setBusy(false);
        return;
      }
      setMsg({ type: "ok", text: "パスワードを変更しました。" });
      setCurrent(""); setNext(""); setConfirm("");
      setBusy(false);
    } catch {
      setMsg({ type: "err", text: "通信エラーが発生しました。" });
      setBusy(false);
    }
  }

  return (
    <div>
      <div style={{ display: "grid", gap: 10, maxWidth: 360 }}>
        <input type="password" placeholder="現在のパスワード" value={current} onChange={(e) => setCurrent(e.target.value)} style={inp} />
        <input type="password" placeholder="新しいパスワード（8文字以上）" value={next} onChange={(e) => setNext(e.target.value)} style={inp} />
        <input type="password" placeholder="新しいパスワード（確認）" value={confirm} onChange={(e) => setConfirm(e.target.value)} style={inp} />
        <button onClick={submit} disabled={busy} style={btn}>{busy ? "変更中..." : "パスワードを変更"}</button>
      </div>
      {msg ? <p style={{ marginTop: 10, fontSize: 13, color: msg.type === "ok" ? "#166534" : "#b91c1c" }}>{msg.text}</p> : null}
    </div>
  );
}

const inp: React.CSSProperties = { padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 14 };
const btn: React.CSSProperties = { padding: "10px", background: "#111", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer" };
