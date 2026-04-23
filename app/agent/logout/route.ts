import { NextResponse } from "next/server";
import { clearAgentSession } from "@/lib/agent-auth";

export async function POST(req: Request) {
  await clearAgentSession();
  return NextResponse.redirect(new URL("/agent/login", req.url), {
    status: 303,
  });
}