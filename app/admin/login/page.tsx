"use client";

import { useState } from "react";

export default function AdminLoginPage() {
  const [token, setToken] = useState("");
  const [msg, setMsg] = useState("");

  async function onLogin() {
    setMsg("");
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });

    if (res.ok) {
      location.href = "/admin";
    } else {
      setMsg("トークンが違います");
    }
  }

  return (
    <div style={{ maxWidth: 520, margin: "80px auto", padding: 24 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700 }}>管理者ログイン</h1>

      <input
        value={token}
        onChange={(e) => setToken(e.target.value)}
        placeholder="トークン"
        style={{
          width: "100%",
          padding: "12px 14px",
          borderRadius: 10,
          border: "1px solid #ccc",
          marginTop: 12,
        }}
      />

      <button
        onClick={onLogin}
        style={{
          marginTop: 14,
          padding: "12px 16px",
          borderRadius: 10,
          border: "1px solid #111",
          background: "#111",
          color: "#fff",
          fontWeight: 700,
          width: "100%",
        }}
      >
        ログイン
      </button>

      {msg && <p style={{ marginTop: 10 }}>{msg}</p>}
    </div>
  );
}