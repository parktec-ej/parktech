export const runtime = "nodejs";
export const preferredRegion = "hnd1";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolveActivePlace } from "@/lib/place-resolver";
import { isReservationMaintenance } from "@/lib/maintenance";
import {
  getReservationFixedPrice,
  getReservationOpenAtJst,
  isReservationOpen,
  ymdToUtcDate,
} from "@/lib/pricing-core";
import {
  MONTHLY_PLACE_SLUG,
  MONTHLY_SLOT_CODES,
  OCCUPYING_STATUSES,
  MONTHLY_EVENT_OFFER_DEADLINE_DAYS,
  MONTHLY_EVENT_PRE_RESPONSE_START_YMD,
} from "@/lib/monthly-config";
import { isMonthlySpotReleasedForEvent } from "@/lib/monthly-event-release";

type EventDayLite = {
  id: string;
  reservationOpenDaysBefore: number | null;
};

function computeReservationOpen(
  eventDay: EventDayLite | null,
  ymd: string
): {
  ok: boolean;
  openDaysBefore: number;
  openAt: Date | null;
  eventDay: EventDayLite | null;
} {
  if (!eventDay) {
    return { ok: true, openDaysBefore: 0, openAt: null, eventDay: null };
  }

  const openDaysBefore = Number(eventDay.reservationOpenDaysBefore ?? 0);

  if (openDaysBefore <= 0) {
    return { ok: true, openDaysBefore: 0, openAt: null, eventDay };
  }

  const openAt = getReservationOpenAtJst(ymd, openDaysBefore);
  return {
    ok: new Date() >= openAt,
    openDaysBefore,
    openAt,
    eventDay,
  };
}

function jsonError(message: string, status = 400, error?: string) {
  return NextResponse.json(
    {
      ok: false,
      error: error ?? "bad_request",
      message,
    },
    { status }
  );
}

function normalizeDate(input: string) {
  const value = String(input ?? "").trim();

  if (!value) return "";

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

  if (/^\d{8}$/.test(value)) {
    return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  }

  return value;
}

function normalizeSlot(input: string) {
  const value = String(input ?? "").trim().toUpperCase();

  if (!value) return "";

  const s = value.match(/^S(\d{1,2})$/i);
  if (s) {
    return `S${String(Number(s[1])).padStart(2, "0")}`;
  }

  const a = value.match(/^([A-Z])[- ]?(\d{1,2})$/i);
  if (a) {
    return `${a[1].toUpperCase()}-${String(Number(a[2])).padStart(2, "0")}`;
  }

  return value;
}

function ymdTodayJst() {
  return new Date().toLocaleDateString("sv-SE", {
    timeZone: "Asia/Tokyo",
  });
}

type OperationMode =
  | "RESERVATION_ONLY"
  | "HOURLY_ONLY"
  | "RESERVATION_THEN_HOURLY"
  | "EVENT_ONLY"
  | "CLOSED"
  | "MONTHLY";

type SpotRow = {
  id: string;
  code: string;
  label: string | null;
  operationModeOverride: OperationMode | null;
};

type ReservationRow = {
  id: string;
  slot: string;
  spotId: string | null;
  price: number;
  createdAt: Date;
  status: string;
};

type DayModeRow = {
  spotId: string;
  operationMode: OperationMode;
};

async function isActiveEventDay(placeId: string, date: string) {
  const targetDate = ymdToUtcDate(date);

  const row = await prisma.eventDay.findFirst({
    where: {
      placeId,
      date: targetDate,
      isActive: true,
    },
    select: {
      id: true,
    },
  });

  return Boolean(row);
}

function canReserve(
  mode: string | null | undefined,
  eventDayActive: boolean
) {
  if (mode === "RESERVATION_ONLY") return true;
  if (mode === "RESERVATION_THEN_HOURLY") return true;
  if (mode === "EVENT_ONLY") return eventDayActive;
  return false;
}

export async function GET(req: NextRequest) {
  const startedAt = Date.now();
  console.log("[reservations] start GET");
  try {
    const url = new URL(req.url);

    const date = normalizeDate(
      url.searchParams.get("date") || ymdTodayJst()
    );

    const inputPlaceId = String(
      url.searchParams.get("placeId") ?? ""
    ).trim();

    const inputPlaceSlug = String(
      url.searchParams.get("placeSlug") ?? ""
    ).trim();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return jsonError(
        "date は YYYY-MM-DD 形式で指定してください",
        400,
        "invalid_date"
      );
    }

    const placeWhere: { id?: string; slug?: string; isActive: boolean } = {
      isActive: true,
    };
    if (inputPlaceId) placeWhere.id = inputPlaceId;
    else if (inputPlaceSlug) placeWhere.slug = inputPlaceSlug;

    const targetUtcDate = ymdToUtcDate(date);

    const [placeRaw, eventDayRaw, spotsRaw, reservationsRaw, dayModesRaw] =
      await Promise.all([
        prisma.place.findFirst({
          where: placeWhere,
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            slug: true,
            name: true,
            address: true,
            operationMode: true,
          },
        }),

        prisma.eventDay.findFirst({
          where: {
            place: placeWhere,
            date: targetUtcDate,
            isActive: true,
          },
          select: {
            id: true,
            reservationOpenDaysBefore: true,
          },
        }),

        prisma.spot.findMany({
          where: {
            place: placeWhere,
            isActive: true,
          },
          orderBy: [{ code: "asc" }],
          select: {
            id: true,
            code: true,
            label: true,
            operationModeOverride: true,
          },
        }),

        prisma.reservation.findMany({
          where: {
            place: placeWhere,
            date,
            status: "CONFIRMED",
          },
          select: {
            id: true,
            slot: true,
            spotId: true,
            price: true,
            createdAt: true,
            status: true,
          },
        }),

        prisma.spotModeCalendar.findMany({
          where: {
            place: placeWhere,
            date,
          },
          select: {
            spotId: true,
            operationMode: true,
          },
        }),
      ]);

    const place = placeRaw;
    if (!place) {
      return jsonError("place が見つかりません", 404, "place_not_found");
    }

    const eventDay = eventDayRaw as EventDayLite | null;
    const reservationOpen = computeReservationOpen(eventDay, date);
    const eventDayActive = Boolean(eventDay);

    const reservations = reservationsRaw as ReservationRow[];
    const dayModes = dayModesRaw as DayModeRow[];

    const dayModeMap = new Map<string, OperationMode>(
      dayModes.map((x: DayModeRow) => [x.spotId, x.operationMode])
    );

    // 月極4区画(A-17〜A-20)の扱いは「有効な月極契約の有無」で振り分ける。
    // 契約あり＝契約者専有（一般グリッドに出さず、満車後に要承認ティアへ）。
    // 契約なし＝一般枠として白表示（実質18枠）。SpotModeCalendar の
    // RESERVATION_ONLY マーカーには依存しない（decline由来の残マーカーを無害化）。
    // rifu-main のみ対象。他拠点・他spotには一切影響させない。
    const monthlyCodeSpotIds =
      place.slug === MONTHLY_PLACE_SLUG
        ? (spotsRaw as SpotRow[])
            .filter((s) =>
              (MONTHLY_SLOT_CODES as readonly string[]).includes(s.code)
            )
            .map((s) => s.id)
        : [];
    const occupyingContracts = monthlyCodeSpotIds.length
      ? await prisma.monthlyContract.findMany({
          where: {
            spotId: { in: monthlyCodeSpotIds },
            status: { in: [...OCCUPYING_STATUSES] },
          },
          select: { id: true, spotId: true },
        })
      : [];
    const contractBySpot = new Map<string, string>(
      occupyingContracts
        .filter((c) => Boolean(c.spotId))
        .map((c) => [c.spotId as string, c.id])
    );
    const contractSpotIds = new Set<string>(contractBySpot.keys());

    const spots = (spotsRaw as SpotRow[]).filter((s) => {
      // MONTHLY モードの区画は契約者専有のため一般グリッドに出さない（多拠点対応・石堂等）。
      // 実効モード＝日別上書き ?? 区画上書き ?? 駐車場モード。
      const effForFilter =
        dayModeMap.get(s.id) ?? s.operationModeOverride ?? place.operationMode;
      if (effForFilter === "MONTHLY") return false;

      // 月極4区画(A-17〜A-20)は契約ありなら非表示・契約なしなら白表示。
      if (
        place.slug === MONTHLY_PLACE_SLUG &&
        (MONTHLY_SLOT_CODES as readonly string[]).includes(s.code)
      ) {
        return !contractSpotIds.has(s.id);
      }
      return true;
    });

    const reservedSpotIds = new Set<string>(
      reservations
        .map((r: ReservationRow) => r.spotId)
        .filter((x: string | null): x is string => Boolean(x))
    );

    const reservedSlots = new Set<string>(
      reservations
        .map((r: ReservationRow) => normalizeSlot(r.slot))
        .filter((x: string): x is string => Boolean(x))
    );

    const availableSpots = spots.map((spot: SpotRow) => {
      const normalizedCode = normalizeSlot(spot.code);

      const effectiveMode =
        dayModeMap.get(spot.id) ??
        spot.operationModeOverride ??
        place.operationMode ??
        "RESERVATION_ONLY";

      const modeAllowsReservation = canReserve(
        effectiveMode,
        eventDayActive
      );

      const isReserved =
        reservedSpotIds.has(spot.id) || reservedSlots.has(normalizedCode);

      const isAvailable =
        reservationOpen.ok && modeAllowsReservation && !isReserved;

      // 予約不可の「理由」を表す状態
      let status:
        | "AVAILABLE"
        | "RESERVED"
        | "NOT_OPEN"
        | "PENDING_EVENT"
        | "CLOSED"
        | "REQUIRES_APPROVAL"
        | "PENDING_APPROVAL";
      if (isReserved) {
        status = "RESERVED"; // 実際に予約済み
      } else if (!reservationOpen.ok) {
        status = "NOT_OPEN"; // 予約開始時刻より前（解放日待ち）
      } else if (!modeAllowsReservation) {
        status =
          effectiveMode === "EVENT_ONLY" ? "PENDING_EVENT" : "CLOSED";
      } else {
        status = "AVAILABLE";
      }

      return {
        id: spot.id,
        code: spot.code,
        label: spot.label,
        mode: effectiveMode,
        isAvailable,
        status,
        requiresApproval: false,
      };
    });

    // --- ① event-monthly：満車時の月極区画「要承認」枠の登場 ---
    // イベント日に一般枠が満車のときだけ、保持中の月極区画（未解放・未予約）を
    // 「要承認(REQUIRES_APPROVAL)」で登場させる。既に申請中なら「承認待ち(PENDING_APPROVAL)」。
    // 受付窓：today(JST) <= 開催日 - MONTHLY_EVENT_OFFER_DEADLINE_DAYS 日。
    // ※申請アクション・画面表示は②。ここは在庫判定と表示ステータスのみ。
    // availableSpots の status は代入値で 5 種に絞られるため、承認枠用に status を
    // 広げた要素型を明示（他フィールドは availableSpots と同一）。
    type ApprovalSpot = Omit<(typeof availableSpots)[number], "status"> & {
      status: "REQUIRES_APPROVAL" | "PENDING_APPROVAL" | "APPROVED";
    };
    const approvalSpots: ApprovalSpot[] = [];
    // 【複製先あり】この満車判定と同一の定義が
    // app/api/public/availability/route.ts にも存在します（HP向け公開API）。
    // 判定条件を変更する場合は、必ず両方を同時に修正してください。
    const generalSoldOut =
      eventDayActive &&
      reservationOpen.ok &&
      availableSpots.length > 0 &&
      availableSpots.every((s) => !s.isAvailable);

    // 顧客向け満車バナー用の一次判定。generalSoldOut とは別物。
    // 「表示中の全枠が RESERVED」＝純粋な満車。解放待ち(NOT_OPEN)・開催待ち(PENDING_EVENT)・
    // 予約不可(CLOSED)は満車ではないので含めない。
    // ※事前回答方式で開放された月極区画を考慮した最終判定は preResponseSpots
    //   確定後（下部の soldOut）で行う。
    const generalAllReserved =
      availableSpots.length > 0 &&
      availableSpots.every((s) => s.status === "RESERVED");

    const offerDeadline = new Date(targetUtcDate);
    offerDeadline.setUTCDate(
      offerDeadline.getUTCDate() - MONTHLY_EVENT_OFFER_DEADLINE_DAYS
    );
    const offerDeadlineYmd = offerDeadline.toISOString().slice(0, 10);
    const offerWindowOpen = ymdTodayJst() <= offerDeadlineYmd;

    // 事前回答方式（date >= 切替日）で一般開放/保留した月極区画を積む先。
    // 保留は選択不可の "PENDING_APPROVAL" を用いるため status を広げて明示する。
    type PreResponseSpot = Omit<(typeof availableSpots)[number], "status"> & {
      status: "AVAILABLE" | "PENDING_APPROVAL";
    };
    const preResponseSpots: PreResponseSpot[] = [];

    if (place.slug === MONTHLY_PLACE_SLUG && generalSoldOut) {
      // 契約が押さえている月極区画（当日予約無し）。契約有無は上で判定済み。
      // ※CONFIRMED 予約のある月極区画はここに含まれず reservedMonthlySpots へ回る。
      const heldMonthlySpots = (spotsRaw as SpotRow[]).filter(
        (s) =>
          (MONTHLY_SLOT_CODES as readonly string[]).includes(s.code) &&
          contractSpotIds.has(s.id) &&
          !reservedSpotIds.has(s.id) &&
          !reservedSlots.has(normalizeSlot(s.code))
      );

      // 切替日以降のイベント日のみ事前回答方式。未満は既存の承認フロー方式を完全維持。
      const usePreResponse = date >= MONTHLY_EVENT_PRE_RESPONSE_START_YMD;

      if (usePreResponse) {
        // ===== 事前回答方式（2026-09-01 以降）=====
        // 開放判定は共通関数 isMonthlySpotReleasedForEvent に一本化する
        // （POST/checkout と完全に同一の判定）。EventMonthlyOffer は参照しない。
        // heldMonthlySpots は当日 CONFIRMED 予約が無い契約保持区画のみ。
        for (const s of heldMonthlySpots) {
          const open = await isMonthlySpotReleasedForEvent(s.id, date);
          preResponseSpots.push({
            id: s.id,
            code: s.code,
            label: s.label,
            mode: "EVENT_ONLY",
            isAvailable: open,
            status: open ? "AVAILABLE" : "PENDING_APPROVAL",
            requiresApproval: false,
          });
        }
      } else if (offerWindowOpen) {
        // ===== 既存の承認フロー方式（2026-09-01 未満・従来どおり）=====
        if (heldMonthlySpots.length > 0) {
          const heldSpotIds = heldMonthlySpots.map((s) => s.id);
          // 契約(contractBySpot)は GET 冒頭で取得済み。ここではオファーのみ取得。
          const offers = await prisma.eventMonthlyOffer.findMany({
            where: { spotId: { in: heldSpotIds }, date },
            select: { spotId: true, status: true, applicantReservationId: true },
          });

          const offerBySpot = new Map(offers.map((o) => [o.spotId, o]));

          for (const s of heldMonthlySpots) {
            // 月極契約が押さえている区画のみ対象（契約の無い空き区画は対象外）
            if (!contractBySpot.has(s.id)) continue;

            const offer = offerBySpot.get(s.id);
            const offerStatus = offer?.status;

            // EXPIRED かつ未予約は approval-request が再受付できる行。
            // 受付側と表示側を一致させるため「要承認(申請可)」で再表示する。
            const reclaimable =
              offerStatus === "EXPIRED" && offer?.applicantReservationId == null;

            // 既に決着済み（月極が使う/決済済/取消/予約済みEXPIRED）は再提供しない
            if (
              offerStatus === "TENANT_TOOK" ||
              offerStatus === "PAID" ||
              offerStatus === "CANCELED" ||
              (offerStatus === "EXPIRED" && !reclaimable)
            ) {
              continue;
            }

            // オファー未作成→要承認(申請可)
            // WAITING / TENANT_CHARGE_PENDING→承認待ち(選択不可)
            // RELEASED→承認済み。申請者にはメールで決済リンク送付済みのため
            //   グリッドからは決済させない（匿名の第三者が押せてしまうため）。表示のみ変更。
            const requiresApproval = !offerStatus || reclaimable;
            const offerStatusLabel: "REQUIRES_APPROVAL" | "PENDING_APPROVAL" | "APPROVED" =
              requiresApproval
                ? "REQUIRES_APPROVAL"
                : offerStatus === "RELEASED"
                  ? "APPROVED"
                  : "PENDING_APPROVAL";
            approvalSpots.push({
              id: s.id,
              code: s.code,
              label: s.label,
              mode: "EVENT_ONLY",
              isAvailable: false,
              status: offerStatusLabel,
              requiresApproval,
            });
          }
        }
      }
    }

    // 顧客向け満車バナーの最終判定。
    // 事前回答方式（2026-09-01以降）で開放された月極区画は「承認不要」でそのまま
    // 予約できるため、1枠でも空きがあればその日は満車ではない。
    const monthlyOpenCount = preResponseSpots.filter((s) => s.isAvailable).length;
    const soldOut = generalAllReserved && monthlyOpenCount === 0;
    // 一般枠のみ満席で月極開放枠に空きがある状態（画面の案内文言用）。
    const generalFullMonthlyOpen = generalAllReserved && monthlyOpenCount > 0;

    // 月極契約区画のうち、その日に確定予約があるものを「予約済み」で表示する。
    // 一般グリッドからは契約により除外され、承認枠ブロックは
    // generalSoldOut && offerWindowOpen の条件下でしか動かないため、
    // ここで独立して積まないと成約済み区画がグリッドから消えてしまう。
    const reservedMonthlySpots =
      place.slug === MONTHLY_PLACE_SLUG
        ? (spotsRaw as SpotRow[])
            .filter(
              (s) =>
                (MONTHLY_SLOT_CODES as readonly string[]).includes(s.code) &&
                contractSpotIds.has(s.id) &&
                (reservedSpotIds.has(s.id) ||
                  reservedSlots.has(normalizeSlot(s.code)))
            )
            .map((s) => ({
              id: s.id,
              code: s.code,
              label: s.label,
              mode: "EVENT_ONLY",
              isAvailable: false,
              status: "RESERVED" as const,
              requiresApproval: false,
            }))
        : [];

    return NextResponse.json({
      ok: true,
      place,
      date,
      reservationOpen,
      eventDayActive,
      spots: [
        ...availableSpots,
        ...approvalSpots,
        ...preResponseSpots,
        ...reservedMonthlySpots,
      ],
      reservations,
      soldOut,
      generalFullMonthlyOpen,
      monthlyOpenCount,
      maintenance: isReservationMaintenance(place.slug),
    });
  } catch (error: unknown) {
    console.error(error);

    return jsonError(
      "予約一覧取得に失敗しました",
      500,
      "server_error"
    );
  } finally {
    console.log("[reservations] done GET", { ms: Date.now() - startedAt });
  }
}

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  console.log("[reservations] start POST");
  try {
    const body = await req.json();

    const placeId = String(body.placeId ?? "").trim();
    const placeSlug = String(body.placeSlug ?? "").trim();
    const spotId = String(body.spotId ?? "").trim();

    const date = normalizeDate(
      body.date || ymdTodayJst()
    );

    const name = String(body.name ?? "").trim();
    const plate = String(body.plate ?? "").trim();
    const email = String(body.email ?? "").trim();
    const phone = String(body.phone ?? "").trim();

    if (phone && !/^[0-9\-\s\+\(\)]+$/.test(phone)) {
      return jsonError(
        "電話番号の形式が正しくありません",
        400,
        "invalid_phone"
      );
    }

    if (!spotId) {
      return jsonError(
        "spotId が必要です",
        400,
        "missing_spot_id"
      );
    }

    if (!name) {
      return jsonError(
        "氏名が必要です",
        400,
        "missing_name"
      );
    }

    if (!plate) {
      return jsonError(
        "車両ナンバーが必要です",
        400,
        "missing_plate"
      );
    }

    const place = await resolveActivePlace({
      placeId,
      placeSlug,
    });

    if (!place) {
      return jsonError(
        "place が見つかりません",
        404,
        "place_not_found"
      );
    }

    if (isReservationMaintenance(place.slug)) {
      return jsonError(
        "ただいまシステムメンテナンス中のため、新規予約を停止しています。",
        503,
        "maintenance"
      );
    }

    const reservationOpen = await isReservationOpen(
      place.id,
      date
    );

    if (!reservationOpen.ok) {
      return jsonError(
        "まだ予約開始前です",
        409,
        "not_open_yet"
      );
    }

    const spot = await prisma.spot.findFirst({
      where: {
        id: spotId,
        placeId: place.id,
        isActive: true,
      },
      select: {
        id: true,
        code: true,
        label: true,
        operationModeOverride: true,
      },
    });

    if (!spot) {
      return jsonError(
        "spot が見つかりません",
        404,
        "spot_not_found"
      );
    }

    // 月極4区画(A-17〜A-20)は有効な月極契約があれば契約者専有のため直接予約を拒否。
    // 契約が無ければ一般枠として通過（マーカーには依存しない）。
    if (
      place.slug === MONTHLY_PLACE_SLUG &&
      (MONTHLY_SLOT_CODES as readonly string[]).includes(spot.code)
    ) {
      const occupying = await prisma.monthlyContract.findFirst({
        where: { spotId: spot.id, status: { in: [...OCCUPYING_STATUSES] } },
        select: { id: true },
      });
      // 契約保持中でも、事前回答方式でそのイベント日に開放されていれば通過させる
      // （GET と完全に同一判定）。直後の EVENT_ONLY モード判定でイベント日以外は弾かれる。
      if (occupying && !(await isMonthlySpotReleasedForEvent(spot.id, date))) {
        return jsonError(
          "この区画は月極契約者専有のため予約できません",
          409,
          "spot_not_reservable"
        );
      }
    }

    const dayMode =
      await prisma.spotModeCalendar.findUnique({
        where: {
          spotId_date: {
            spotId: spot.id,
            date,
          },
        },
        select: {
          operationMode: true,
        },
      });

    const eventDayActive =
      await isActiveEventDay(
        place.id,
        date
      );

    const effectiveMode =
      dayMode?.operationMode ??
      spot.operationModeOverride ??
      place.operationMode ??
      "RESERVATION_ONLY";

    if (
      !canReserve(
        effectiveMode,
        eventDayActive
      )
    ) {
      return jsonError(
        effectiveMode === "EVENT_ONLY"
          ? "イベント日以外は予約できません"
          : "この区画は予約不可です",
        409,
        "not_reservable"
      );
    }

    const exists =
      await prisma.reservation.findFirst({
        where: {
          placeId: place.id,
          spotId: spot.id,
          date,
          status: "CONFIRMED",
        },
        select: {
          id: true,
        },
      });

    if (exists) {
      return jsonError(
        "その区画はすでに予約済みです。",
        409,
        "already_reserved"
      );
    }

    // 当日の予約は、その区画に稼働中の時間貸しセッションがある場合は受け付けない。
    // 時間貸しは日をまたがない前提のため、翌日以降の予約は影響を受けない。
    if (date === ymdTodayJst()) {
      const occupiedByHourly =
        await prisma.parkingSession.findFirst({
          where: {
            placeId: place.id,
            spotId: spot.id,
            status: { in: ["IN", "PENDING"] },
          },
          select: {
            id: true,
          },
        });

      if (occupiedByHourly) {
        return jsonError(
          "その区画は現在ご利用中のため、本日の予約は受け付けられません。",
          409,
          "occupied_by_hourly"
        );
      }
    }

    const price =
      await getReservationFixedPrice(
        place.id,
        date
      );

    const pin = String(
      Math.floor(
        1000 + Math.random() * 9000
      )
    );

    const created =
      await prisma.reservation.create({
        data: {
          placeId: place.id,
          spotId: spot.id,
          date,
          slot: spot.code,
          name,
          plate,
          email: email || null,
          phone: phone || null,
          price,
          pin,
          paid: false,
          status: "CONFIRMED",
          refundStatus: "NONE",
        },
      });

    return NextResponse.json({
      ok: true,
      reservation: created,
    });
  } catch (error: unknown) {
    console.error(error);

    return jsonError(
      "予約作成に失敗しました",
      500,
      "server_error"
    );
  } finally {
    console.log("[reservations] done POST", { ms: Date.now() - startedAt });
  }
}