import type { CSSProperties } from "react";

type SearchParams = Promise<{
  error?: string;
}>;

export default async function AgentLoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const hasError = params.error === "1";

  return (
    <main style={pageStyle}>
      <div style={cardStyle}>
        <h1 style={titleStyle}>代理店ログイン</h1>
        <p style={descStyle}>
          代理店アカウントでログインしてください。
        </p>

        {hasError ? (
          <div style={errorBoxStyle}>
            メールアドレスまたはパスワードが正しくありません。
          </div>
        ) : null}

        <form method="post" action="/agent/login/action" style={formStyle}>
          <div style={fieldStyle}>
            <label style={labelStyle}>メールアドレス</label>
            <input
              type="email"
              name="email"
              className="agent-login-email"
              style={inputStyle}
              placeholder="agent@example.com"
              required
            />
          </div>

          <div style={fieldStyle}>
            <label style={labelStyle}>パスワード</label>
            <input
              type="password"
              name="password"
              className="agent-login-password"
              style={inputStyle}
              placeholder="********"
              required
            />
          </div>

          <button type="submit" style={buttonStyle}>
            ログイン
          </button>
        </form>
      </div>
    </main>
  );
}

const pageStyle: CSSProperties = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
  background: "#f9fafb",
};

const cardStyle: CSSProperties = {
  width: "100%",
  maxWidth: 460,
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 24,
  padding: 32,
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: 32,
  fontWeight: 800,
  color: "#111827",
};

const descStyle: CSSProperties = {
  marginTop: 12,
  marginBottom: 0,
  color: "#6b7280",
  lineHeight: 1.7,
};

const errorBoxStyle: CSSProperties = {
  marginTop: 20,
  border: "1px solid #fecaca",
  background: "#fef2f2",
  color: "#991b1b",
  borderRadius: 14,
  padding: "12px 14px",
  fontSize: 14,
  fontWeight: 700,
};

const formStyle: CSSProperties = {
  display: "grid",
  gap: 16,
  marginTop: 24,
};

const fieldStyle: CSSProperties = {
  display: "grid",
  gap: 8,
};

const labelStyle: CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  color: "#374151",
};

const inputStyle: CSSProperties = {
  width: "100%",
  border: "1px solid #d1d5db",
  borderRadius: 14,
  padding: "12px 14px",
  fontSize: 16,
};

const buttonStyle: CSSProperties = {
  border: "none",
  borderRadius: 14,
  background: "#111827",
  color: "#fff",
  padding: "14px 18px",
  fontSize: 16,
  fontWeight: 700,
  cursor: "pointer",
};