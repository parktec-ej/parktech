import "server-only";

import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const PARTNER_SESSION_COOKIE = "partner_session";

function getRequiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set`);
  }
  return value;
}

function buildSignature(payload: string) {
  const secret = getRequiredEnv("PARTNER_LOGIN_COOKIE_SECRET");
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

function buildToken(loginId: string, expiresAtMs: number) {
  const payload = `${loginId}.${expiresAtMs}`;
  const sig = buildSignature(payload);
  return `${payload}.${sig}`;
}

function parseToken(token: string) {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [loginId, expiresAtRaw, sig] = parts;
  const payload = `${loginId}.${expiresAtRaw}`;
  const expected = buildSignature(payload);

  if (sig !== expected) return null;

  const expiresAtMs = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAtMs)) return null;
  if (Date.now() > expiresAtMs) return null;

  return {
    loginId,
    expiresAt: new Date(expiresAtMs),
  };
}

function buildExpiryDate(days = 14) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

export async function createPartnerSession(loginId: string) {
  const expiresAt = buildExpiryDate(14);
  const token = buildToken(loginId, expiresAt.getTime());

  const cookieStore = await cookies();
  cookieStore.set(PARTNER_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
    path: "/",
  });

  return {
    loginId,
    expiresAt,
  };
}

export async function clearPartnerSession() {
  const cookieStore = await cookies();
  cookieStore.set(PARTNER_SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: new Date(0),
    path: "/",
  });
}

export async function getPartnerSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(PARTNER_SESSION_COOKIE)?.value;
  if (!token) return null;

  const parsed = parseToken(token);
  if (!parsed) return null;

  const allowedLoginId = getRequiredEnv("PARTNER_LOGIN_ID");
  if (parsed.loginId !== allowedLoginId) return null;

  return parsed;
}

export async function requirePartner() {
  const session = await getPartnerSession();
  if (!session) {
    redirect("/bus-admin/login");
  }
  return session;
}

export function verifyPartnerCredentials(loginId: string, password: string) {
  const expectedId = getRequiredEnv("PARTNER_LOGIN_ID");
  const expectedPassword = getRequiredEnv("PARTNER_LOGIN_PASSWORD");
  return loginId === expectedId && password === expectedPassword;
}