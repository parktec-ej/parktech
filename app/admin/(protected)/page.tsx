import Link from "next/link";
import type { CSSProperties } from "react";
import { prisma } from "@/lib/db";
import DateSwitcher from "./DateSwitcher";
import ForceCheckoutButton from "./_components/ForceCheckoutButton";
import AutoRefresh from "./_components/AutoRefresh";
import MonthlyTasksWidget from "./_components/MonthlyTasksWidget";

function ymdTodayJst() {
  return new Date().toLocaleDateString("sv-SE", {
    timeZone: "Asia/Tokyo",
  });
}

function fmtYen(v: number) {
  return `${v.toLocaleString("ja-JP")} 円`;
}

function modeLabel(mode?: string | null) {
  if (!mode) return "-";
  if (mode === "RESERVATION_ONLY") return "予約専用";
  if (mode === "HOURLY_ONLY") return "時間貸し専用";
  if (mode === "RESERVATION_THEN_HOURLY") return "予約優先→空きは時間貸し";
  if (mode === "CLOSED") return "利用停止";
  if (mode === "MONTHLY") return "月極専用";
  return mode;
}

function fmtDateTime(dt?: Date | null) {
  if (!dt) return "-";
  return new Date(dt).toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function minutesDiff(from?: Date | null, to?: Date | null) {
  if (!from || !to) return null;
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / 60000));
}

function buildUrl(
  pathname: string,
  params?: Record<string, string | undefined | null>
) {
  const qs = new URLSearchParams();
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v) qs.set(k, v);
    });
  }
  const s = qs.toString();
  return s ? `${pathname}?${s}` : pathname;
}

type SpotStatus =
  | {
      kind: "IN_HOURLY";
      sessionId: string;
      label: string;
      tone: "green";
      note: string;
      href: string;
    }
  | {
      kind: "IN_RESERVATION";
      sessionId: string;
      label: string;
      tone: "green";
      note: string;
      href: string;
    }
  | {
      kind: "RESERVED_WAITING";
      label: string;
      tone: "yellow";
      note: string;
      href: string;
    }
  | {
      kind: "CLOSED";
      label: string;
      tone: "red";
      note: string;
      href: string;
    }
  | {
      kind: "CHECKED_OUT";
      label: string;
      tone: "gray";
      note: string;
      href: string;
    }
  | {
      kind: "AVAILABLE";
      label: string;
      tone: "white";
      note: string;
      href: string;
    };

export default async function AdminHomePage({
  searchParams,
}: {
  searchParams?: Promise<{ date?: string; placeId?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const selectedDate =
    sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : ymdTodayJst();
  const placeKey = String(sp.placeId ?? "").trim();

  // まず軽量に Place 一覧を取る
  const activePlaces = await prisma.place.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      slug: true,
      address: true,
      operationMode: true,
      ownerId: true,
    },
  });

  if (activePlaces.length === 0) {
    return (
      <main style={pageStyle}>
        <h1 style={pageTitleStyle}>本部ダッシュボード</h1>
        <div style={cardStyle}>Place が見つかりません。</div>
      </main>
    );
  }

  // 対象 Place 決定
  const basePlace =
    activePlaces.find((p) => p.id === placeKey || p.slug === placeKey) ??
    activePlaces.find((p) => p.slug === "rifu-main") ??
    activePlaces[0];

  // スポットだけ別取得
  const placeSpots = await prisma.spot.findMany({
    where: {
      placeId: basePlace.id,
      isActive: true,
    },
    orderBy: { code: "asc" },
    select: {
      id: true,
      code: true,
      label: true,
      operationModeOverride: true,
    },
  });

  // owner 名は必要なら軽く別取得
  const owner = basePlace.ownerId
    ? await prisma.owner.findUnique({
        where: { id: basePlace.ownerId },
        select: { id: true, name: true },
      })
    : null;

  const place = {
    ...basePlace,
    owner,
    spots: placeSpots,
  };

  const now = new Date();

  const [
    reservationsTargetDay,
    hourlyInSessions,
    hourlyOutSessions,
    reservationInSessions,
    daySpotModes,
    activeAssignments,
    totalOwners,
    totalAgents,
    monthlySettlementCount,
  ] = await Promise.all([
    prisma.reservation.findMany({
      where: {
        placeId: place.id,
        date: selectedDate,
      },
      select: {
        id: true,
        date: true,
        slot: true,
        name: true,
        plate: true,
        price: true,
        paid: true,
        checkedIn: true,
        checkedInAt: true,
        checkedOutAt: true,
        createdAt: true,
        spotId: true,
      },
    }),

    prisma.parkingSession.findMany({
      where: {
        placeId: place.id,
        sessionType: "HOURLY",
        status: "IN",
        checkOutAt: null,
      },
      select: {
        id: true,
        plate: true,
        checkInAt: true,
        spotId: true,
        spot: {
          select: {
            code: true,
            label: true,
          },
        },
      },
      orderBy: { checkInAt: "asc" },
    }),

    prisma.parkingSession.findMany({
      where: {
        placeId: place.id,
        sessionType: "HOURLY",
        status: "OUT",
        paid: true,
      },
      select: {
        id: true,
        totalYen: true,
        paidAt: true,
      },
    }),

    prisma.parkingSession.findMany({
      where: {
        placeId: place.id,
        sessionType: "RESERVATION",
        status: "IN",
        checkOutAt: null,
      },
      select: {
        id: true,
        plate: true,
        checkInAt: true,
        spotId: true,
        reservationId: true,
        reservation: {
          select: {
            id: true,
            name: true,
            slot: true,
          },
        },
        spot: {
          select: {
            code: true,
            label: true,
          },
        },
      },
      orderBy: { checkInAt: "asc" },
    }),

    prisma.spotModeCalendar.findMany({
      where: {
        placeId: place.id,
        date: selectedDate,
      },
      select: {
        spotId: true,
        operationMode: true,
      },
    }),

    prisma.placeAssignment.findMany({
      where: {
        placeId: place.id,
        isActive: true,
        startsAt: { lte: new Date(`${selectedDate}T23:59:59+09:00`) },
        OR: [
          { endsAt: null },
          { endsAt: { gte: new Date(`${selectedDate}T00:00:00+09:00`) } },
        ],
      },
      include: {
        Owner: { select: { id: true, name: true } },
        Agent: { select: { id: true, name: true } },
      },
      orderBy: [{ startsAt: "desc" }],
    }),

    prisma.owner.count(),
    prisma.agent.count(),

    prisma.settlement.count({
      where: {
        placeId: place.id,
        month: selectedDate.slice(0, 7),
        status: { not: "CANCELLED" },
      },
    }),
  ]);

  const paidReservations = reservationsTargetDay.filter((r) => r.paid);
  const unpaidReservations = reservationsTargetDay.filter((r) => !r.paid);
  const reservedWaiting = reservationsTargetDay.filter(
    (r) => r.paid && !r.checkedIn && !r.checkedOutAt
  );
  const checkedOutReservations = reservationsTargetDay.filter((r) => !!r.checkedOutAt);

  const hourlyPaidTargetDay = hourlyOutSessions.filter((s) => {
    if (!s.paidAt) return false;
    const paidDay = new Date(s.paidAt).toLocaleDateString("sv-SE", {
      timeZone: "Asia/Tokyo",
    });
    return paidDay === selectedDate;
  });

  const reservationSalesTargetDay = paidReservations.reduce(
    (sum, r) => sum + (r.price || 0),
    0
  );
  const hourlySalesTargetDay = hourlyPaidTargetDay.reduce(
    (sum, s) => sum + (s.totalYen || 0),
    0
  );
  const salesTargetDay = reservationSalesTargetDay + hourlySalesTargetDay;

  const spotModeMap = new Map(daySpotModes.map((x) => [x.spotId, x.operationMode]));
  const hourlyInMap = new Map(hourlyInSessions.map((x) => [x.spotId, x]));
  const reservationInMap = new Map(reservationInSessions.map((x) => [x.spotId, x]));
  const reservedWaitingMap = new Map(
    reservedWaiting.filter((x) => x.spotId).map((x) => [String(x.spotId), x] as const)
  );
  const checkedOutMap = new Map(
    checkedOutReservations
      .filter((x) => x.spotId)
      .map((x) => [String(x.spotId), x] as const)
  );

  const spotStatuses: Array<{
    spotId: string;
    spotCode: string;
    spotLabel: string;
    status: SpotStatus;
  }> = place.spots.map((spot) => {
    const calendarMode = spotModeMap.get(spot.id);
    const effectiveMode =
      spot.operationModeOverride ?? calendarMode ?? place.operationMode;

    if (effectiveMode === "CLOSED") {
      return {
        spotId: spot.id,
        spotCode: spot.code,
        spotLabel: spot.label || spot.code,
        status: {
          kind: "CLOSED",
          label: "停止中",
          tone: "red",
          note: "本日は利用停止",
          href: buildUrl("/admin/spot-mode-calendar", {
            placeId: place.id,
            date: selectedDate,
          }),
        },
      };
    }

    const hourlyIn = hourlyInMap.get(spot.id);
    if (hourlyIn) {
      const mins = minutesDiff(hourlyIn.checkInAt, now);
      return {
        spotId: spot.id,
        spotCode: spot.code,
        spotLabel: spot.label || spot.code,
        status: {
          kind: "IN_HOURLY",
          sessionId: hourlyIn.id,
          label: "時間貸し利用中",
          tone: "green",
          note: `${fmtDateTime(hourlyIn.checkInAt)} 入庫 / ${
            mins != null ? `${mins}分経過` : "-"
          }`,
          href: buildUrl("/admin/parking-sessions", {
            placeId: place.id,
            date: selectedDate,
            status: "IN",
          }),
        },
      };
    }

    const reservationIn = reservationInMap.get(spot.id);
    if (reservationIn) {
      const mins = minutesDiff(reservationIn.checkInAt, now);
      return {
        spotId: spot.id,
        spotCode: spot.code,
        spotLabel: spot.label || spot.code,
        status: {
          kind: "IN_RESERVATION",
          sessionId: reservationIn.id,
          label: "予約利用中",
          tone: "green",
          note: `${fmtDateTime(reservationIn.checkInAt)} 入庫 / ${
            mins != null ? `${mins}分経過` : "-"
          }`,
          href: buildUrl("/admin/reservations", {
            placeId: place.id,
            date: selectedDate,
            status: "CHECKED_IN",
          }),
        },
      };
    }

    const waiting = reservedWaitingMap.get(spot.id);
    if (waiting) {
      return {
        spotId: spot.id,
        spotCode: spot.code,
        spotLabel: spot.label || spot.code,
        status: {
          kind: "RESERVED_WAITING",
          label: "予約済み",
          tone: "yellow",
          note: `${waiting.name} / 未入庫`,
          href: buildUrl("/admin/reservations", {
            placeId: place.id,
            date: selectedDate,
            status: "RESERVED",
          }),
        },
      };
    }

    const checkedOut = checkedOutMap.get(spot.id);
    if (checkedOut) {
      return {
        spotId: spot.id,
        spotCode: spot.code,
        spotLabel: spot.label || spot.code,
        status: {
          kind: "CHECKED_OUT",
          label: "本日出庫済み",
          tone: "gray",
          note: checkedOut.name || "予約利用",
          href: buildUrl("/admin/reservations", {
            placeId: place.id,
            date: selectedDate,
          }),
        },
      };
    }

    return {
      spotId: spot.id,
      spotCode: spot.code,
      spotLabel: spot.label || spot.code,
      status: {
        kind: "AVAILABLE",
        label: "空き",
        tone: "white",
        note:
          effectiveMode === "HOURLY_ONLY"
            ? "時間貸し可"
            : effectiveMode === "RESERVATION_ONLY"
            ? "予約専用"
            : "予約優先→空きは時間貸し",
        href: buildUrl("/admin/spot-mode-calendar", {
          placeId: place.id,
          date: selectedDate,
        }),
      },
    };
  });

  const inUseCount = spotStatuses.filter(
    (x) => x.status.kind === "IN_HOURLY" || x.status.kind === "IN_RESERVATION"
  ).length;
  const waitingCount = spotStatuses.filter(
    (x) => x.status.kind === "RESERVED_WAITING"
  ).length;
  const availableCount = spotStatuses.filter(
    (x) => x.status.kind === "AVAILABLE"
  ).length;
  const closedCount = spotStatuses.filter(
    (x) => x.status.kind === "CLOSED"
  ).length;

  const longStayHourly = hourlyInSessions.filter(
    (x) => (minutesDiff(x.checkInAt, now) ?? 0) >= 180
  );
  const longStayReservation = reservationInSessions.filter(
    (x) => (minutesDiff(x.checkInAt, now) ?? 0) >= 180
  );

  const currentAssignment = activeAssignments[0] ?? null;

  return (
    <main style={pageStyle}>
      <div style={heroStyle}>
        <div>
          <h1 style={pageTitleStyle}>本部ダッシュボード</h1>
          <div style={heroSubStyle}>
            <div>対象 Place: {place.name}</div>
            <div>営業モード: {modeLabel(place.operationMode)}</div>
            <div>住所: {place.address || "未設定"}</div>
            <div>オーナー: {place.owner?.name ?? "未設定"}</div>
          </div>
        </div>

        <div style={heroRightStyle}>
          <div style={heroMiniLabelStyle}>集計対象日</div>
          <div style={heroMiniValueStyle}>{selectedDate}</div>
        </div>
      </div>

      <MonthlyTasksWidget />

      <section style={{ ...cardStyle, marginBottom: 16 }}>
        <form method="GET" style={toolbarStyle}>
          <div style={fieldStyle}>
            <div style={fieldLabelStyle}>対象 Place</div>
            <select name="placeId" defaultValue={place.id} style={inputStyle}>
              {activePlaces.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.slug ? ` (${p.slug})` : ""}
                </option>
              ))}
            </select>
          </div>

          <div style={fieldStyle}>
            <div style={fieldLabelStyle}>日付</div>
            <input
              type="date"
              name="date"
              defaultValue={selectedDate}
              style={inputStyle}
            />
          </div>

          <button type="submit" style={primaryButtonStyle}>
            表示
          </button>
        </form>

        <div style={{ marginTop: 14 }}>
          <AutoRefresh intervalSec={30} enabledDefault={true} />
        </div>

        <div style={{ marginTop: 14 }}>
          <DateSwitcher value={selectedDate} />
        </div>
      </section>

      <div style={summaryGridStyle}>
        <SummaryCard
          title="当日の売上"
          value={fmtYen(salesTargetDay)}
          sub={`予約 ${fmtYen(reservationSalesTargetDay)} / 時間貸し ${fmtYen(hourlySalesTargetDay)}`}
        />
        <SummaryCard
          title="現在利用中"
          value={`${inUseCount} 台`}
          sub={`予約 ${reservationInSessions.length} / 時間貸し ${hourlyInSessions.length}`}
        />
        <SummaryCard
          title="空き区画"
          value={`${availableCount} 区画`}
          sub={`予約待ち ${waitingCount} / 停止 ${closedCount}`}
        />
        <SummaryCard
          title="予約件数"
          value={`${reservationsTargetDay.length} 件`}
          sub={`決済済 ${paidReservations.length} / 未決済 ${unpaidReservations.length}`}
        />
        <SummaryCard
          title="長時間アラート"
          value={`${longStayHourly.length + longStayReservation.length} 件`}
          sub="3時間以上利用中"
        />
        <SummaryCard
          title="月次締め"
          value={`${monthlySettlementCount} 件`}
          sub={`${selectedDate.slice(0, 7)} の settlement`}
        />
      </div>

      <div style={sectionWrapStyle}>
        <section style={cardStyle}>
          <div style={sectionHeaderStyle}>
            <h2 style={sectionTitleStyle}>本日のアラート</h2>
            <Link
              href={buildUrl("/admin/reservations", {
                placeId: place.id,
                date: selectedDate,
              })}
              style={subLinkStyle}
            >
              予約一覧へ
            </Link>
          </div>

          <div style={alertGridStyle}>
            <AlertCard
              tone={unpaidReservations.length > 0 ? "yellow" : "gray"}
              title={`未決済予約 ${unpaidReservations.length} 件`}
              desc="予約作成済みだが決済未完了"
              href={buildUrl("/admin/reservations", {
                placeId: place.id,
                date: selectedDate,
                status: "UNPAID",
              })}
            />
            <AlertCard
              tone={reservedWaiting.length > 0 ? "yellow" : "gray"}
              title={`予約入庫待ち ${reservedWaiting.length} 件`}
              desc="本日分で未入庫の予約"
              href={buildUrl("/admin/reservations", {
                placeId: place.id,
                date: selectedDate,
                status: "RESERVED",
              })}
            />
            <AlertCard
              tone={longStayHourly.length > 0 ? "red" : "gray"}
              title={`長時間駐車（時間貸し） ${longStayHourly.length} 件`}
              desc="3時間以上利用中"
              href={buildUrl("/admin/parking-sessions", {
                placeId: place.id,
                date: selectedDate,
                status: "IN",
              })}
            />
            <AlertCard
              tone={longStayReservation.length > 0 ? "red" : "gray"}
              title={`長時間駐車（予約） ${longStayReservation.length} 件`}
              desc="3時間以上利用中"
              href={buildUrl("/admin/reservations", {
                placeId: place.id,
                date: selectedDate,
                status: "CHECKED_IN",
              })}
            />
          </div>
        </section>

        <section style={cardStyle}>
          <div style={sectionHeaderStyle}>
            <h2 style={sectionTitleStyle}>リアルタイム駐車状況</h2>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Link
                href={buildUrl("/admin/parking-sessions", {
                  placeId: place.id,
                  date: selectedDate,
                  status: "IN",
                })}
                style={primaryLinkStyle}
              >
                利用中セッション
              </Link>
              <Link
                href={buildUrl("/admin/spot-mode-calendar", {
                  placeId: place.id,
                  date: selectedDate,
                })}
                style={secondaryLinkStyle}
              >
                日付別営業モード
              </Link>
            </div>
          </div>

          <div style={spotGridStyle}>
            {spotStatuses.map((row) => (
              <Link
                key={row.spotId}
                href={row.status.href}
                style={{
                  ...spotCardStyle,
                  ...spotToneStyle(row.status.tone),
                }}
              >
                <div style={spotTopStyle}>
                  <div style={{ fontSize: 24, fontWeight: 900 }}>{row.spotCode}</div>
                  <span style={spotBadgeStyle(row.status.tone)}>
                    {row.status.label}
                  </span>
                </div>

                <div style={{ fontSize: 13, color: "#666", marginBottom: 8 }}>
                  {row.spotLabel}
                </div>

                <div style={{ fontSize: 14, lineHeight: 1.7 }}>
                  {row.status.note}
                </div>

                {(row.status.kind === "IN_HOURLY" ||
                  row.status.kind === "IN_RESERVATION") && (
                  <ForceCheckoutButton sessionId={row.status.sessionId} />
                )}
              </Link>
            ))}
          </div>
        </section>

        <div style={twoColStyle}>
          <section style={cardStyle}>
            <div style={sectionHeaderStyle}>
              <h2 style={sectionTitleStyle}>帰属・料率の現在設定</h2>
              <Link href="/admin/assignments" style={subLinkStyle}>
                料率・帰属設定へ
              </Link>
            </div>

            <div style={infoListStyle}>
              <InfoRow
                label="オーナー"
                value={currentAssignment?.Owner?.name ?? place.owner?.name ?? "未設定"}
              />
              <InfoRow
                label="代理店"
                value={currentAssignment?.Agent?.name ?? "未設定"}
              />
              <InfoRow
                label="Owner率"
                value={
                  currentAssignment
                    ? `${(currentAssignment.ownerRateBps / 100).toFixed(2)}%`
                    : "-"
                }
              />
              <InfoRow
                label="Agent率"
                value={
                  currentAssignment
                    ? `${(currentAssignment.agentRateBps / 100).toFixed(2)}%`
                    : "-"
                }
              />
              <InfoRow
                label="本部率"
                value={
                  currentAssignment
                    ? `${(currentAssignment.platformRateBps / 100).toFixed(2)}%`
                    : "-"
                }
              />
              <InfoRow
                label="適用開始"
                value={
                  currentAssignment?.startsAt
                    ? fmtDateTime(currentAssignment.startsAt)
                    : "-"
                }
              />
            </div>
          </section>

          <section style={cardStyle}>
            <div style={sectionHeaderStyle}>
              <h2 style={sectionTitleStyle}>本部メニュー</h2>
            </div>

            <div style={menuGridStyle}>
              <MenuLink
                href={buildUrl("/admin/reservations", {
                  placeId: place.id,
                  date: selectedDate,
                })}
                title="予約一覧"
                desc="予約済み・入庫中・出庫済み・強制出庫"
              />
              <MenuLink
                href={buildUrl("/admin/parking-sessions", {
                  placeId: place.id,
                  date: selectedDate,
                })}
                title="ParkingSession"
                desc="時間貸し / 予約セッションの実績確認"
              />
              <MenuLink
                href={buildUrl("/admin/spot-mode-calendar", {
                  placeId: place.id,
                  date: selectedDate,
                })}
                title="日付別営業モード"
                desc="SLOTごとの予約専用・時間貸し・停止"
              />
              <MenuLink
                href={buildUrl("/admin/sales", {
                  placeId: place.id,
                  date: selectedDate,
                })}
                title="売上一覧"
                desc="決済データの確認"
              />
              <MenuLink
                href={buildUrl("/admin/sales/monthly", {
                  placeId: place.id,
                  month: selectedDate.slice(0, 7),
                })}
                title="月間売上"
                desc="月次サマリ・締め前チェック"
              />
              <MenuLink
                href={buildUrl("/admin/settlements", {
                  placeId: place.id,
                  month: selectedDate.slice(0, 7),
                })}
                title="月次締め"
                desc="Settlement作成・振込管理"
              />
              <MenuLink
                href="/admin/owners"
                title="オーナー管理"
                desc="登録情報・振込先・状態"
              />
              <MenuLink
                href="/admin/agents"
                title="代理店管理"
                desc="標準料率・振込先・状態"
              />
              <MenuLink
                href="/admin/assignments"
                title="料率・帰属設定"
                desc="Placeごとの owner / agent / rate"
              />
              <MenuLink
                href="/admin/places"
                title="Place管理"
                desc="駐車場・SLOT・基本設定"
              />
              <MenuLink
                href="/admin/pricing"
                title="料金設定"
                desc="予約・時間貸し・イベント価格"
              />
            </div>
          </section>
        </div>

        <section style={cardStyle}>
          <div style={sectionHeaderStyle}>
            <h2 style={sectionTitleStyle}>運営メモ</h2>
          </div>

          <div style={memoGridStyle}>
            <MemoRow label="対象 Place 数" value={`${activePlaces.length} 件`} />
            <MemoRow label="オーナー登録数" value={`${totalOwners} 件`} />
            <MemoRow label="代理店登録数" value={`${totalAgents} 件`} />
            <MemoRow label="対象 Place のSLOT数" value={`${place.spots.length} 区画`} />
            <MemoRow label="予約出庫済み" value={`${checkedOutReservations.length} 件`} />
            <MemoRow label="時間貸し売上" value={fmtYen(hourlySalesTargetDay)} />
          </div>
        </section>
      </div>
    </main>
  );
}

function SummaryCard({
  title,
  value,
  sub,
}: {
  title: string;
  value: string;
  sub: string;
}) {
  return (
    <div style={summaryCardStyle}>
      <div style={{ fontSize: 14, color: "#666", marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 30, fontWeight: 900, marginBottom: 8 }}>{value}</div>
      <div style={{ fontSize: 13, color: "#777", lineHeight: 1.6 }}>{sub}</div>
    </div>
  );
}

function MenuLink({
  href,
  title,
  desc,
}: {
  href: string;
  title: string;
  desc: string;
}) {
  return (
    <Link href={href} style={menuLinkStyle}>
      <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 13, color: "#666", lineHeight: 1.7 }}>{desc}</div>
    </Link>
  );
}

function MemoRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div style={memoRowStyle}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div style={infoRowStyle}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function AlertCard({
  tone,
  title,
  desc,
  href,
}: {
  tone: "red" | "yellow" | "gray";
  title: string;
  desc: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      style={{
        ...alertCardStyle,
        ...(tone === "red"
          ? { background: "#fff5f5", borderColor: "#fecaca" }
          : tone === "yellow"
          ? { background: "#fffdf2", borderColor: "#fde68a" }
          : { background: "#f9fafb", borderColor: "#e5e7eb" }),
      }}
    >
      <div style={{ fontSize: 17, fontWeight: 900 }}>{title}</div>
      <div style={{ marginTop: 6, color: "#666", lineHeight: 1.6 }}>{desc}</div>
    </Link>
  );
}

function spotToneStyle(
  tone: "green" | "yellow" | "red" | "gray" | "white"
): CSSProperties {
  switch (tone) {
    case "green":
      return { background: "#f0fdf4", border: "1px solid #bbf7d0" };
    case "yellow":
      return { background: "#fffdf2", border: "1px solid #fde68a" };
    case "red":
      return { background: "#fff5f5", border: "1px solid #fecaca" };
    case "gray":
      return { background: "#f9fafb", border: "1px solid #e5e7eb" };
    default:
      return { background: "#fff", border: "1px solid #e5e7eb" };
  }
}

function spotBadgeStyle(
  tone: "green" | "yellow" | "red" | "gray" | "white"
): CSSProperties {
  const base: CSSProperties = {
    fontSize: 12,
    fontWeight: 800,
    padding: "6px 10px",
    borderRadius: 999,
  };

  if (tone === "green") return { ...base, background: "#16a34a", color: "#fff" };
  if (tone === "yellow") return { ...base, background: "#f59e0b", color: "#fff" };
  if (tone === "red") return { ...base, background: "#dc2626", color: "#fff" };
  if (tone === "gray") return { ...base, background: "#6b7280", color: "#fff" };
  return { ...base, background: "#f3f4f6", color: "#111" };
}

const pageStyle: CSSProperties = {
  maxWidth: 1180,
  margin: "0 auto",
  padding: 24,
};

const heroStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 16,
  marginBottom: 20,
  flexWrap: "wrap",
};

const pageTitleStyle: CSSProperties = {
  fontSize: 32,
  fontWeight: 900,
  marginBottom: 8,
};

const heroSubStyle: CSSProperties = {
  color: "#666",
  lineHeight: 1.8,
};

const heroRightStyle: CSSProperties = {
  minWidth: 240,
  border: "1px solid #e5e7eb",
  borderRadius: 16,
  background: "#fff",
  padding: 16,
};

const heroMiniLabelStyle: CSSProperties = {
  fontSize: 13,
  color: "#666",
  marginBottom: 8,
};

const heroMiniValueStyle: CSSProperties = {
  fontSize: 28,
  fontWeight: 900,
};

const toolbarStyle: CSSProperties = {
  display: "flex",
  gap: 12,
  flexWrap: "wrap",
  alignItems: "end",
};

const fieldStyle: CSSProperties = {
  display: "grid",
  gap: 6,
  minWidth: 220,
};

const fieldLabelStyle: CSSProperties = {
  fontSize: 12,
  color: "#666",
  fontWeight: 700,
};

const inputStyle: CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #d1d5db",
  background: "#fff",
  fontSize: 14,
};

const primaryButtonStyle: CSSProperties = {
  padding: "10px 16px",
  borderRadius: 10,
  border: "1px solid #111",
  background: "#111",
  color: "#fff",
  fontWeight: 800,
  cursor: "pointer",
};

const summaryGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 16,
};

const summaryCardStyle: CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 16,
  background: "#fff",
  padding: 18,
};

const sectionWrapStyle: CSSProperties = {
  marginTop: 24,
  display: "grid",
  gap: 16,
};

const twoColStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1.2fr",
  gap: 16,
};

const cardStyle: CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 16,
  background: "#fff",
  padding: 18,
};

const sectionHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  flexWrap: "wrap",
  marginBottom: 16,
};

const sectionTitleStyle: CSSProperties = {
  fontSize: 22,
  fontWeight: 900,
  margin: 0,
};

const subLinkStyle: CSSProperties = {
  textDecoration: "none",
  fontWeight: 800,
  color: "#111",
};

const primaryLinkStyle: CSSProperties = {
  display: "inline-block",
  textDecoration: "none",
  padding: "10px 14px",
  borderRadius: 10,
  background: "#111827",
  color: "#fff",
  fontWeight: 800,
};

const secondaryLinkStyle: CSSProperties = {
  display: "inline-block",
  textDecoration: "none",
  padding: "10px 14px",
  borderRadius: 10,
  background: "#fff",
  color: "#111",
  border: "1px solid #d1d5db",
  fontWeight: 800,
};

const alertGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: 12,
};

const alertCardStyle: CSSProperties = {
  display: "block",
  textDecoration: "none",
  color: "#111",
  border: "1px solid #e5e7eb",
  borderRadius: 14,
  padding: 16,
};

const spotGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 14,
};

const spotCardStyle: CSSProperties = {
  display: "block",
  borderRadius: 16,
  padding: 16,
  textDecoration: "none",
  color: "#111",
};

const spotTopStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 10,
  marginBottom: 8,
};

const menuGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 14,
};

const menuLinkStyle: CSSProperties = {
  display: "block",
  textDecoration: "none",
  color: "#111",
  border: "1px solid #e5e7eb",
  borderRadius: 14,
  padding: 16,
  background: "#fff",
};

const infoListStyle: CSSProperties = {
  display: "grid",
  gap: 10,
};

const infoRowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  paddingBottom: 8,
  borderBottom: "1px solid #f2f2f2",
};

const memoGridStyle: CSSProperties = {
  display: "grid",
  gap: 10,
  color: "#444",
};

const memoRowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
};