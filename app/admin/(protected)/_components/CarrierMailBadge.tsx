import { getCarrierName } from "@/lib/email-domain";

type Props = {
  email: string | null | undefined;
  /** 幅が狭い場合はキャリア名を出さず「キャリア」とだけ表示 */
  compact?: boolean;
};

export default function CarrierMailBadge({ email, compact = false }: Props) {
  const carrier = getCarrierName(email);
  if (!carrier) return null;

  return (
    <span
      title="キャリアメールのため、確認メールがフィルタされている可能性があります"
      style={{
        marginLeft: 6,
        display: "inline-block",
        verticalAlign: "middle",
        border: "1px solid #fde68a",
        borderRadius: 6,
        background: "#fef3c7",
        color: "#92400e",
        padding: "1px 6px",
        fontSize: 11,
        fontWeight: 700,
        lineHeight: 1.6,
      }}
    >
      {compact ? "キャリア" : carrier}
    </span>
  );
}
