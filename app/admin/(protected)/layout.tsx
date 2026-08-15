"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { ReactNode, CSSProperties } from "react";
import { Suspense } from "react";
import PlacePicker from "./PlacePicker";

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
        padding: "10px 16px",
        borderRadius: 10,
        background: current ? "#111" : "#fff",
        border: "1px solid #ddd",
        fontWeight: 700,
        textDecoration: "none",
        color: current ? "#fff" : "#111",
      }}
    >
      {label}
    </Link>
  );
}

function withCurrentPlace(basePath: string, searchParams: URLSearchParams) {
  const params = new URLSearchParams();
  const placeId = String(searchParams.get("placeId") ?? "").trim();
  if (placeId) params.set("placeId", placeId);
  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

function AdminTabs() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 16 }}>
      <NavLink
        href={withCurrentPlace("/admin", searchParams)}
        label="売上/ダッシュボード"
        current={pathname === "/admin"}
      />
      <NavLink
        href="/admin/places"
        label="Place管理"
        current={pathname.startsWith("/admin/places")}
      />
      <NavLink
        href="/admin/owners"
        label="オーナー管理"
        current={pathname.startsWith("/admin/owners")}
      />
      <NavLink
        href="/admin/agents"
        label="代理店管理"
        current={pathname.startsWith("/admin/agents")}
      />
      <NavLink
        href="/admin/monthly"
        label="🏠 月極契約"
        current={
          pathname.startsWith("/admin/monthly") &&
          !pathname.startsWith("/admin/monthly-offers")
        }
      />
      <NavLink
        href={withCurrentPlace("/admin/monthly-offers", searchParams)}
        label="🗓️ 月極イベント枠"
        current={pathname.startsWith("/admin/monthly-offers")}
      />
      <NavLink
        href={withCurrentPlace("/admin/pricing", searchParams)}
        label="料金設定"
        current={pathname.startsWith("/admin/pricing")}
      />
      <NavLink
        href={withCurrentPlace("/admin/reservations", searchParams)}
        label="予約一覧"
        current={pathname.startsWith("/admin/reservations")}
      />
      <NavLink
        href={withCurrentPlace("/admin/parking-sessions", searchParams)}
        label="入庫管理"
        current={pathname.startsWith("/admin/parking-sessions")}
      />
      <NavLink
        href={withCurrentPlace("/admin/sales", searchParams)}
        label="売上一覧"
        current={pathname === "/admin/sales"}
      />
      <NavLink
        href={withCurrentPlace("/admin/payments", searchParams)}
        label="支払い管理"
        current={pathname.startsWith("/admin/payments")}
      />
      <NavLink
        href={withCurrentPlace("/admin/sales/monthly", searchParams)}
        label="月間売上"
        current={pathname.startsWith("/admin/sales/monthly")}
      />
      <NavLink
        href={withCurrentPlace("/admin/settlements", searchParams)}
        label="月次締め"
        current={pathname.startsWith("/admin/settlements")}
      />
      <NavLink
        href={withCurrentPlace("/admin/spot-mode-calendar", searchParams)}
        label="日付別営業モード"
        current={pathname.startsWith("/admin/spot-mode-calendar")}
      />
      <NavLink
        href={withCurrentPlace("/admin/assignments", searchParams)}
        label="料率設定"
        current={pathname.startsWith("/admin/assignments")}
      />
      <NavLink
        href="/admin/bus-partners"
        label="バス業者管理"
        current={pathname.startsWith("/admin/bus-partners")}
      />
      <NavLink
        href="/admin/events"
        label="🎫 イベント管理"
        current={pathname.startsWith("/admin/events")}
      />
      <NavLink
        href="/admin/sns"
        label="📣 SNS投稿"
        current={pathname.startsWith("/admin/sns")}
      />
      <NavLink
        href="/admin/emergency"
        label="🚨 緊急対応"
        current={pathname.startsWith("/admin/emergency")}
      />
    </div>
  );
}

function AdminHeaderControls() {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
      <Suspense fallback={null}>
        <PlacePicker />
      </Suspense>

      <form action="/api/admin/logout" method="post">
        <button type="submit" style={logoutButtonStyle}>
          ログアウト
        </button>
      </form>
    </div>
  );
}

export default function AdminProtectedLayout({
  children,
}: {
  children: ReactNode;
}) {
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
            maxWidth: 1080,
            margin: "0 auto",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div style={{ fontWeight: 900, fontSize: 20 }}>ParkTec Admin</div>
            <div style={{ fontSize: 12, color: "#666" }}>ParkTec Admin</div>

            <Suspense fallback={null}>
              <AdminTabs />
            </Suspense>
          </div>

          <AdminHeaderControls />
        </div>
      </header>

      <main style={{ maxWidth: 1080, margin: "0 auto", padding: 24 }}>
        {children}
      </main>
    </div>
  );
}

const logoutButtonStyle: CSSProperties = {
  padding: "10px 14px",
  borderRadius: 12,
  border: "1px solid #ddd",
  background: "#fff",
  cursor: "pointer",
  fontWeight: 700,
};