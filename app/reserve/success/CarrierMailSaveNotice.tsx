"use client";

import { getCarrierName } from "@/lib/email-domain";

type Props = {
  email: string | null | undefined;
  pin: string;
};

export default function CarrierMailSaveNotice({ email, pin }: Props) {
  const carrier = getCarrierName(email);
  if (!carrier) return null;

  return (
    <div
      role="alert"
      style={{
        border: "2px solid #fbbf24",
        borderRadius: 16,
        background: "#fef3c7",
        color: "#92400e",
        padding: 16,
        fontSize: 14,
        lineHeight: 1.8,
      }}
    >
      <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 6 }}>
        この画面を保存してください
      </div>

      <div>
        ご入力の{carrier}のアドレスは、迷惑メールフィルタにより確認メールが
        届かない場合があります。ご入場には上記のPINコード
        <strong style={{ margin: "0 4px", letterSpacing: 2 }}>{pin}</strong>
        が必要です。
      </div>

      <div style={{ marginTop: 6 }}>
        スクリーンショットで保存するか、PINコードをメモしてお越しください。
        ご予約自体は完了しておりますので、万一お忘れの場合も当日受付で
        お名前をお伝えいただければご入場いただけます。
      </div>
    </div>
  );
}
