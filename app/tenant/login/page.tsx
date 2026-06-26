import type { CSSProperties } from "react";

export default async function TenantLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const hasError = params.error === "1";

  return (
    <main style={page}>
      <div style={card}>
        <h1 style={title}>契約者ログイン</h1>
        <p style={desc}>月極駐車場の契約者ページにログインします。</p>
        {hasError ? (
          <div style={errorBox}>メールアドレスまたはパスワードが正しくありません。</div>
        ) : null}
        <form method="post" action="/tenant/login/action" style={{ marginTop: 16 }}>
          <div style={{ marginBottom: 12 }}>
            <label style={label}>メールアドレス</label>
            <input type="email" name="email" style={input} placeholder="you@example.com" required />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={label}>パスワード</label>
            <input type="password" name="password" style={input} placeholder="********" required />
          </div>
          <button type="submit" style={button}>ログイン</button>
        </form>
      </div>
    </main>
  );
}

const page: CSSProperties = { minHeight: "100vh", background: "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 };
const card: CSSProperties = { width: "100%", maxWidth: 400, background: "#fff", borderRadius: 12, padding: 28, boxShadow: "0 1px 4px rgba(0,0,0,0.08)" };
const title: CSSProperties = { fontSize: 22, fontWeight: 700, margin: 0 };
const desc: CSSProperties = { fontSize: 14, color: "#555", marginTop: 6 };
const label: CSSProperties = { display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4 };
const input: CSSProperties = { width: "100%", padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 15, boxSizing: "border-box" };
const button: CSSProperties = { width: "100%", marginTop: 8, padding: "12px", background: "#111", color: "#fff", border: "none", borderRadius: 8, fontSize: 16, fontWeight: 600, cursor: "pointer" };
const errorBox: CSSProperties = { marginTop: 16, padding: "10px 14px", background: "#fef2f2", color: "#b91c1c", border: "1px solid #fecaca", borderRadius: 8, fontSize: 14 };
