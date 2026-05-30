import { requireOwner } from "@/lib/owner-auth";
import { prisma } from "@/lib/db";

function fmtYen(n: number) {
  return `¥${n.toLocaleString("ja-JP")}`;
}

function statusLabel(s: string) {
  switch (s) {
    case "PAID": return "送金済み";
    case "LOCKED": return "確定済み";
    default: return s;
  }
}

function statusColor(s: string) {
  switch (s) {
    case "PAID": return { bg: "#dcfce7", color: "#166534" };
    case "LOCKED": return { bg: "#fef9c3", color: "#854d0e" };
    default: return { bg: "#f3f4f6", color: "#374151" };
  }
}

export default async function OwnerSettlementsPage() {
  const owner = await requireOwner();

  const settlements = await prisma.settlement.findMany({
    where: {
      ownerId: owner.id,
      status: { in: ["PAID", "LOCKED"] },
    },
    include: {
      Place: {
        select: { name: true },
      },
      Payout: {
        where: { payoutTarget: "OWNER" },
        select: {
          status: true,
          actualAmount: true,
          executedAt: true,
        },
      },
    },
    orderBy: { month: "desc" },
  });

  return (
    <div style={{ maxWidth: 700, margin: "0 auto", padding: "24px 16px", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 900, margin: 0 }}>精算書一覧</h1>
          <p style={{ fontSize: 14, color: "#666", margin: "4px 0 0" }}>
            {owner.displayName || owner.name} 様
          </p>
        </div>
        <form action="/api/owner/logout" method="post">
          <button
            type="submit"
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              border: "1px solid #d1d5db",
              background: "#fff",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            ログアウト
          </button>
        </form>
      </div>

      {settlements.length === 0 ? (
        <div style={{
          padding: 32,
          textAlign: "center",
          color: "#888",
          border: "1px solid #e5e7eb",
          borderRadius: 16,
        }}>
          精算書はまだありません
        </div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {settlements.map((s) => {
            const payout = s.Payout[0];
            const sc = statusColor(s.status);
            return (
              <div
                key={s.id}
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: 16,
                  padding: 20,
                  background: "#fff",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 800 }}>{s.month}</div>
                    <div style={{ fontSize: 14, color: "#666", marginTop: 2 }}>
                      {s.Place?.name || "-"}
                    </div>
                  </div>
                  <span style={{
                    display: "inline-block",
                    padding: "4px 12px",
                    borderRadius: 999,
                    fontSize: 13,
                    fontWeight: 700,
                    background: sc.bg,
                    color: sc.color,
                  }}>
                    {statusLabel(s.status)}
                  </span>
                </div>

                <div style={{ marginTop: 12, fontSize: 14, lineHeight: 2 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>売上合計</span>
                    <span style={{ fontWeight: 600 }}>{fmtYen(s.totalGrossAmount)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>お支払い額</span>
                    <span style={{ fontWeight: 800, fontSize: 16 }}>
                      {fmtYen(s.finalOwnerPayoutAmount)}
                    </span>
                  </div>
                  {payout?.executedAt && (
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>送金日</span>
                      <span style={{ fontWeight: 600 }}>
                        {new Date(payout.executedAt).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" })}
                      </span>
                    </div>
                  )}
                </div>

                <div style={{ marginTop: 14 }}>
                  <a
                    href={`/owner/settlements/${s.id}/pdf?target=owner`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: "inline-block",
                      padding: "10px 20px",
                      borderRadius: 10,
                      border: "1px solid #111",
                      background: "#fff",
                      color: "#111",
                      fontWeight: 700,
                      fontSize: 14,
                      textDecoration: "none",
                    }}
                  >
                    📄 精算書PDFを表示
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
