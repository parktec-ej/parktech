import { prisma } from "./db";

export type TaskStatus = "done" | "pending" | "overdue";

export type MonthlyTask = {
  label: string;
  status: TaskStatus;
  count?: number;
  deadline?: string;
};

export type Phase = "create" | "review" | "approve" | "pay" | "done";

export type MonthlyStatus = {
  currentMonth: string; // "YYYY-MM"
  todayJst: string; // "YYYY-MM-DD"
  dayOfMonth: number;
  phase: Phase;
  tasks: MonthlyTask[];
  counts: {
    total: number;
    draft: number;
    approved: number;
    locked: number;
    paid: number;
    cancelled: number;
  };
};

/** 今が JST で何月何日か */
function jstToday(): { date: string; day: number; month: string } {
  const now = new Date();
  const ymd = now.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
  const [y, mo, d] = ymd.split("-").map(Number);
  // 前月を YYYY-MM 形式で
  let prevY = y;
  let prevM = mo - 1;
  if (prevM === 0) {
    prevM = 12;
    prevY = y - 1;
  }
  const prevMonth = `${prevY}-${String(prevM).padStart(2, "0")}`;
  return { date: ymd, day: d, month: prevMonth };
}

export async function getMonthlyStatus(): Promise<MonthlyStatus> {
  const { date, day, month } = jstToday();

  const settlements = await prisma.settlement.findMany({
    where: { month },
    select: { id: true, status: true },
  });

  const counts = {
    total: settlements.length,
    draft: settlements.filter((s) => s.status === "DRAFT").length,
    approved: settlements.filter((s) => s.status === "APPROVED").length,
    locked: settlements.filter((s) => s.status === "LOCKED").length,
    paid: settlements.filter((s) => s.status === "PAID").length,
    cancelled: settlements.filter((s) => s.status === "CANCELLED").length,
  };

  // 締めるべき Place 数の見立て（active な Place を「精算が必要な対象」と見なす）
  const activePlaceCount = await prisma.place.count({
    where: { status: "ACTIVE" as any },
  }).catch(() => 0);

  const expectedTotal = Math.max(activePlaceCount, counts.total);
  const missingCreate = Math.max(0, expectedTotal - counts.total);

  const unApproved = counts.draft + counts.approved; // LOCKED 未到達
  const unpaid = counts.locked; // LOCKED だが PAID ではない
  // DRAFT / APPROVED もまだ未払いだが、phase 判定上は別カテゴリ

  // Phase 判定
  let phase: Phase;
  if (counts.total === 0) {
    phase = "create";
  } else if (unApproved > 0) {
    phase = "review";
  } else if (unpaid > 0) {
    phase = "pay";
  } else {
    phase = "done";
  }

  // タスク状態を組み立て
  const createStatus: TaskStatus =
    counts.total > 0 ? "done" : day === 1 ? "pending" : day > 1 ? "overdue" : "pending";

  const approveStatus: TaskStatus =
    unApproved === 0
      ? counts.total > 0
        ? "done"
        : "pending"
      : day > 5
      ? "overdue"
      : "pending";

  const payStatus: TaskStatus =
    counts.total === 0
      ? "pending"
      : counts.paid === counts.total - counts.cancelled
      ? "done"
      : day > 10
      ? "overdue"
      : "pending";

  // 精算書送信は paid 状態の Settlement に対し、送信履歴を別途トラッキングする実装が無いため
  // 「すべて PAID なら done、そうでなければ pending」のシンプル判定
  const notifyStatus: TaskStatus =
    counts.total === 0
      ? "pending"
      : counts.paid > 0 && counts.paid === counts.total - counts.cancelled
      ? "done"
      : day > 10
      ? "overdue"
      : "pending";

  const tasks: MonthlyTask[] = [
    {
      label: "精算データ作成",
      status: createStatus,
      count: counts.total > 0 ? counts.total : missingCreate,
    },
    {
      label: "精算承認",
      status: approveStatus,
      count: unApproved,
      deadline: "翌月5日",
    },
    {
      label: "振込実行",
      status: payStatus,
      count: unpaid,
      deadline: "翌月10日",
    },
    {
      label: "精算書送信",
      status: notifyStatus,
      count: counts.paid,
    },
  ];

  return {
    currentMonth: month,
    todayJst: date,
    dayOfMonth: day,
    phase,
    tasks,
    counts,
  };
}
