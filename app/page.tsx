import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "ParkTec East Japan — 駐車場のご予約",
  description:
    "セキスイハイムスーパーアリーナ・QアンドAスタジアム隣接。コンサート・イベント当日の駐車場を事前予約で確保できます。",
};

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

const STATS = [
  { value: "24H", label: "無人運営" },
  { value: "QR", label: "かざすだけ入出庫" },
  { value: "事前", label: "キャッシュレス決済" },
];

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: COLORS.page,
  color: COLORS.ink,
};

const heroStyle: React.CSSProperties = {
  background: `linear-gradient(160deg, ${COLORS.blue800}, ${COLORS.blue600})`,
  color: "#fff",
  textAlign: "center",
  padding: "56px 20px 44px",
};

const heroInnerStyle: React.CSSProperties = {
  maxWidth: 560,
  margin: "0 auto",
};

const badgeStyle: React.CSSProperties = {
  display: "inline-block",
  background: "rgba(255,255,255,0.15)",
  borderRadius: 999,
  padding: "8px 20px",
  fontSize: 14,
  color: "#fff",
};

const siteNameStyle: React.CSSProperties = {
  margin: "20px 0 24px",
  fontSize: 26,
  fontWeight: 700,
  letterSpacing: "0.12em",
  color: "#fff",
};

const headingStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 34,
  fontWeight: 700,
  lineHeight: 1.35,
  color: "#fff",
};

const subStyle: React.CSSProperties = {
  margin: "20px 0 0",
  fontSize: 14,
  lineHeight: 1.9,
  color: COLORS.blue300,
};

const heroButtonBaseStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  boxSizing: "border-box",
  borderRadius: 999,
  padding: 15,
  textAlign: "center",
  fontWeight: 700,
  fontSize: 16,
  textDecoration: "none",
};

const primaryButtonStyle: React.CSSProperties = {
  ...heroButtonBaseStyle,
  background: "#fff",
  color: COLORS.blue700,
};

const secondaryButtonStyle: React.CSSProperties = {
  ...heroButtonBaseStyle,
  background: "rgba(255,255,255,0.18)",
  color: "#fff",
  border: "1px solid rgba(255,255,255,0.4)",
};

const statsRowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, 1fr)",
  gap: 12,
  marginTop: 40,
  paddingTop: 24,
  borderTop: "1px solid rgba(255,255,255,0.2)",
};

const statValueStyle: React.CSSProperties = {
  fontSize: 26,
  fontWeight: 700,
  color: COLORS.blue300,
  letterSpacing: "0.04em",
};

const statLabelStyle: React.CSSProperties = {
  marginTop: 4,
  fontSize: 12,
  lineHeight: 1.6,
  color: "rgba(255,255,255,0.8)",
};

const containerStyle: React.CSSProperties = {
  background: COLORS.page,
  padding: "28px 20px 44px",
};

const containerInnerStyle: React.CSSProperties = {
  maxWidth: 560,
  margin: "0 auto",
};

const linkCardStyle: React.CSSProperties = {
  display: "block",
  background: "#fff",
  border: `1px solid ${COLORS.line}`,
  borderRadius: 12,
  padding: 16,
  textDecoration: "none",
  color: COLORS.ink,
  fontSize: 15,
  fontWeight: 700,
};

export default function Home() {
  return (
    <div style={pageStyle}>
      <div style={heroStyle}>
        <div style={heroInnerStyle}>
          <span style={badgeStyle}>QRコードで簡単入出庫</span>

          <div style={siteNameStyle}>ParkTec East Japan</div>

          <h1 style={headingStyle}>
            駐車場予約を
            <br />
            <span style={{ color: COLORS.blue300 }}>もっとスマート</span>に。
          </h1>

          <p style={subStyle}>
            セキスイハイムスーパーアリーナ・QアンドAスタジアム隣接。
            <br />
            コンサート・イベント当日の駐車場を事前予約で確保。
          </p>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 12,
              marginTop: 28,
            }}
          >
            <Link href="/reserve?placeSlug=rifu-main" style={primaryButtonStyle}>
              今すぐ予約
            </Link>

            <Link href="/reservation/lookup" style={secondaryButtonStyle}>
              予約内容の確認・変更
            </Link>
          </div>

          <div style={statsRowStyle}>
            {STATS.map((stat) => (
              <div key={stat.value}>
                <div style={statValueStyle}>{stat.value}</div>
                <div style={statLabelStyle}>{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={containerStyle}>
        <div style={containerInnerStyle}>
          <a
            href="https://parktec-ej.com/help"
            target="_blank"
            rel="noopener noreferrer"
            style={linkCardStyle}
          >
            よくあるご質問
          </a>

          <div style={{ marginTop: 24, textAlign: "center" }}>
            <div style={{ fontSize: 13, color: COLORS.ink3 }}>お問い合わせ</div>
            <div style={{ marginTop: 4 }}>
              <a
                href="tel:05017934785"
                style={{
                  color: COLORS.blue700,
                  fontWeight: 700,
                  fontSize: 17,
                  textDecoration: "none",
                }}
              >
                050-1793-4785
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
