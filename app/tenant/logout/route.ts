import { NextResponse } from "next/server";
import { clearTenantSession } from "@/lib/tenant-auth";

export async function POST(req: Request) {
  await clearTenantSession();
  return NextResponse.redirect(new URL("/tenant/login", req.url), { status: 303 });
}
