import { requireOwner } from "@/lib/owner-auth";

export default async function OwnerProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireOwner();
  return <>{children}</>;
}
