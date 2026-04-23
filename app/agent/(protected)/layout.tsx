import type { ReactNode } from "react";
import { requireAgent } from "@/lib/agent-auth";

export default async function AgentProtectedLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireAgent();
  return <>{children}</>;
}