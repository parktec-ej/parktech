"use client";

import { useRouter, useSearchParams } from "next/navigation";

export default function DateSwitcher({
  value,
}: {
  value: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function handleChange(nextDate: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("date", nextDate);
    router.push(`/admin?${params.toString()}`);
  }

  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        alignItems: "center",
        flexWrap: "wrap",
      }}
    >
      <div style={{ fontSize: 13, color: "#666", fontWeight: 700 }}>
        集計日
      </div>

      <input
        type="date"
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        style={{
          padding: "10px 12px",
          borderRadius: 10,
          border: "1px solid #d1d5db",
          background: "#fff",
          fontSize: 14,
        }}
      />

      <button
        type="button"
        onClick={() => handleChange(new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" }))}
        style={{
          padding: "10px 14px",
          borderRadius: 10,
          border: "1px solid #ddd",
          background: "#fff",
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        今日
      </button>
    </div>
  );
}