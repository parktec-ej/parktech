import { redirect } from "next/navigation";

export default function PartnerLoginRedirect() {
  redirect("/bus-admin/login");
}
