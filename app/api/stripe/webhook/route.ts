import { NextResponse } from "next/server";
import Stripe from "stripe";
import { prisma } from "@/lib/db";
import { stripe } from "@/lib/stripe";
import { sendReservationPinMail, sendCheckoutThanksMail, sendMonthlyContractActivatedMail } from "@/lib/mail";
import bcrypt from "bcryptjs";
import { calcSplitAmounts, calcTax } from "@/lib/settlement-math";
import { buildSettlementSnapshot } from "@/lib/settlement-snapshot";
import { sendSlackNotification } from "@/lib/slack";
import crypto from "crypto";

export const runtime = "nodejs";

const ISSUER_NAME =
  process.env.ISSUER_NAME || "パークテックイーストジャパン";
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
        const phone = String(session.metadata.phone ?? "").trim() || null;

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
                phone,
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
              phone,
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
                phone,
                price,
                pin: reservation.pin,
                googleMapUrl: place?.googleMapUrl ?? null,
                manageUrl,
              });
            } catch (mailErr) {
              console.error("Reservation mail send error detail:", mailErr);
            }
          }

          await sendSlackNotification(
            [
              "🅿️ 新規予約",
              `駐車場：${placeNameForReceipt}`,
              `スポット：${slotLabelForReceipt}`,
              `利用日：${date}`,
              `顧客：${name}`,
              `金額：¥${price.toLocaleString("ja-JP")}`,
            ].join("\n")
          );
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
            console.error("Payment creation failed:", paymentErr);
            await sendSlackNotification(
              [
                "🔴 [CRITICAL] Payment作成失敗",
                `reservationId: ${reservationId}`,
                `error: ${paymentErr instanceof Error ? paymentErr.message : String(paymentErr)}`,
                "Stripe webhook will retry",
              ].join("\n")
            ).catch(() => {});
            throw paymentErr;
          }
        }

        const hasReceipt = await receiptExists(paymentRef, paymentIntentId);

        if (!hasReceipt) {
          try {
            const { subtotal, tax, total, taxRate } = calcTax(price);
            const receiptNo = buildReceiptNo("R");

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

      if (session.metadata?.flow === "monthly_contract") {
        const contractId = String(session.metadata.contractId ?? "").trim();
        if (contractId) {
          const contract = await prisma.monthlyContract.findUnique({
            where: { id: contractId },
            include: { tenant: true, place: true },
          });

          if (contract && contract.status !== "ACTIVE" && contract.status !== "CANCELED") {
            const todayJst = new Date().toLocaleDateString("sv-SE", {
              timeZone: "Asia/Tokyo",
            });
            let endDate: string | null = null;
            if (contract.billingTerm !== "MONTHLY") {
              const d = new Date(`${todayJst}T00:00:00+09:00`);
              d.setMonth(d.getMonth() + contract.prepaidMonths);
              endDate = d.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
            }

            let tempPassword: string | null = null;
            if (!contract.tenant.passwordHash) {
              tempPassword = crypto.randomBytes(6).toString("base64url");
              const passwordHash = await bcrypt.hash(tempPassword, 10);
              await prisma.tenant.update({
                where: { id: contract.tenantId },
                data: { passwordHash },
              });
            }

            await prisma.monthlyContract.update({
              where: { id: contract.id },
              data: {
                status: "ACTIVE",
                startDate: todayJst,
                endDate,
                stripeSubscriptionId:
                  typeof session.subscription === "string" ? session.subscription : null,
                stripePaymentIntentId:
                  typeof session.payment_intent === "string" ? session.payment_intent : null,
              },
            });

            try {
              await sendMonthlyContractActivatedMail({
                to: contract.tenant.email,
                name: contract.tenant.name,
                placeName: contract.place.name,
                loginUrl: `${(process.env.NEXT_PUBLIC_APP_URL || "").trim()}/tenant/login`,
                tempPassword: tempPassword ?? "（既存のパスワードをご利用ください）",
                startDate: todayJst,
                endDate,
              });
            } catch (e) {
              console.error("monthly activated mail failed:", e);
            }

            try {
              await sendSlackNotification(
                `🏠✅ 月極契約成立: ${contract.tenant.name} 様 / ${contract.place.name} / ${contract.billingTerm}`
              );
            } catch {}
          }
        }

        return NextResponse.json({ received: true });
      }

      if (session.metadata?.flow === "bus_reservation") {
        const placeId = String(session.metadata.placeId ?? "").trim();
        // A-20 使用時のみ spotId が入る。BUS_LANE のときは null。
        const spotId = String(session.metadata.spotId ?? "").trim() || null;
        const slot = String(session.metadata.slot ?? "").trim() || "BUS_LANE";
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

        // 構造化カラム用（新仕様）
        const eventName = String(session.metadata.eventName ?? "").trim();
        const vehicleType: "bus" | "car" =
          session.metadata.vehicleType === "car" ? "car" : "bus";
        const hasExtraCar = session.metadata.hasExtraCar === "true";
        const busPartnerId =
          String(session.metadata.busPartnerId ?? "").trim() || null;

        const reservationName = companyName
          ? `${companyName} / ${contactName}`
          : contactName;

        // バス予約では車両ナンバーを取らないため固定値
        const plate = "未登録";

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
              // 構造化カラム（新仕様。memo は後方互換の補助情報として残す）
              reservationType: "bus",
              busPartnerId,
              vehicleType,
              hasExtraCar,
              eventName: eventName || null,
              arrivalTime: arrivalTime || null,
              note: note || null,
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

          await sendSlackNotification(
            [
              "🚌 新規バス予約",
              `駐車場：${placeNameForReceipt}`,
              `利用日：${date}`,
              eventName ? `イベント：${eventName}` : null,
              `予約名：${reservationName}`,
              arrivalTime ? `到着予定：${arrivalTime}` : null,
              `車種：${vehicleType === "bus" ? "バス" : "普通車"}${
                hasExtraCar ? "（+普通車1台）" : ""
              }`,
              `金額：¥${price.toLocaleString("ja-JP")}`,
            ]
              .filter(Boolean)
              .join("\n")
          );
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
                // spotId が無い BUS_LANE 予約でも区別できるよう slot を補完
                spotCodeSnapshot: snapshot.spotCodeSnapshot ?? slot,
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
            console.error("Bus payment creation failed:", paymentErr);
            await sendSlackNotification(
              [
                "🔴 [CRITICAL] Bus Payment作成失敗",
                `reservationId: ${reservationId}`,
                `error: ${paymentErr instanceof Error ? paymentErr.message : String(paymentErr)}`,
                "Stripe webhook will retry",
              ].join("\n")
            ).catch(() => {});
            throw paymentErr;
          }
        }

        const hasReceipt = await receiptExists(paymentRef, paymentIntentId);

        if (!hasReceipt) {
          try {
            const { subtotal, tax, total, taxRate } = calcTax(price);
            const receiptNo = buildReceiptNo("R");

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
          try {
            const total = updated.totalYen ?? session.amount_total ?? 0;
            const { subtotal, tax, taxRate } = calcTax(total);
            const receiptNo = buildReceiptNo("H");
            const useDate = checkoutDate || formatYmdJst(updated.checkInAt);

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
                version: 1,
              },
            });
          } catch (receiptErr) {
            console.error("Hourly receipt creation skipped:", receiptErr);
          }
        }

        return NextResponse.json({
          received: true,
          parkingSessionId: updated.id,
          paymentSaved: !hasPayment,
          receiptSaved: !hasReceipt,
        });
      }
    }

    // ===== 月極サブスク: 毎月の課金成功 → 領収書レコード作成（方法B） =====
    if (event.type === "invoice.payment_succeeded") {
      const invoice = event.data.object as Stripe.Invoice;
      const inv = invoice as any;
      const billingReason = inv.billing_reason as string | undefined;

      // 初回(subscription_create)・継続(subscription_cycle)のみ対象
      if (
        billingReason === "subscription_create" ||
        billingReason === "subscription_cycle"
      ) {
        const invoiceId: string | null = invoice.id ?? null;

        // 冪等性: stripeInvoiceId で既に作成済みならスキップ
        const dup = invoiceId
          ? await prisma.monthlySubscriptionPayment.findUnique({
              where: { stripeInvoiceId: invoiceId },
            })
          : null;

        if (!dup) {
          // subscription metadata から contractId を解決
          const subId =
            typeof inv.subscription === "string"
              ? inv.subscription
              : inv.subscription?.id ?? null;
          let contractId = "";
          if (subId) {
            try {
              const sub = await stripe.subscriptions.retrieve(subId);
              contractId = (sub.metadata?.contractId as string) ?? "";
            } catch (e) {
              console.error("subscription retrieve failed:", e);
            }
          }
          if (!contractId && inv.subscription_details?.metadata?.contractId) {
            contractId = inv.subscription_details.metadata.contractId;
          }

          const contract = contractId
            ? await prisma.monthlyContract.findUnique({
                where: { id: contractId },
                include: { tenant: true },
              })
            : null;

          if (contract) {
            const periodStartUnix =
              inv.lines?.data?.[0]?.period?.start ?? inv.period_start ?? null;
            const periodDate = periodStartUnix
              ? new Date(periodStartUnix * 1000)
              : new Date();
            const billingPeriod = getRecognizedMonthFromDate(periodDate);

            const amountYen = inv.amount_paid ?? contract.baseFeeYen;
            const paidUnix = inv.status_transitions?.paid_at ?? null;
            const paidAt = paidUnix ? new Date(paidUnix * 1000) : new Date();
            const paymentIntentId =
              typeof inv.payment_intent === "string"
                ? inv.payment_intent
                : inv.payment_intent?.id ?? null;

            const year = paidAt
              .toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" })
              .slice(0, 4);

            // 領収書番号 PT-YYYY-NNNNNN を採番（unique制約で二重防止・衝突時リトライ）
            let created = false;
            for (let attempt = 0; attempt < 5 && !created; attempt++) {
              const count = await prisma.monthlySubscriptionPayment.count({
                where: { receiptNumber: { startsWith: `PT-${year}-` } },
              });
              const receiptNumber = `PT-${year}-${String(
                count + 1 + attempt
              ).padStart(6, "0")}`;
              try {
                await prisma.monthlySubscriptionPayment.create({
                  data: {
                    contractId: contract.id,
                    tenantId: contract.tenantId,
                    billingPeriod,
                    amountYen,
                    taxRate: 10,
                    receiptNumber,
                    stripeInvoiceId: invoiceId,
                    stripePaymentIntentId: paymentIntentId,
                    paidAt,
                  },
                });
                created = true;
              } catch (e: any) {
                if (e?.code === "P2002") {
                  // stripeInvoiceId 競合（別プロセスが作成済み）なら終了
                  const exists = invoiceId
                    ? await prisma.monthlySubscriptionPayment.findUnique({
                        where: { stripeInvoiceId: invoiceId },
                      })
                    : null;
                  if (exists) {
                    created = true;
                    break;
                  }
                  // receiptNumber 競合 → 次の attempt で再採番
                  continue;
                }
                throw e;
              }
            }

            // 継続課金成功で PAST_DUE から復帰
            if (contract.status === "PAST_DUE") {
              await prisma.monthlyContract.update({
                where: { id: contract.id },
                data: { status: "ACTIVE" },
              });
            }
          }
        }
      }

      return NextResponse.json({ received: true });
    }

    // ===== 月極サブスク: 支払い失敗 → PAST_DUE =====
    if (event.type === "invoice.payment_failed") {
      const invoice = event.data.object as Stripe.Invoice;
      const inv = invoice as any;
      const subId =
        typeof inv.subscription === "string"
          ? inv.subscription
          : inv.subscription?.id ?? null;
      let contractId = "";
      if (subId) {
        try {
          const sub = await stripe.subscriptions.retrieve(subId);
          contractId = (sub.metadata?.contractId as string) ?? "";
        } catch (e) {
          console.error("subscription retrieve failed:", e);
        }
      }
      const contract = contractId
        ? await prisma.monthlyContract.findUnique({
            where: { id: contractId },
            include: { tenant: true, place: true },
          })
        : null;
      if (contract && contract.status !== "CANCELED") {
        await prisma.monthlyContract.update({
          where: { id: contract.id },
          data: { status: "PAST_DUE" },
        });
        try {
          await sendSlackNotification(
            `⚠️ 月極支払い失敗: ${contract.tenant.name} 様 / ${contract.place.name} → PAST_DUE`
          );
        } catch {}
      }
      return NextResponse.json({ received: true });
    }

    // ===== 月極サブスク: Stripe側で解約 → CANCELED 同期（冪等） =====
    if (event.type === "customer.subscription.deleted") {
      const sub = event.data.object as Stripe.Subscription;
      const contractId = (sub.metadata?.contractId as string) ?? "";
      const contract = contractId
        ? await prisma.monthlyContract.findUnique({
            where: { id: contractId },
            include: { tenant: true, place: true },
          })
        : await prisma.monthlyContract.findFirst({
            where: { stripeSubscriptionId: sub.id },
            include: { tenant: true, place: true },
          });
      if (contract && contract.status !== "CANCELED") {
        await prisma.monthlyContract.update({
          where: { id: contract.id },
          data: { status: "CANCELED", canceledAt: new Date() },
        });
        try {
          await sendSlackNotification(
            `🛑 月極サブスク解約(Stripe同期): ${contract.tenant.name} 様 / ${contract.place.name}`
          );
        } catch {}
      }
      return NextResponse.json({ received: true });
    }

    return NextResponse.json({ received: true });
  } catch (e: any) {
    console.error("Webhook handler failed:", e);
    return new NextResponse(`Webhook handler failed: ${e.message}`, {
      status: 500,
    });
  }
}