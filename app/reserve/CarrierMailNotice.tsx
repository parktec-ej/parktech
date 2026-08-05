"use client";

import { useState } from "react";
import { getCarrierName } from "@/lib/email-domain";

type Props = {
  email: string | null | undefined;
  /** 設定手順ページの絶対URL。未指定ならリンクを出さない */
  helpHref?: string;
};

export default function CarrierMailNotice({ email, helpHref }: Props) {
  const [copied, setCopied] = useState(false);
  const carrier = getCarrierName(email);
  if (!carrier) return null;

  const MAIL_ADDRESS = "noreply@mail.parktec-ej.com";

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(MAIL_ADDRESS);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // クリップボードが使えない環境では何もしない
    }
  };

  return (
    <div
      role="status"
      style={{
        marginTop: 10,
        border: "1px solid #fde68a",
        borderRadius: 16,
        background: "#fef3c7",
        color: "#92400e",
        padding: 14,
        fontSize: 14,
        lineHeight: 1.8,
      }}
    >
      <div style={{ fontWeight: 800, marginBottom: 6 }}>
        {carrier}のメールアドレスは予約確認メールが届かないことがあります
      </div>

      <div>
        携帯キャリアの迷惑メールフィルタにより、当社からのメールが自動で
        振り分け・遮断される場合があります。
      </div>

      <div style={{ marginTop: 6 }}>
        <strong>Gmail、Yahoo!メール、iCloudメール、Outlook（Hotmail）</strong>
        など、パソコン向けのメールアドレスであれば確実にお届けできます。
      </div>

      <div style={{ marginTop: 6 }}>
        このままご予約される場合は、迷惑メールフィルタの受信リストに{" "}
        <button
          type="button"
          onClick={handleCopy}
          aria-label="メールアドレスをコピー"
          style={{
            fontFamily: "monospace",
            fontWeight: 700,
            wordBreak: "break-all",
            background: "#fffdf5",
            border: "1px solid #fbbf24",
            borderRadius: 6,
            color: "#92400e",
            padding: "2px 6px",
            fontSize: "inherit",
            cursor: "pointer",
          }}
        >
          {MAIL_ADDRESS}
          <span style={{ marginLeft: 6, fontFamily: "inherit", fontSize: 12 }}>
            {copied ? "コピーしました" : "タップでコピー"}
          </span>
        </button>{" "}
        をご登録ください。
        {helpHref && (
          <a
            href={helpHref}
            target="_blank"
            rel="noopener noreferrer"
            style={{ marginLeft: 4, color: "#92400e", textDecoration: "underline" }}
          >
            設定方法を見る
          </a>
        )}
      </div>
    </div>
  );
}
