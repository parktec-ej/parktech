import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "ParkTec East Japan — 駐車場のご予約",
  description:
    "セキスイハイムスーパーアリーナ・QアンドAスタジアム隣接の予約制駐車場。イベント当日の駐車場を事前予約で確保できます。",
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

const linkCardStyle: React.CSSProperties = {
  display: "block",
  background: "#fff",
  border: `1px solid ${COLORS.line}`,
  borderRadius: 12,
  padding: "18px 20px",
  textDecoration: "none",
  color: COLORS.ink,
  fontSize: 16,
  fontWeight: 700,
};

export default function Home() {
  return (
    <div style={pageStyle}>
      <div style={heroStyle}>
        <h1 style={{ margin: 0, fontSize: 25, fontWeight: 700, color: "#fff" }}>
          ParkTec East Japan
        </h1>
        <p style={{ margin: "8px 0 0", fontSize: 14, color: COLORS.blue300 }}>
          セキスイハイムスーパーアリーナ・QアンドAスタジアム隣接の予約制駐車場
        </p>
      </div>

      <div style={containerStyle}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <Link href="/reserve?placeSlug=rifu-main" style={linkCardStyle}>
            駐車場を予約する
          </Link>

          <Link href="/reservation/lookup" style={linkCardStyle}>
            予約内容の確認・変更
          </Link>

          <a
            href="https://parktec-ej.com/help"
            target="_blank"
            rel="noopener noreferrer"
            style={linkCardStyle}
          >
            よくあるご質問
          </a>
        </div>

        <p
          style={{
            margin: "24px 0 0",
            fontSize: 13,
            lineHeight: 1.9,
            color: COLORS.ink3,
            textAlign: "center",
          }}
        >
          お問い合わせ
          <br />
          <a
            href="tel:05017934785"
            style={{ color: COLORS.blue700, fontWeight: 700, fontSize: 15 }}
          >
            050-1793-4785
          </a>
        </p>
      </div>
    </div>
  );
}
