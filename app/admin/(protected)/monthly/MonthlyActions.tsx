"use client";

import { useState } from "react";

export default function MonthlyActions({ id }: { id: string }) {
  const [busy, setBusy] = useState(false);

  async function call(action: "approve" | "reject") {
    if (action === "reject" && !confirm("この申込を却下しますか？")) return;
    if (action === "approve" && !confirm("承認して支払いリンクを送信しますか？")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/monthly/${id}/${action}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        alert(data.message || data.error || "失敗しました");
        setBusy(false);
        return;
      }
      location.reload();
    } catch {
      alert("通信エラー");
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", gap: 8 }}>
      <button onClick={() => call("approve")} disabled={busy}
        style={{ padding: "6px 12px", background: "#111", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}>
        承認
      </button>
      <button onClick={() => call("reject")} disabled={busy}
        style={{ padding: "6px 12px", background: "#fff", color: "#b91c1c", border: "1px solid #fecaca", borderRadius: 6, cursor: "pointer" }}>
        却下
      </button>
    </div>
  );
}
