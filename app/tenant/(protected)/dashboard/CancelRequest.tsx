"use client";

import { useState } from "react";

export default function CancelRequest({ alreadyRequested }: { alreadyRequested: boolean }) {
  const [done, setDone] = useState(alreadyRequested);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!confirm("解約を申請します。よろしいですか？\n（受付後、当社で手続きを行います。前払い分の返金はありません。）")) return;
    setBusy(true);
    try {
      const res = await fetch("/api/tenant/cancel-request", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.ok) { alert(data.message || "申請に失敗しました。"); setBusy(false); return; }
      setDone(true); setBusy(false);
    } catch { alert("通信エラー"); setBusy(false); }
  }

  if (done) {
    return <p style={{ fontSize: 14, color: "#b91c1c" }}>解約申請を受け付けました。当社で手続きを進めます。</p>;
  }
  return (
    <div>
      <p style={{ fontSize: 13, color: "#666", marginTop: 0 }}>解約をご希望の場合はこちらから申請してください。前払い分の返金はありません。</p>
      <button onClick={submit} disabled={busy} style={{ padding: "10px 16px", background: "#fff", color: "#b91c1c", border: "1px solid #fecaca", borderRadius: 8, cursor: "pointer", fontWeight: 600 }}>
        {busy ? "申請中..." : "解約を申請する"}
      </button>
    </div>
  );
}
