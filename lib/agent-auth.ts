import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import crypto from "node:crypto";
import { prisma } from "@/lib/db";

const AGENT_SESSION_COOKIE = "agent_session";

function buildExpiryDate(days = 14) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

export async function createAgentSession(agentId: string) {
  const sessionToken = crypto.randomUUID();
  const sessionExpiresAt = buildExpiryDate(14);

  await prisma.agent.update({
    where: { id: agentId },
    data: {
      sessionToken,
      sessionExpiresAt,
    },
  });

  const cookieStore = await cookies();
  cookieStore.set(AGENT_SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: sessionExpiresAt,
    path: "/",
  });

  return { sessionToken, sessionExpiresAt };
}

export async function clearAgentSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(AGENT_SESSION_COOKIE)?.value;

  if (token) {
    await prisma.agent.updateMany({
      where: { sessionToken: token },
      data: {
        sessionToken: null,
        sessionExpiresAt: null,
      },
    });
  }

  cookieStore.set(AGENT_SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: new Date(0),
    path: "/",
  });
}

export async function getAgentSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(AGENT_SESSION_COOKIE)?.value;

  if (!token) return null;

  const agent = await prisma.agent.findFirst({
    where: {
      sessionToken: token,
      sessionExpiresAt: {
        gt: new Date(),
      },
      status: "ACTIVE",
    },
    select: {
      id: true,
      code: true,
      name: true,
      displayName: true,
      email: true,
      status: true,
      sessionExpiresAt: true,
    },
  });

  if (!agent) return null;

  return {
    agentId: agent.id,
    code: agent.code,
    name: agent.name,
    displayName: agent.displayName,
    email: agent.email,
    status: agent.status,
    sessionExpiresAt: agent.sessionExpiresAt,
  };
}

export async function requireAgent() {
  const session = await getAgentSession();
  if (!session) {
    redirect("/agent/login");
  }
  return session;
}