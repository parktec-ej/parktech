import { redirect } from "next/navigation";

export default async function ReceiptIndexPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const qs = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) qs.append(key, v);
    } else {
      qs.set(key, value);
    }
  }

  const target = qs.toString()
    ? `/receipt/request?${qs.toString()}`
    : "/receipt/request";

  redirect(target);
}
