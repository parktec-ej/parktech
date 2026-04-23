"use client";

import { useState } from "react";

export default function ForceCheckoutButton({
  sessionId,
}: {
  sessionId: string;
}) {
  const [loading, setLoading] = useState(false);

  async function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();

    if (!confirm("強制出庫しますか？")) return;

    setLoading(true);

    try {
      const res = await fetch(
        "/api/admin/parking-sessions/force-checkout",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ parkingSessionId: sessionId }),
        }
      );

      const json = await res.json();

      if (!json.ok) {
        alert("失敗: " + (json.error || ""));
        return;
      }

      // 👇 reloadで十分（今の構成ならこれが最適）
      location.reload();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      style={{
        marginTop: 10,
        width: "100%",
        padding: "8px",
        borderRadius: 8,
        border: "1px solid #dc2626",
        background: "#fff",
        color: "#dc2626",
        fontWeight: 800,
        cursor: "pointer",
      }}
    >
      {loading ? "処理中..." : "強制出庫"}
    </button>
  );
}