import { requireAdmin } from "@/lib/admin-auth";

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
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div>
          <div style={{ fontWeight: 900 }}>ParkTech Admin</div>
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
      </header>

      <main style={{ maxWidth: 960, margin: "0 auto", padding: 24 }}>
        {children}
      </main>
    </div>
  );
}