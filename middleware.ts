import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const ADMIN_SESSION_COOKIE = "parktech_admin_session";
const PARTNER_SESSION_COOKIE = "partner_session";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", pathname);

  const passThrough = () =>
    NextResponse.next({ request: { headers: requestHeaders } });

  if (pathname.startsWith("/admin")) {
    if (pathname === "/admin/login") return passThrough();
    if (!request.cookies.get(ADMIN_SESSION_COOKIE)) {
      return NextResponse.redirect(new URL("/admin/login", request.url));
    }
    return passThrough();
  }

  if (pathname.startsWith("/bus-admin")) {
    if (pathname === "/bus-admin/login") return passThrough();
    if (!request.cookies.get(PARTNER_SESSION_COOKIE)) {
      return NextResponse.redirect(new URL("/bus-admin/login", request.url));
    }
    return passThrough();
  }

  if (pathname.startsWith("/partner/bus-reserve")) {
    if (!request.cookies.get(PARTNER_SESSION_COOKIE)) {
      return NextResponse.redirect(new URL("/bus-admin/login", request.url));
    }
    return passThrough();
  }

  return passThrough();
}

export const config = {
  matcher: ["/admin/:path*", "/bus-admin/:path*", "/partner/bus-reserve/:path*"],
};
