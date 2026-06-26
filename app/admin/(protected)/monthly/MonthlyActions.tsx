"use client";

import { useState } from "react";

type Props = { id: string; status: string; cancelRequested?: boolean };

export default function MonthlyActions({ id, status, cancelRequested }: Props) {
  const [busy, setBusy] = useState(false);

  async function call(action: "approve" | "reject" | "cancel") {
    const messages: Record<string, string> = {
      approve: "承認して支払いリンクを送信しますか？",
      reject: "この申込を却下しますか？",
      cancel: "この契約を解約します。よろしいですか？（前払いは返金されません）",
    };
    if (!confirm(messages[action])) return;
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

  if (status === "PENDING") {
    return (
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={() => call("approve")} disabled={busy} style={primaryBtn}>承認</button>
        <button onClick={() => call("reject")} disabled={busy} style={dangerBtn}>却下</button>
      </div>
    );
  }

  if (status === "ACTIVE" || status === "PAST_DUE") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
        {cancelRequested ? <span style={{ fontSize: 11, color: "#b91c1c", fontWeight: 700 }}>解約申請あり</span> : null}
        <button onClick={() => call("cancel")} disabled={busy} style={dangerBtn}>解約実行</button>
      </div>
    );
  }

  return <span style={{ color: "#aaa" }}>―</span>;
}

const primaryBtn: React.CSSProperties = { padding: "6px 12px", background: "#111", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" };
const dangerBtn: React.CSSProperties = { padding: "6px 12px", background: "#fff", color: "#b91c1c", border: "1px solid #fecaca", borderRadius: 6, cursor: "pointer" };
