"use client";

import { useState } from "react";

export default function BusAdminLoginPage() {
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setLoading(true);

    try {
      const res = await fetch("/api/partner/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loginId, password }),
      });

      const json = await res.json();

      if (!json.ok) {
        setErr("ログインに失敗しました");
        return;
      }

      window.location.href = "/partner/bus-reserve";
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 420, margin: "48px auto", padding: 24 }}>
      <h1 style={{ fontSize: 24, fontWeight: 900, marginBottom: 16 }}>
        バス管理ログイン
      </h1>

      <form
        onSubmit={submit}
        style={{
          border: "1px solid #eee",
          borderRadius: 16,
          padding: 16,
          background: "#fff",
        }}
      >
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>
            ログインID
          </div>
          <input
            value={loginId}
            onChange={(e) => setLoginId(e.target.value)}
            autoComplete="username"
            style={{
              width: "100%",
              padding: 12,
              borderRadius: 12,
              border: "1px solid #ddd",
            }}
          />
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>
            パスワード
          </div>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            style={{
              width: "100%",
              padding: 12,
              borderRadius: 12,
              border: "1px solid #ddd",
            }}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          style={{
            width: "100%",
            padding: 12,
            borderRadius: 12,
            border: "1px solid #111",
            background: "#111",
            color: "#fff",
            fontWeight: 800,
            cursor: "pointer",
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? "ログイン中..." : "ログイン"}
        </button>

        {err ? (
          <div style={{ marginTop: 12, color: "crimson", fontWeight: 700 }}>
            {err}
          </div>
        ) : null}
      </form>
    </div>
  );
}
