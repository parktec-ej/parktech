"use client";

import { getCarrierName } from "@/lib/email-domain";

type Props = {
  email: string | null | undefined;
  /** 設定手順ページの絶対URL。未指定ならリンクを出さない */
  helpHref?: string;
};

export default function CarrierMailNotice({ email, helpHref }: Props) {
  const carrier = getCarrierName(email);
  if (!carrier) return null;

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
        <span
          style={{
            fontFamily: "monospace",
            fontWeight: 700,
            wordBreak: "break-all",
          }}
        >
          noreply@mail.parktec-ej.com
        </span>{" "}
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
