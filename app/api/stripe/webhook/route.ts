import { NextResponse } from "next/server";
import Stripe from "stripe";
import { prisma } from "@/lib/db";
import { stripe } from "@/lib/stripe";
import { sendReservationPinMail, sendCheckoutThanksMail } from "@/lib/mail";
import { uploadReceiptPdf } from "@/lib/receipt-storage";
import { calcSplitAmounts, calcTax } from "@/lib/settlement-math";
import { buildSettlementSnapshot } from "@/lib/settlement-snapshot";
import crypto from "crypto";

export const runtime = "nodejs";

const ISSUER_NAME =
  process.env.ISSUER_NAME || "パークテック イーストジャパン";
const ISSUER_INVOICE_NO =
  process.env.ISSUER_INVOICE_NO || "T5810943607466";

function toJstDateStart(ymd: string) {
  return new Date(`${ymd}T00:00:00+09:00`);
}

function getRecognizedMonthFromYmd(ymd: string) {
  return ymd.slice(0, 7);
}

function getRecognizedMonthFromDate(d: Date) {
  return d.toLocaleDateString("sv-SE", {
    timeZone: "Asia/Tokyo",
  }).slice(0, 7);
}

function genPin4() {
  return String(Math.floor(Math.random() * 10000)).padStart(4, "0");
}

function formatJst(d: Date | null | undefined) {
  if (!d) return "";
  return d.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
}

function formatYmdJst(d: Date | null | undefined) {
  if (!d) return "";
  return d.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}

function buildReceiptNo(prefix = "R") {
  const now = new Date();
  const ymd = now
    .toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" })
    .replace(/-/g, "");
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}-${ymd}-${rand}`;
}

async function receiptExists(
  paymentRef?: string | null,
  paymentIntentId?: string | null
) {
  if (!paymentRef && !paymentIntentId) return false;

  const orConditions = [
    ...(paymentRef ? [{ paymentRef }] : []),
    ...(paymentIntentId ? [{ paymentIntentId }] : []),
  ];

  if (orConditions.length === 0) return false;

  const existing = await prisma.receipt.findFirst({
    where: {
      OR: orConditions,
    },
    select: { id: true },
  });

  return !!existing;
}

async function paymentExists(params: {
  paymentRef?: string | null;
  paymentIntentId?: string | null;
  reservationId?: string | null;
  parkingSessionId?: string | null;
}) {
  const orConditions = [
    ...(params.paymentRef ? [{ paymentRef: params.paymentRef }] : []),
    ...(params.paymentIntentId ? [{ paymentIntentId: params.paymentIntentId }] : []),
    ...(params.reservationId ? [{ reservationId: params.reservationId }] : []),
    ...(params.parkingSessionId ? [{ parkingSessionId: params.parkingSessionId }] : []),
  ];

  if (orConditions.length === 0) return false;

  const existing = await prisma.payment.findFirst({
    where: {
      OR: orConditions,
    },
    select: { id: true },
  });

  return !!existing;
}

function buildReservationReceiptBuffer(params: {
  parkingName: string;
  useDate: string;
  slot: string;
  customerName: string;
  plate: string;
  subtotal: number;
  tax: number;
  total: number;
  receiptNo: string;
}) {
  const {
    parkingName,
    useDate,
    slot,
    customerName,
    plate,
    subtotal,
    tax,
    total,
    receiptNo,
  } = params;

  const content = [
    "領収書",
    `Receipt No: ${receiptNo}`,
    `発行者: ${ISSUER_NAME}`,
    `登録番号: ${ISSUER_INVOICE_NO}`,
    "",
    `駐車場: ${parkingName}`,
    `利用日: ${useDate}`,
    `区画: ${slot}`,
    `氏名: ${customerName}`,
    `ナンバー: ${plate}`,
    "",
    `小計: ${subtotal}円`,
    `消費税(10%): ${tax}円`,
    `合計: ${total}円`,
  ].join("\n");

  return Buffer.from(content, "utf-8");
}

function buildHourlyReceiptBuffer(params: {
  parkingName: string;
  useDate: string;
  slot: string;
  plate: string;
  subtotal: number;
  tax: number;
  total: number;
  receiptNo: string;
}) {
  const { parkingName, useDate, slot, plate, subtotal, tax, total, receiptNo } =
    params;

  const content = [
    "領収書",
    `Receipt No: ${receiptNo}`,
    `発行者: ${ISSUER_NAME}`,
    `登録番号: ${ISSUER_INVOICE_NO}`,
    "",
    `駐車場: ${parkingName}`,
    `利用日: ${useDate}`,
    `区画: ${slot}`,
    `ナンバー: ${plate}`,
    "",
    `小計: ${subtotal}円`,
    `消費税(10%): ${tax}円`,
    `合計: ${total}円`,
  ].join("\n");

  return Buffer.from(content, "utf-8");
}

export async function POST(req: Request) {
  const signature = req.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!signature || !webhookSecret) {
    return new NextResponse("Webhook secret or signature missing", {
      status: 400,
    });
  }

  let event: Stripe.Event;

  try {
    const body = await req.text();
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err: any) {
    return new NextResponse(`Webhook Error: ${err.message}`, { status: 400 });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;

      if (session.metadata?.flow === "reservation") {
        const placeId = String(session.metadata.placeId ?? "").trim();
        const spotId = String(session.metadata.spotId ?? "").trim();
        const slot = String(session.metadata.slot ?? "").trim();
        const date = String(session.metadata.date ?? "").trim();

        const name =
          String(session.metadata.name ?? "").trim() ||
          session.customer_details?.name ||
          "ゲスト";

        const plate = String(session.metadata.plate ?? "").trim() || "未登録";

        console.log("DEBUG reservation session.metadata:", session.metadata);
        console.log("DEBUG reservation customer_details:", session.customer_details);
        console.log("DEBUG reservation name:", name);
        console.log("DEBUG reservation plate:", plate);

        const email =
          session.metadata.email ??
          session.customer_details?.email ??
          session.customer_email ??
          null;

        const paymentRef = session.id;
        const paymentIntentId =
          typeof session.payment_intent === "string"
            ? session.payment_intent
            : null;

        const metadataPrice = Number(session.metadata.price ?? "");
        const price =
          Number.isFinite(metadataPrice) && metadataPrice > 0
            ? metadataPrice
            : session.amount_total ?? 0;

        const existingByPayment = await prisma.reservation.findFirst({
          where: { paymentRef },
          select: { id: true },
        });

        let reservationId: string;
        let reservationPin: string;
        let placeNameForReceipt = placeId;
        let slotLabelForReceipt = slot;
        let googleMapUrlForMail: string | null = null;

        const appUrl = (
          process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
        ).trim();

        if (existingByPayment) {
          reservationId = existingByPayment.id;

          const existingReservation = await prisma.reservation.findUnique({
            where: { id: existingByPayment.id },
            select: {
              id: true,
              pin: true,
              cancelToken: true,
            },
          });

          reservationPin = existingReservation?.pin ?? "0000";

          const [place, spot] = await Promise.all([
            placeId
              ? prisma.place.findUnique({
                  where: { id: placeId },
                  select: {
                    name: true,
                    googleMapUrl: true,
                  },
                })
              : Promise.resolve(null),
            spotId
              ? prisma.spot.findUnique({
                  where: { id: spotId },
                  select: {
                    code: true,
                    label: true,
                  },
                })
              : Promise.resolve(null),
          ]);

          placeNameForReceipt = place?.name ?? placeId;
          googleMapUrlForMail = place?.googleMapUrl ?? null;
          slotLabelForReceipt = spot?.label ?? spot?.code ?? slot;

          if (email) {
            try {
              const manageUrl = existingReservation?.cancelToken
                ? `${appUrl}/reservation/manage?token=${encodeURIComponent(
                    existingReservation.cancelToken
                  )}`
                : null;

              await sendReservationPinMail({
                to: email,
                placeName: place?.name ?? placeId,
                spotLabel: spot?.label ?? spot?.code ?? slot,
                date,
                slot,
                plate,
                price,
                pin: reservationPin,
                googleMapUrl: place?.googleMapUrl ?? null,
                manageUrl,
              });
            } catch (mailErr) {
              console.error("Reservation mail resend error detail:", mailErr);
            }
          }
        } else {
          const reservation = await prisma.reservation.create({
            data: {
              placeId,
              spotId,
              date,
              slot,
              name,
              plate,
              email,
              price,
              pin: genPin4(),
              paid: true,
              paidAt: new Date(),
              paymentRef,
              status: "CONFIRMED",
              cancelToken: crypto.randomUUID(),
              refundStatus: "NONE",
              refundAmount: null,
            },
          });

          reservationId = reservation.id;
          reservationPin = reservation.pin;

          const place = placeId
            ? await prisma.place.findUnique({
                where: { id: placeId },
                select: {
                  name: true,
                  googleMapUrl: true,
                },
              })
            : null;

          const spotForMail = spotId
            ? await prisma.spot.findUnique({
                where: { id: spotId },
                select: {
                  code: true,
                  label: true,
                },
              })
            : null;

          placeNameForReceipt = place?.name ?? placeId;
          googleMapUrlForMail = place?.googleMapUrl ?? null;
          slotLabelForReceipt = spotForMail?.label ?? spotForMail?.code ?? slot;

          if (email) {
            try {
              const manageUrl = reservation.cancelToken
                ? `${appUrl}/reservation/manage?token=${encodeURIComponent(
                    reservation.cancelToken
                  )}`
                : null;

              await sendReservationPinMail({
                to: email,
                placeName: place?.name ?? placeId,
                spotLabel: spotForMail?.label ?? spotForMail?.code ?? slot,
                date,
                slot,
                plate,
                price,
                pin: reservation.pin,
                googleMapUrl: place?.googleMapUrl ?? null,
                manageUrl,
              });
            } catch (mailErr) {
              console.error("Reservation mail send error detail:", mailErr);
            }
          }
        }

        const hasPayment = await paymentExists({
          paymentRef,
          paymentIntentId,
          reservationId,
        });

        if (!hasPayment) {
          try {
            const snapshot = await buildSettlementSnapshot({
              placeId,
              spotId: spotId || null,
              baseDate: toJstDateStart(date),
            });

            const recognizedDate = toJstDateStart(date);
            const recognizedMonth = getRecognizedMonthFromYmd(date);

            const { ownerAmount, agentAmount, platformAmount } = calcSplitAmounts(
              price,
              snapshot.ownerRateBps,
              snapshot.agentRateBps,
              snapshot.platformRateBps
            );

            await prisma.payment.create({
              data: {
                id: crypto.randomUUID(),
                updatedAt: new Date(),
                kind: "RESERVATION",
                status: "CONFIRMED",
                settlementLock: "UNLOCKED",

                reservationId,
                parkingSessionId: null,

                paymentRef,
                paymentIntentId,
                checkoutSessionId: session.id,
                stripeChargeId: null,

                placeId: snapshot.placeId,
                spotId: snapshot.spotId,
                ownerId: snapshot.ownerId,
                agentId: snapshot.agentId,

                placeNameSnapshot: snapshot.placeNameSnapshot,
                spotCodeSnapshot: snapshot.spotCodeSnapshot,
                spotLabelSnapshot: snapshot.spotLabelSnapshot,

                ownerNameSnapshot: snapshot.ownerNameSnapshot,
                agentNameSnapshot: snapshot.agentNameSnapshot,

                recognizedDate,
                recognizedMonth,
                serviceDate: date,
                eventDate: null,
                checkedOutAt: null,

                customerNameSnapshot: name,
                plateSnapshot: plate,

                currency: "JPY",
                grossAmount: price,

                ownerRateBps: snapshot.ownerRateBps,
                agentRateBps: snapshot.agentRateBps,
                platformRateBps: snapshot.platformRateBps,

                ownerAmount,
                agentAmount,
                platformAmount,

                stripeFeeAmount: 0,
                connectFeeAmount: 0,
                payoutFeeAmount: 0,

                freeOfCharge: false,
                manualAdjustment: false,
                refunded: false,
                dispute: false,
                excludedFromSettlement: false,

                adjustmentReason: null,
                memo: null,

                confirmedAt: new Date(),
              },
            });
          } catch (paymentErr) {
            console.error("Payment/settlement creation skipped:", paymentErr);
          }
        }

        const hasReceipt = await receiptExists(paymentRef, paymentIntentId);

        if (!hasReceipt) {
          try {
            const { subtotal, tax, total, taxRate } = calcTax(price);
            const receiptNo = buildReceiptNo("R");

            const pdfBuffer = buildReservationReceiptBuffer({
              receiptNo,
              parkingName: placeNameForReceipt,
              useDate: date,
              slot: slotLabelForReceipt,
              customerName: name,
              plate,
              subtotal,
              tax,
              total,
            });

            const filePath = await uploadReceiptPdf(
              pdfBuffer,
              `receipt_${reservationId}_v1.pdf`
            );

            await prisma.receipt.create({
              data: {
                receiptNo,
                reservationId,
                paymentRef,
                paymentIntentId,
                issuedAt: new Date(),
                useDate: date,
                parkingName: placeNameForReceipt,
                slot: slotLabelForReceipt,
                customerName: name,
                plate,
                subtotal,
                tax,
                total,
                taxRate,
                issuerName: ISSUER_NAME,
                issuerInvoiceNo: ISSUER_INVOICE_NO,
                invoiceStatus: "issued",
                receiptRequested: false,
                pdfPath: filePath,
                version: 1,
              },
            });
          } catch (receiptErr) {
            console.error("Receipt creation skipped:", receiptErr);
          }
        }

        return NextResponse.json({
          received: true,
          reservationId,
          pin: reservationPin,
          paymentSaved: !hasPayment,
          receiptSaved: !hasReceipt,
          googleMapUrl: googleMapUrlForMail,
        });
      }

      if (session.metadata?.flow === "bus_reservation") {
        const placeId = String(session.metadata.placeId ?? "").trim();
        const spotId = String(session.metadata.spotId ?? "").trim();
        const slot = String(session.metadata.slot ?? "").trim();
        const date = String(session.metadata.date ?? "").trim();

        const contactName =
          String(session.metadata.contactName ?? "").trim() ||
          String(session.metadata.name ?? "").trim() ||
          session.customer_details?.name ||
          "ゲスト";

        const companyName = String(session.metadata.companyName ?? "").trim();
        const phone = String(session.metadata.phone ?? "").trim();
        const arrivalTime = String(session.metadata.arrivalTime ?? "").trim();
        const note = String(session.metadata.note ?? "").trim();

        const reservationName = companyName
          ? `${companyName} / ${contactName}`
          : contactName;

        const plate = String(session.metadata.plate ?? "").trim() || "未登録";

        const email =
          session.metadata.email ??
          session.customer_details?.email ??
          session.customer_email ??
          null;

        const paymentRef = session.id;
        const paymentIntentId =
          typeof session.payment_intent === "string"
            ? session.payment_intent
            : null;

        const metadataPrice = Number(session.metadata.price ?? "");
        const price =
          Number.isFinite(metadataPrice) && metadataPrice > 0
            ? metadataPrice
            : session.amount_total ?? 0;

        const existingByPayment = await prisma.reservation.findFirst({
          where: { paymentRef },
          select: { id: true },
        });

        let reservationId: string;
        let reservationPin: string;
        let placeNameForReceipt = placeId;
        let slotLabelForReceipt = slot;
        let googleMapUrlForMail: string | null = null;

        const appUrl = (
          process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
        ).trim();

        if (existingByPayment) {
          reservationId = existingByPayment.id;

          const existingReservation = await prisma.reservation.findUnique({
            where: { id: existingByPayment.id },
            select: {
              id: true,
              pin: true,
              cancelToken: true,
            },
          });

          reservationPin = existingReservation?.pin ?? "0000";

          const [place, spot] = await Promise.all([
            placeId
              ? prisma.place.findUnique({
                  where: { id: placeId },
                  select: {
                    name: true,
                    googleMapUrl: true,
                  },
                })
              : Promise.resolve(null),
            spotId
              ? prisma.spot.findUnique({
                  where: { id: spotId },
                  select: {
                    code: true,
                    label: true,
                  },
                })
              : Promise.resolve(null),
          ]);

          placeNameForReceipt = place?.name ?? placeId;
          googleMapUrlForMail = place?.googleMapUrl ?? null;
          slotLabelForReceipt = spot?.label ?? spot?.code ?? slot;

          if (email) {
            try {
              const manageUrl = existingReservation?.cancelToken
                ? `${appUrl}/reservation/manage?token=${encodeURIComponent(
                    existingReservation.cancelToken
                  )}`
                : null;

              await sendReservationPinMail({
                to: email,
                placeName: place?.name ?? placeId,
                spotLabel: spot?.label ?? spot?.code ?? slot,
                date,
                slot,
                plate,
                price,
                pin: reservationPin,
                googleMapUrl: place?.googleMapUrl ?? null,
                manageUrl,
              });
            } catch (mailErr) {
              console.error("Bus reservation mail resend error detail:", mailErr);
            }
          }
        } else {
          const reservation = await prisma.reservation.create({
            data: {
              placeId,
              spotId,
              date,
              slot,
              name: reservationName,
              plate,
              email,
              price,
              pin: genPin4(),
              paid: true,
              paidAt: new Date(),
              paymentRef,
              status: "CONFIRMED",
              cancelToken: crypto.randomUUID(),
              refundStatus: "NONE",
              refundAmount: null,
            },
          });

          reservationId = reservation.id;
          reservationPin = reservation.pin;

          const place = placeId
            ? await prisma.place.findUnique({
                where: { id: placeId },
                select: {
                  name: true,
                  googleMapUrl: true,
                },
              })
            : null;

          const spotForMail = spotId
            ? await prisma.spot.findUnique({
                where: { id: spotId },
                select: {
                  code: true,
                  label: true,
                },
              })
            : null;

          placeNameForReceipt = place?.name ?? placeId;
          googleMapUrlForMail = place?.googleMapUrl ?? null;
          slotLabelForReceipt = spotForMail?.label ?? spotForMail?.code ?? slot;

          if (email) {
            try {
              const manageUrl = reservation.cancelToken
                ? `${appUrl}/reservation/manage?token=${encodeURIComponent(
                    reservation.cancelToken
                  )}`
                : null;

              await sendReservationPinMail({
                to: email,
                placeName: place?.name ?? placeId,
                spotLabel: spotForMail?.label ?? spotForMail?.code ?? slot,
                date,
                slot,
                plate,
                price,
                pin: reservation.pin,
                googleMapUrl: place?.googleMapUrl ?? null,
                manageUrl,
              });
            } catch (mailErr) {
              console.error("Bus reservation mail send error detail:", mailErr);
            }
          }
        }

        const hasPayment = await paymentExists({
          paymentRef,
          paymentIntentId,
          reservationId,
        });

        if (!hasPayment) {
          try {
            const snapshot = await buildSettlementSnapshot({
              placeId,
              spotId: spotId || null,
              baseDate: toJstDateStart(date),
            });

            const recognizedDate = toJstDateStart(date);
            const recognizedMonth = getRecognizedMonthFromYmd(date);

            const { ownerAmount, agentAmount, platformAmount } = calcSplitAmounts(
              price,
              snapshot.ownerRateBps,
              snapshot.agentRateBps,
              snapshot.platformRateBps
            );

            const busMemo = [
              "BUS_RESERVATION",
              companyName ? `companyName=${companyName}` : null,
              contactName ? `contactName=${contactName}` : null,
              phone ? `phone=${phone}` : null,
              arrivalTime ? `arrivalTime=${arrivalTime}` : null,
              note ? `note=${note}` : null,
            ]
              .filter(Boolean)
              .join("\n");

            await prisma.payment.create({
              data: {
                id: crypto.randomUUID(),
                updatedAt: new Date(),
                kind: "RESERVATION",
                status: "CONFIRMED",
                settlementLock: "UNLOCKED",

                reservationId,
                parkingSessionId: null,

                paymentRef,
                paymentIntentId,
                checkoutSessionId: session.id,
                stripeChargeId: null,

                placeId: snapshot.placeId,
                spotId: snapshot.spotId,
                ownerId: snapshot.ownerId,
                agentId: snapshot.agentId,

                placeNameSnapshot: snapshot.placeNameSnapshot,
                spotCodeSnapshot: snapshot.spotCodeSnapshot,
                spotLabelSnapshot: snapshot.spotLabelSnapshot,

                ownerNameSnapshot: snapshot.ownerNameSnapshot,
                agentNameSnapshot: snapshot.agentNameSnapshot,

                recognizedDate,
                recognizedMonth,
                serviceDate: date,
                eventDate: null,
                checkedOutAt: null,

                customerNameSnapshot: reservationName,
                plateSnapshot: plate,

                currency: "JPY",
                grossAmount: price,

                ownerRateBps: snapshot.ownerRateBps,
                agentRateBps: snapshot.agentRateBps,
                platformRateBps: snapshot.platformRateBps,

                ownerAmount,
                agentAmount,
                platformAmount,

                stripeFeeAmount: 0,
                connectFeeAmount: 0,
                payoutFeeAmount: 0,

                freeOfCharge: false,
                manualAdjustment: false,
                refunded: false,
                dispute: false,
                excludedFromSettlement: false,

                adjustmentReason: null,
                memo: busMemo || null,

                confirmedAt: new Date(),
              },
            });
          } catch (paymentErr) {
            console.error("Bus payment/settlement creation skipped:", paymentErr);
          }
        }

        const hasReceipt = await receiptExists(paymentRef, paymentIntentId);

        if (!hasReceipt) {
          try {
            const { subtotal, tax, total, taxRate } = calcTax(price);
            const receiptNo = buildReceiptNo("R");

            const pdfBuffer = buildReservationReceiptBuffer({
              receiptNo,
              parkingName: placeNameForReceipt,
              useDate: date,
              slot: slotLabelForReceipt,
              customerName: reservationName,
              plate,
              subtotal,
              tax,
              total,
            });

            const filePath = await uploadReceiptPdf(
              pdfBuffer,
              `receipt_${reservationId}_v1.pdf`
            );

            await prisma.receipt.create({
              data: {
                receiptNo,
                reservationId,
                paymentRef,
                paymentIntentId,
                issuedAt: new Date(),
                useDate: date,
                parkingName: placeNameForReceipt,
                slot: slotLabelForReceipt,
                customerName: reservationName,
                plate,
                subtotal,
                tax,
                total,
                taxRate,
                issuerName: ISSUER_NAME,
                issuerInvoiceNo: ISSUER_INVOICE_NO,
                invoiceStatus: "issued",
                receiptRequested: false,
                pdfPath: filePath,
                version: 1,
              },
            });
          } catch (receiptErr) {
            console.error("Bus receipt creation skipped:", receiptErr);
          }
        }

        return NextResponse.json({
          received: true,
          reservationId,
          pin: reservationPin,
          paymentSaved: !hasPayment,
          receiptSaved: !hasReceipt,
          googleMapUrl: googleMapUrlForMail,
        });
      }

      if (session.metadata?.flow === "hourly_checkout") {
        const parkingSessionId = String(
          session.metadata.parkingSessionId ?? ""
        ).trim();
        const placeId = String(session.metadata.placeId ?? "").trim();
        const spotId = String(session.metadata.spotId ?? "").trim();
        const checkoutDate = String(session.metadata.date ?? "").trim();

        const paymentIntentId =
          typeof session.payment_intent === "string"
            ? session.payment_intent
            : null;

        const paymentRef = paymentIntentId ?? session.id;

        const current = await prisma.parkingSession.findUnique({
          where: { id: parkingSessionId },
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

        if (!current) {
          return new NextResponse("Parking session not found", { status: 404 });
        }

        if (current.paid) {
          return NextResponse.json({
            received: true,
            parkingSessionId: current.id,
            alreadyPaid: true,
          });
        }

        const now = new Date();

        const metadataTotalMinutes = Number(session.metadata.totalMinutes ?? "");
        const metadataTotalYen = Number(session.metadata.totalYen ?? "");

        const totalMinutes =
          Number.isFinite(metadataTotalMinutes) && metadataTotalMinutes > 0
            ? metadataTotalMinutes
            : Math.max(
                1,
                Math.ceil((now.getTime() - current.checkInAt.getTime()) / 60000)
              );

        const totalYen =
          Number.isFinite(metadataTotalYen) && metadataTotalYen > 0
            ? metadataTotalYen
            : session.amount_total ?? current.totalYen ?? 0;

        const updated = await prisma.parkingSession.update({
          where: { id: parkingSessionId },
          data: {
            paid: true,
            paidAt: now,
            paymentRef,
            status: "OUT",
            checkOutAt: now,
            totalMinutes,
            totalYen,
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

        const email =
          session.metadata.email ??
          session.customer_details?.email ??
          session.customer_email ??
          null;

        if (email) {
          try {
            await sendCheckoutThanksMail({
              to: email,
              placeName: updated.place?.name ?? placeId,
              spotLabel: updated.spot?.label ?? updated.spot?.code ?? spotId,
              useDate: formatYmdJst(updated.checkInAt),
              checkIn: formatJst(updated.checkInAt),
              checkOut: formatJst(updated.checkOutAt ?? now),
              minutes: updated.totalMinutes ?? 0,
              totalYen: updated.totalYen ?? 0,
              paymentRef,
              flowLabel: "時間貸し",
            });

            console.log("Checkout thanks mail sent:", updated.id);
          } catch (mailErr) {
            console.error("Checkout mail send error:", mailErr);
          }
        }

        const hasPayment = await paymentExists({
          paymentRef,
          paymentIntentId,
          parkingSessionId: updated.id,
        });

        if (!hasPayment) {
          const snapshot = await buildSettlementSnapshot({
            placeId: updated.placeId,
            spotId: updated.spotId,
            baseDate: updated.checkInAt,
          });

          const recognizedDate = updated.checkOutAt ?? now;
          const recognizedMonth = getRecognizedMonthFromDate(recognizedDate);
          const grossAmount = updated.totalYen ?? session.amount_total ?? 0;

          const { ownerAmount, agentAmount, platformAmount } = calcSplitAmounts(
            grossAmount,
            snapshot.ownerRateBps,
            snapshot.agentRateBps,
            snapshot.platformRateBps
          );

          await prisma.payment.create({
            data: {
              id: crypto.randomUUID(),
              updatedAt: new Date(),
              kind: "HOURLY",
              status: "CONFIRMED",
              settlementLock: "UNLOCKED",

              reservationId: updated.reservationId ?? null,
              parkingSessionId: updated.id,

              paymentRef,
              paymentIntentId,
              checkoutSessionId: session.id,
              stripeChargeId: null,

              placeId: snapshot.placeId,
              spotId: snapshot.spotId,
              ownerId: snapshot.ownerId,
              agentId: snapshot.agentId,

              placeNameSnapshot: snapshot.placeNameSnapshot,
              spotCodeSnapshot: snapshot.spotCodeSnapshot,
              spotLabelSnapshot: snapshot.spotLabelSnapshot,

              ownerNameSnapshot: snapshot.ownerNameSnapshot,
              agentNameSnapshot: snapshot.agentNameSnapshot,

              recognizedDate,
              recognizedMonth,
              serviceDate: null,
              eventDate: null,
              checkedOutAt: updated.checkOutAt ?? now,

              customerNameSnapshot: updated.customerName ?? null,
              plateSnapshot: updated.plate ?? "未登録",

              currency: "JPY",
              grossAmount,

              ownerRateBps: snapshot.ownerRateBps,
              agentRateBps: snapshot.agentRateBps,
              platformRateBps: snapshot.platformRateBps,

              ownerAmount,
              agentAmount,
              platformAmount,

              stripeFeeAmount: 0,
              connectFeeAmount: 0,
              payoutFeeAmount: 0,

              freeOfCharge: false,
              manualAdjustment: false,
              refunded: false,
              dispute: false,
              excludedFromSettlement: false,

              adjustmentReason: null,
              memo: null,

              confirmedAt: new Date(),
            },
          });
        }

        const hasReceipt = await receiptExists(paymentRef, paymentIntentId);

        if (!hasReceipt) {
          const total = updated.totalYen ?? session.amount_total ?? 0;
          const { subtotal, tax, taxRate } = calcTax(total);
          const receiptNo = buildReceiptNo("H");
          const useDate = checkoutDate || formatYmdJst(updated.checkInAt);

          const pdfBuffer = buildHourlyReceiptBuffer({
            receiptNo,
            parkingName: updated.place?.name ?? placeId,
            useDate,
            slot: updated.spot?.label ?? updated.spot?.code ?? spotId,
            plate: updated.plate ?? "未登録",
            subtotal,
            tax,
            total,
          });

          const filePath = await uploadReceiptPdf(
            pdfBuffer,
            `receipt_hourly_${updated.id}_v1.pdf`
          );

          await prisma.receipt.create({
            data: {
              receiptNo,
              reservationId: updated.reservationId ?? null,
              paymentRef,
              paymentIntentId,
              issuedAt: new Date(),
              useDate,
              parkingName: updated.place?.name ?? placeId,
              slot: updated.spot?.label ?? updated.spot?.code ?? spotId,
              customerName: updated.customerName ?? null,
              plate: updated.plate ?? "未登録",
              subtotal,
              tax,
              total,
              taxRate,
              issuerName: ISSUER_NAME,
              issuerInvoiceNo: ISSUER_INVOICE_NO,
              invoiceStatus: "issued",
              receiptRequested: false,
              pdfPath: filePath,
              version: 1,
            },
          });
        }

        return NextResponse.json({
          received: true,
          parkingSessionId: updated.id,
          paymentSaved: !hasPayment,
          receiptSaved: !hasReceipt,
        });
      }
    }

    return NextResponse.json({ received: true });
  } catch (e: any) {
    console.error("Webhook handler failed:", e);
    return new NextResponse(`Webhook handler failed: ${e.message}`, {
      status: 500,
    });
  }
}