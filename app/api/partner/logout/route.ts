import { NextResponse } from "next/server";
import { clearPartnerSession } from "@/lib/partner-auth";

export async function POST(req: Request) {
  await clearPartnerSession();
  return NextResponse.redirect(new URL("/partner/login", req.url), {
    status: 303,
  });
}