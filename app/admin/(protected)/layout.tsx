"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

function NavLink({
  href,
  label,
  current,
}: {
  href: string;
  label: string;
  current: boolean;
}) {
  return (
    <Link
      href={href}
      style={{
        padding: "10px 14px",
        borderRadius: 10,
        border: current ? "1px solid #111" : "1px solid #ddd",
        background: current ? "#111" : "#fff",
        color: current ? "#fff" : "#111",
        fontWeight: 800,
        textDecoration: "none",
        display: "inline-block",
      }}
    >
      {label}
    </Link>
  );
}

export default function AdminProtectedLayout({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div style={{ minHeight: "100vh", background: "#f7f7f8" }}>
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 20,
          background: "#fff",
          borderBottom: "1px solid #e5e7eb",
        }}
      >
        <div
          style={{
            maxWidth: 1200,
            margin: "0 auto",
            padding: "16px 20px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div style={{ fontSize: 28, fontWeight: 900 }}>ParkTech Admin</div>
            <div style={{ fontSize: 13, color: "#666", marginTop: 4 }}>
              管理メニュー
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
                fontWeight: 800,
              }}
            >
              ログアウト
            </button>
          </form>
        </div>

        <div
          style={{
            maxWidth: 1200,
            margin: "0 auto",
            padding: "0 20px 16px",
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <NavLink
            href="/admin/places"
            label="Place管理"
            current={pathname === "/admin/places"}
          />
          <NavLink
            href="/admin/pricing"
            label="料金設定"
            current={pathname === "/admin/pricing"}
          />
          <NavLink
            href="/admin/reservations"
            label="予約一覧"
            current={pathname === "/admin/reservations"}
          />
        </div>
      </header>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 20px" }}>
        {children}
      </div>
    </div>
  );
}
