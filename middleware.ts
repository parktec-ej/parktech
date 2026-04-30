import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const ADMIN_SESSION_COOKIE = "parktech_admin_session";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", pathname);

  if (pathname === "/admin/login") {
    return NextResponse.next({
      request: { headers: requestHeaders },
    });
  }

  const sessionCookie = request.cookies.get(ADMIN_SESSION_COOKIE);

  if (!sessionCookie) {
    const loginUrl = new URL("/admin/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

export const config = {
  matcher: ["/admin/:path*"],
};
