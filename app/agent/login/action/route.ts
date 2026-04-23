import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createAgentSession } from "@/lib/agent-auth";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();

    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");

    if (!email || !password) {
      return NextResponse.redirect(new URL("/agent/login?error=1", req.url), {
        status: 303,
      });
    }

    const agent = await prisma.agent.findFirst({
      where: {
        email,
        status: "ACTIVE",
      },
      select: {
        id: true,
        passwordHash: true,
      },
    });

    if (!agent || !agent.passwordHash || agent.passwordHash !== password) {
      return NextResponse.redirect(new URL("/agent/login?error=1", req.url), {
        status: 303,
      });
    }

    await createAgentSession(agent.id);

    return NextResponse.redirect(new URL("/agent/dashboard", req.url), {
      status: 303,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.redirect(new URL("/agent/login?error=1", req.url), {
      status: 303,
    });
  }
}