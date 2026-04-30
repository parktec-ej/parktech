export const runtime = "nodejs";
export const preferredRegion = "hnd1";

import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { sendCheckoutThanksMail } from "@/lib/mail";

function ymdTodayJst() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function formatJst(d: Date | null | undefined) {
  if (!d) return "";
  return d.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
}

function normalizeDate(input: string) {
  const v = String(input ?? "").trim();

  if (!v) return "";

  if (/^\d{8}$/.test(v)) {
    return `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`;
  }

  return v;
}

function normalizeSlot(input: string): string {
  const raw = String(input ?? "");

  if (!raw) return "";

  const v = raw.trim().toUpperCase();

  const s = v.match(/^S(\d{1,2})$/i);

  if (s) {
    return `S${String(Number(s[1])).padStart(2, "0")}`;
  }

  const a = v.match(/^([A-Z])[- ]?(\d{1,2})$/i);

  if (a) {
    return `${a[1].toUpperCase()}-${String(Number(a[2])).padStart(2, "0")}`;
  }

  return v;
}

function jsonError(
  error: string,
  message: string,
  status = 400,
  extra?: unknown
) {
  return NextResponse.json(
    {
      ok: false,
      error,
      message,
      ...(extra !== undefined ? { extra } : {}),
    },
    { status }
  );
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);

    if (!body) {
      return jsonError("invalid_json", "JSONが壊れています", 400);
    }

    const placeKey = String(body.placeId ?? "").trim();
    const date = normalizeDate(String(body.date ?? ymdTodayJst()));
    const slot = normalizeSlot(String(body.slot ?? ""));
    const pin = String(body.pin ?? "").trim();

    if (!placeKey) {
      return jsonError("missing_place_id", "placeId は必須です", 400);
    }

    if (!slot) {
      return jsonError("missing_slot", "slot は必須です", 400);
    }

    if (!pin) {
      return jsonError("missing_pin", "pin は必須です", 400);
    }

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return jsonError(
        "invalid_date",
        "date は YYYY-MM-DD 形式で指定してください",
        400
      );
    }

    const place = await prisma.place.findFirst({
      where: {
        OR: [{ id: placeKey }, { slug: placeKey }],
      },
      select: {
        id: true,
        slug: true,
        name: true,
        isActive: true,
      },
    });

    if (!place || !place.isActive) {
      return jsonError("place_not_found", "駐車場が見つかりません", 404);
    }

    const resolvedPlaceId = place.id;

    const spot = await prisma.spot.findFirst({
      where: {
        placeId: resolvedPlaceId,
        code: slot,
        isActive: true,
      },
      select: {
        id: true,
        code: true,
        label: true,
      },
    });

    if (!spot) {
      return jsonError("spot_not_found", "区画が見つかりません", 404);
    }

    const result = await prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const openSession = await tx.parkingSession.findFirst({
          where: {
            placeId: resolvedPlaceId,
            spotId: spot.id,
            sessionType: "RESERVATION",
            status: "IN",
            checkOutAt: null,
          },
          orderBy: {
            checkInAt: "desc",
          },
          select: {
            id: true,
            reservationId: true,
            checkInAt: true,
          },
        });

        let reservation = openSession?.reservationId
          ? await tx.reservation.findUnique({
              where: { id: openSession.reservationId },
              include: {
                place: {
                  select: {
                    name: true,
                  },
                },
                spot: {
                  select: {
                    code: true,
                    label: true,
                  },
                },
              },
            })
          : null;

        if (!reservation) {
          reservation = await tx.reservation.findFirst({
            where: {
              placeId: resolvedPlaceId,
              date,
              slot,
              pin,
            },
            orderBy: {
              createdAt: "desc",
            },
            include: {
              place: {
                select: {
                  name: true,
                },
              },
              spot: {
                select: {
                  code: true,
                  label: true,
                },
              },
            },
          });
        }

        if (!reservation) {
          return {
            kind: "error" as const,
            response: NextResponse.json(
              {
                ok: false,
                error: "no_reservation",
                message: "予約が見つかりません。",
                date,
                slot,
                placeId: resolvedPlaceId,
              },
              { status: 404 }
            ),
          };
        }

        if (!reservation.paid) {
          return {
            kind: "error" as const,
            response: NextResponse.json(
              {
                ok: false,
                error: "not_paid",
                message: "この予約は未決済です。",
                date,
                slot,
                placeId: resolvedPlaceId,
                reservationId: reservation.id,
              },
              { status: 409 }
            ),
          };
        }

        if (!reservation.checkedIn) {
          return {
            kind: "error" as const,
            response: NextResponse.json(
              {
                ok: false,
                error: "not_checked_in",
                message: "チェックインが完了していません。",
                date,
                slot,
                placeId: resolvedPlaceId,
                reservationId: reservation.id,
              },
              { status: 409 }
            ),
          };
        }

        const now = new Date();

        if (reservation.checkedOutAt) {
          const totalMinutes = reservation.checkedInAt
            ? Math.max(
                0,
                Math.round(
                  (reservation.checkedOutAt.getTime() -
                    reservation.checkedInAt.getTime()) /
                    60000
                )
              )
            : 0;

          return {
            kind: "success" as const,
            response: NextResponse.json({
              ok: true,
              status: "already_checked_out",
              reservationId: reservation.id,
              placeName: reservation.place?.name ?? place.name,
              spotLabel:
                reservation.spot?.label ?? reservation.spot?.code ?? slot,
              useDate: reservation.date,
              checkInAt: formatJst(reservation.checkedInAt),
              checkedOutAt: formatJst(reservation.checkedOutAt),
              totalMinutes,
              totalYen: reservation.price,
              paid: true,
            }),
          };
        }

        const updatedReservation = await tx.reservation.update({
          where: { id: reservation.id },
          data: {
            checkedOutAt: now,
          },
          include: {
            place: {
              select: {
                name: true,
              },
            },
            spot: {
              select: {
                code: true,
                label: true,
              },
            },
          },
        });

        const sessionToClose =
          openSession ??
          (await tx.parkingSession.findFirst({
            where: {
              reservationId: updatedReservation.id,
              placeId: updatedReservation.placeId ?? resolvedPlaceId,
              spotId: updatedReservation.spotId ?? spot.id,
              sessionType: "RESERVATION",
              status: "IN",
              checkOutAt: null,
            },
            orderBy: {
              checkInAt: "desc",
            },
            select: {
              id: true,
              checkInAt: true,
            },
          }));

        let totalMinutes = 0;

        if (sessionToClose) {
          totalMinutes = Math.max(
            0,
            Math.round(
              (now.getTime() - sessionToClose.checkInAt.getTime()) / 60000
            )
          );

          await tx.parkingSession.update({
            where: { id: sessionToClose.id },
            data: {
              checkOutAt: now,
              totalMinutes,
              totalYen: updatedReservation.price,
              paid: true,
              paidAt: updatedReservation.paidAt ?? now,
              paymentRef: updatedReservation.paymentRef,
              status: "OUT",
            },
          });
        } else if (updatedReservation.checkedInAt) {
          totalMinutes = Math.max(
            0,
            Math.round(
              (now.getTime() - updatedReservation.checkedInAt.getTime()) / 60000
            )
          );
        }

        return {
          kind: "success" as const,
          reservation: updatedReservation,
          totalMinutes,
          response: NextResponse.json({
            ok: true,
            status: "checked_out",
            reservationId: updatedReservation.id,
            placeName: updatedReservation.place?.name ?? place.name,
            spotLabel:
              updatedReservation.spot?.label ??
              updatedReservation.spot?.code ??
              slot,
            useDate: updatedReservation.date,
            checkInAt: formatJst(updatedReservation.checkedInAt),
            checkedOutAt: formatJst(updatedReservation.checkedOutAt ?? now),
            totalMinutes,
            totalYen: updatedReservation.price,
            paid: true,
            message: "出庫が完了しました",
          }),
        };
      }
    );

    if (result.kind === "error") {
      return result.response;
    }

    if (
      result.kind === "success" &&
      "reservation" in result &&
      result.reservation
    ) {
      const reservation = result.reservation;

      console.log("reservation checkout mail check:", {
        reservationId: reservation.id,
        email: reservation.email,
        paymentRef: reservation.paymentRef,
        placeName: reservation.place?.name ?? "",
        spotLabel: reservation.spot?.label ?? reservation.spot?.code ?? slot,
        totalYen: reservation.price,
      });

      if (reservation.email && reservation.paymentRef) {
        try {
          await sendCheckoutThanksMail({
            to: reservation.email,
            placeName: reservation.place?.name ?? "",
            spotLabel: reservation.spot?.label ?? reservation.spot?.code ?? slot,
            useDate: reservation.date,
            checkIn: formatJst(reservation.checkedInAt),
            checkOut: formatJst(reservation.checkedOutAt),
            minutes: result.totalMinutes,
            totalYen: reservation.price,
            paymentRef: reservation.paymentRef,
            flowLabel: "予約利用",
          });

          console.log("reservation checkout thanks mail sent");
        } catch (mailErr: unknown) {
          console.error("reservation checkout thanks mail error:", mailErr);
        }
      } else {
        console.log("reservation checkout thanks mail skipped:", {
          hasEmail: !!reservation.email,
          hasPaymentRef: !!reservation.paymentRef,
          email: reservation.email ?? null,
          paymentRef: reservation.paymentRef ?? null,
        });
      }
    }

    return result.response;
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);

    console.error("checkout error:", e);

    return NextResponse.json(
      {
        ok: false,
        error: "server_error",
        message,
      },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);

  return NextResponse.json({
    ok: true,
    hint: 'POST {"placeId":"...","slot":"A-01","date":"YYYY-MM-DD","pin":"1234"}',
    receivedUrl: url.toString(),
  });
}