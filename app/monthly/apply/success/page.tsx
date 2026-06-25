export const metadata = {
  title: "お申し込みを受け付けました | 月極駐車場 | ParkTec",
};

export default function MonthlyApplySuccessPage() {
  return (
    <main style={pageStyle}>
      <div style={cardStyle}>
        <div style={iconStyle}>🏠</div>
        <h1 style={titleStyle}>お申し込みを受け付けました</h1>
        <p style={textStyle}>
          月極駐車場のお申し込みありがとうございます。
          <br />
          ご入力いただいたメールアドレスに受付確認メールをお送りしました。
        </p>
        <div style={noteStyle}>
          ※ この時点では契約は成立しておりません。
          <br />
          内容を確認のうえ、担当者よりご連絡し、お支払い手続きのご案内をお送りします。
        </div>
        <p style={subTextStyle}>
          メールが届かない場合は、迷惑メールフォルダをご確認ください。
        </p>
        <a href="/" style={homeLinkStyle}>
          トップへ戻る
        </a>
      </div>
    </main>
  );
}

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "#f9fafb",
  padding: 24,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};
const cardStyle: React.CSSProperties = {
  maxWidth: 520,
  width: "100%",
  border: "1px solid #e5e7eb",
  borderRadius: 20,
  background: "#fff",
  padding: 32,
  textAlign: "center",
};
const iconStyle: React.CSSProperties = { fontSize: 48 };
const titleStyle: React.CSSProperties = {
  margin: "12px 0 0",
  fontSize: 24,
  fontWeight: 900,
  color: "#111827",
};
const textStyle: React.CSSProperties = {
  marginTop: 14,
  color: "#374151",
  lineHeight: 1.8,
  fontSize: 15,
};
const noteStyle: React.CSSProperties = {
  marginTop: 18,
  border: "1px solid #fde68a",
  background: "#fffbeb",
  color: "#92400e",
  borderRadius: 14,
  padding: "14px 16px",
  fontSize: 13,
  lineHeight: 1.7,
  textAlign: "left",
};
const subTextStyle: React.CSSProperties = {
  marginTop: 16,
  color: "#6b7280",
  fontSize: 13,
};
const homeLinkStyle: React.CSSProperties = {
  display: "inline-block",
  marginTop: 20,
  border: "1px solid #111827",
  borderRadius: 12,
  background: "#111827",
  color: "#fff",
  padding: "12px 20px",
  fontWeight: 800,
  textDecoration: "none",
};
