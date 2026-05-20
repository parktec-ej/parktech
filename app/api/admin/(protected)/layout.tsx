import { requireAdmin } from "@/lib/admin-auth";
import Link from "next/link";

export default async function AdminProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await requireAdmin();

  return (
    <div style={{ minHeight: "100vh", background: "#fafafa" }}>
      <header
        style={{
          borderBottom: "1px solid #eee",
          background: "#fff",
          padding: "12px 20px",
        }}
      >
        <div
          style={{
            maxWidth: 960,
            margin: "0 auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div style={{ fontWeight: 900 }}>ParkTec Admin</div>
            <div style={{ fontSize: 12, color: "#666" }}>
              {admin.name || admin.email}
            </div>
          </div>

          <form action="/api/admin/logout" method="post">
            <button
              type="submit"
              style={{
                padding: "10px 14px",
                borderRadius: 12,
                border: "1px solid #ddd",
                background: "#fff",
                cursor: "pointer",
                fontWeight: 700,
              }}
            >
              ログアウト
            </button>
          </form>
        </div>

        {/* 管理画面ナビ */}
        <div
          style={{
            maxWidth: 960,
            margin: "12px auto 0",
            display: "flex",
            gap: 12,
          }}
        >
          <Link href="/admin/places" style={navStyle}>
            Place管理
          </Link>

          <Link href="/admin/pricing" style={navStyle}>
            料金設定
          </Link>

          <Link href="/admin/reservations" style={navStyle}>
            予約一覧
          </Link>
        </div>
      </header>

      <main style={{ maxWidth: 960, margin: "0 auto", padding: 24 }}>
        {children}
      </main>
    </div>
  );
}

const navStyle: React.CSSProperties = {
  padding: "10px 16px",
  borderRadius: 10,
  background: "#fff",
  border: "1px solid #ddd",
  fontWeight: 700,
  textDecoration: "none",
  color: "#111",
};
