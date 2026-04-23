"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function AutoRefresh({
  intervalSec = 30,
  enabledDefault = true,
}: {
  intervalSec?: number;
  enabledDefault?: boolean;
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(enabledDefault);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const timer = setInterval(() => {
      router.refresh();
      setLastRefreshedAt(new Date());
    }, intervalSec * 1000);

    return () => clearInterval(timer);
  }, [enabled, intervalSec, router]);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        flexWrap: "wrap",
      }}
    >
      <button
        type="button"
        onClick={() => setEnabled((v) => !v)}
        style={{
          padding: "8px 12px",
          borderRadius: 10,
          border: "1px solid #d1d5db",
          background: enabled ? "#111827" : "#fff",
          color: enabled ? "#fff" : "#111",
          fontWeight: 800,
          cursor: "pointer",
        }}
      >
        {enabled ? `自動更新ON (${intervalSec}秒)` : "自動更新OFF"}
      </button>

      <button
        type="button"
        onClick={() => {
          router.refresh();
          setLastRefreshedAt(new Date());
        }}
        style={{
          padding: "8px 12px",
          borderRadius: 10,
          border: "1px solid #d1d5db",
          background: "#fff",
          color: "#111",
          fontWeight: 800,
          cursor: "pointer",
        }}
      >
        今すぐ更新
      </button>

      <div style={{ fontSize: 12, color: "#666" }}>
        {lastRefreshedAt
          ? `最終更新: ${lastRefreshedAt.toLocaleTimeString("ja-JP")}`
          : "初回表示中"}
      </div>
    </div>
  );
}