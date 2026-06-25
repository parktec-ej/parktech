export default function MonthlyCompletePage() {
  return (
    <main style={{ minHeight: "100vh", background: "#f3f4f6", padding: "48px 16px", display: "flex", justifyContent: "center" }}>
      <div style={{ maxWidth: 480, background: "#fff", borderRadius: 12, padding: 32, textAlign: "center", boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
        <div style={{ fontSize: 40 }}>🎉</div>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginTop: 8 }}>お支払いが完了しました</h1>
        <p style={{ color: "#555", lineHeight: 1.8, marginTop: 12 }}>
          ご契約が成立しました。契約者ページのログイン情報を記載した確認メールをお送りしましたのでご確認ください。
        </p>
      </div>
    </main>
  );
}
