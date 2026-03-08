import { cookies } from "next/headers";

export async function requireAdmin() {
  const c = await cookies();
  const t = c.get("admin_token")?.value;
  return !!t && t === process.env.ADMIN_TOKEN;
}