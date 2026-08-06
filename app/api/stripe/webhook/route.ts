import { NextResponse } from "next/server";
import Stripe from "stripe";
import { prisma } from "@/lib/db";
import { stripe } from "@/lib/stripe";
import { sendReservationPinMail, sendCheckoutThanksMail, sendMonthlyContractActivatedMail, sendOfferApplicantUnavailableMail, sendDoubleBookingRefundMail } from "@/lib/mail";
import bcrypt from "bcryptjs";
import { calcSplitAmounts, calcTax } from "@/lib/settlement-math";
import { buildSettlementSnapshot } from "@/lib/settlement-snapshot";
import { fetchStripeFee } from "@/lib/stripe-fee";
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

        // 月極プラン2のイベント日予約(④-D)経由なら回答ログを RESERVED に更新
        const meResponseId = String(session.metadata.meResponseId ?? "").trim();
        if (meResponseId) {
          await prisma.monthlyEventResponse
            .update({
              where: { id: meResponseId },
              data: { status: "RESERVED", respondedAt: new Date() },
            })
            .catch(() => {});
        }

        // ③-2/③-3 承認待ちオファー経由の決済ガード（role別に期待状態を検証）。
        // applicant: RELEASED（申請者の決済）／tenant: TENANT_CHARGE_PENDING（月極の手動決済）。
        // 期待状態でない古いリンク決済は予約を作らず、要手動返金でSlack通知。
        const offerId = String(session.metadata.offerId ?? "").trim();
        const offerRole = String(session.metadata.offerRole ?? "applicant").trim();
        if (offerId) {
          const offer = await prisma.eventMonthlyOffer.findUnique({
            where: { id: offerId },
            select: { status: true },
          });
          const expectedStatus =
            offerRole === "tenant" ? "TENANT_CHARGE_PENDING" : "RELEASED";
          if (!offer || offer.status !== expectedStatus) {
            await sendSlackNotification(
              `⚠️【承認待ち】無効なオファー(${offerId}/${offerRole})への決済を検知。予約は作成していません。手動返金をご確認ください。`
            ).catch(() => {});
            return NextResponse.json({ received: true, skipped: "offer_state_mismatch" });
          }
        }

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
          let reservation: Awaited<ReturnType<typeof prisma.reservation.create>>;
          try {
            reservation = await prisma.reservation.create({
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
          } catch (e: any) {
            if (e?.code === "P2002") {
              // 同一枠(spotId,date)に別決済のCONFIRMEDが先に成立 → 二重予約の敗者。
              // 予約を作らず全額自動返金し、Slackで手動フォローを促す。
              let refundOk = false;
              if (paymentIntentId) {
                try {
                  await stripe.refunds.create({
                    payment_intent: paymentIntentId,
                    reason: "requested_by_customer",
                    metadata: { reason: "double_booking_guard", spotId, date, slot, name },
                  });
                  refundOk = true;
                } catch (refundErr) {
                  console.error("double-booking auto-refund failed:", refundErr);
                }
              }
              await sendSlackNotification(
                [
                  "⚠️【二重予約ブロック】同一枠に同時決済を検知",
                  `枠：${slot} / 利用日：${date}`,
                  `お客様：${name}（${email ?? "-"} / ${phone ?? "-"}）`,
                  `金額：¥${price.toLocaleString("ja-JP")}`,
                  `自動返金：${refundOk ? "成功" : "失敗→手動返金してください"}`,
                  `Stripe session：${paymentRef}`,
                  "※予約は作成していません。別枠振替が可能ならお客様へご連絡ください。",
                ].join("\n")
              ).catch(() => {});
              // 返金に成功した場合のみ、お客様へお詫び＋再予約案内メールを送る
              if (email && refundOk) {
                try {
                  await sendDoubleBookingRefundMail({
                    to: email,
                    name,
                    date,
                    slot,
                    refundAmount: price,
                    reserveUrl: appUrl,
                  });
                } catch (mailErr) {
                  console.error("double-booking refund mail failed:", mailErr);
                }
              }
              return NextResponse.json({ received: true, skipped: "double_booking_refunded" });
            }
            throw e;
          }

          reservationId = reservation.id;
          reservationPin = reservation.pin;

          // ③-2/③-3 承認待ちオファー経由の決済後処理（role別）
          if (offerId) {
            if (offerRole === "tenant") {
              // 月極の手動決済：TENANT_TOOK 確定＋申請者へ「利用不可」通知
              await prisma.eventMonthlyOffer
                .update({
                  where: { id: offerId },
                  data: { status: "TENANT_TOOK" },
                })
                .catch(() => {});
              try {
                const off = await prisma.eventMonthlyOffer.findUnique({
                  where: { id: offerId },
                  select: { applicantName: true, applicantEmail: true, date: true },
                });
                const pl = placeId
                  ? await prisma.place.findUnique({
                      where: { id: placeId },
                      select: { name: true },
                    })
                  : null;
                if (off?.applicantEmail) {
                  await sendOfferApplicantUnavailableMail({
                    to: off.applicantEmail,
                    name: off.applicantName ?? "",
                    placeName: pl?.name ?? "",
                    date: off.date,
                  });
                }
              } catch (e) {
                console.error("applicant unavailable mail failed:", e);
              }
            } else {
              // 申請者の決済：PAID＋申請者予約IDを記録
              await prisma.eventMonthlyOffer
                .update({
                  where: { id: offerId },
                  data: { status: "PAID", applicantReservationId: reservation.id },
                })
                .catch(() => {});
            }
          }

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

            const feeInfo = await fetchStripeFee(paymentIntentId);

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
                stripeChargeId: feeInfo.chargeId,

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

                stripeFeeAmount: feeInfo.fee,
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

            // ③ オフセッション課金のため Stripe customer を保存
            if (typeof session.customer === "string" && session.customer) {
              await prisma.tenant.update({
                where: { id: contract.tenantId },
                data: { stripeCustomerId: session.customer },
              });
            }

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

            const feeInfo = await fetchStripeFee(paymentIntentId);

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
                stripeChargeId: feeInfo.chargeId,

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

                stripeFeeAmount: feeInfo.fee,
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

      // ===== 時間貸し 事前決済：延長の確定 =====
      // 既存の IN セッションの scheduledEndAt を延ばし、prepaidYen を加算する。
      if (session.metadata?.flow === "hourly_extend") {
        const parkingSessionId = String(
          session.metadata.parkingSessionId ?? ""
        ).trim();

        if (!parkingSessionId) {
          console.error("[hourly_extend] parkingSessionId missing");
          return new NextResponse("parkingSessionId missing", { status: 400 });
        }

        const current = await prisma.parkingSession.findUnique({
          where: { id: parkingSessionId },
          select: {
            id: true,
            status: true,
            prepaidYen: true,
            scheduledEndAt: true,
          },
        });

        if (!current) {
          console.error("[hourly_extend] session not found:", parkingSessionId);
          await sendSlackNotification(
            `🚨【要対応】延長決済は成立したがセッションが存在しません\n` +
              `parkingSessionId=${parkingSessionId}`
          ).catch(() => {});
          return NextResponse.json({ received: true, sessionMissing: true });
        }

        const addYen = Number(session.metadata.totalYen ?? "");
        const addedYen =
          Number.isFinite(addYen) && addYen > 0
            ? addYen
            : session.amount_total ?? 0;

        const newEndRaw = String(
          session.metadata.newScheduledEndAt ?? ""
        ).trim();
        const newEnd = newEndRaw ? new Date(newEndRaw) : null;

        if (!newEnd || Number.isNaN(newEnd.getTime())) {
          console.error("[hourly_extend] invalid newScheduledEndAt");
          await sendSlackNotification(
            `🚨【要対応】延長決済は成立したが期限の再計算に失敗しました\n` +
              `parkingSessionId=${parkingSessionId}`
          ).catch(() => {});
          return NextResponse.json({ received: true, invalidEnd: true });
        }

        // 同じ決済が二重に届いた場合、期限が既に新しければ何もしない。
        if (
          current.scheduledEndAt &&
          current.scheduledEndAt.getTime() >= newEnd.getTime()
        ) {
          return NextResponse.json({
            received: true,
            parkingSessionId: current.id,
            alreadyExtended: true,
          });
        }

        await prisma.parkingSession.update({
          where: { id: parkingSessionId },
          data: {
            scheduledEndAt: newEnd,
            prepaidYen: (current.prepaidYen ?? 0) + addedYen,
          },
        });

        await sendSlackNotification(
          `⏱️ 時間貸し延長: ${session.metadata.slot ?? ""} / ` +
            `+${addedYen}円 / +${session.metadata.minutes ?? "?"}分`
        ).catch(() => {});

        return NextResponse.json({
          received: true,
          parkingSessionId: current.id,
          extended: true,
        });
      }

      // ===== 時間貸し 事前決済：PENDING → IN 確定 =====
      // hourly-prepaid/start が作った PENDING セッションを入庫成立させる。
      // Payment レコードの作成と入庫完了メールは、精算ロジック改修時に別途対応する。
      if (session.metadata?.flow === "hourly_prepaid") {
        const parkingSessionId = String(
          session.metadata.parkingSessionId ?? ""
        ).trim();

        if (!parkingSessionId) {
          console.error("[hourly_prepaid] parkingSessionId missing");
          return new NextResponse("parkingSessionId missing", { status: 400 });
        }

        const paymentIntentId =
          typeof session.payment_intent === "string"
            ? session.payment_intent
            : null;
        const paymentRef = paymentIntentId ?? session.id;

        const current = await prisma.parkingSession.findUnique({
          where: { id: parkingSessionId },
          select: {
            id: true,
            status: true,
            paid: true,
          },
        });

        if (!current) {
          // cron が既に削除している可能性がある（30分放置）。
          // その場合は決済だけ成立しているため、返金対応が必要。
          console.error(
            "[hourly_prepaid] session not found (cleaned up?):",
            parkingSessionId
          );
          await sendSlackNotification(
            `🚨【要対応】事前決済は成立したが入庫セッションが存在しません\n` +
              `parkingSessionId=${parkingSessionId}\n` +
              `paymentRef=${paymentRef}\n` +
              `返金または手動入庫の対応が必要です`
          ).catch(() => {});
          return NextResponse.json({ received: true, sessionMissing: true });
        }

        if (current.paid) {
          return NextResponse.json({
            received: true,
            parkingSessionId: current.id,
            alreadyPaid: true,
          });
        }

        const now = new Date();

        const email =
          session.metadata.email ??
          session.customer_details?.email ??
          session.customer_email ??
          null;

        const metadataTotalYen = Number(session.metadata.totalYen ?? "");
        const prepaidYen =
          Number.isFinite(metadataTotalYen) && metadataTotalYen > 0
            ? metadataTotalYen
            : session.amount_total ?? 0;

        // scheduledEndAt は start 側で計算済み。metadata から復元する。
        // 決済に時間がかかった場合でも、開始時刻基準の予定を維持する。
        const metadataEndAt = String(
          session.metadata.scheduledEndAt ?? ""
        ).trim();
        const scheduledEndAt = metadataEndAt ? new Date(metadataEndAt) : null;

        await prisma.parkingSession.update({
          where: { id: parkingSessionId },
          data: {
            status: "IN",
            checkInAt: now,
            paid: true,
            paidAt: now,
            paymentRef,
            prepaidYen,
            email,
            ...(scheduledEndAt && !Number.isNaN(scheduledEndAt.getTime())
              ? { scheduledEndAt }
              : {}),
          },
        });

        await sendSlackNotification(
          `🅿️ 時間貸し入庫（事前決済）: ${session.metadata.slot ?? ""} / ` +
            `${prepaidYen}円 / ${session.metadata.minutes ?? "?"}分`
        ).catch(() => {});

        return NextResponse.json({
          received: true,
          parkingSessionId: current.id,
          prepaidYen,
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

          const feeInfo = await fetchStripeFee(paymentIntentId);

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
              stripeChargeId: feeInfo.chargeId,

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

              stripeFeeAmount: feeInfo.fee,
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

            // 仕訳連携: Payment にも売上を記録（重複防止つき）
            const monthlyPaymentRef = invoiceId ? `invoice:${invoiceId}` : null;
            const hasMonthlyPayment = await paymentExists({
              paymentRef: monthlyPaymentRef,
              paymentIntentId,
            });

            if (!hasMonthlyPayment) {
              try {
                const snapshot = await buildSettlementSnapshot({
                  placeId: contract.placeId,
                  spotId: contract.spotId,
                  baseDate: paidAt,
                });

                const monthlyRecognizedDate = toJstDateStart(
                  `${billingPeriod}-01`
                );

                const { ownerAmount, agentAmount, platformAmount } =
                  calcSplitAmounts(
                    amountYen,
                    snapshot.ownerRateBps,
                    snapshot.agentRateBps,
                    snapshot.platformRateBps
                  );

                const feeInfo = await fetchStripeFee(paymentIntentId);

                await prisma.payment.create({
                  data: {
                    id: crypto.randomUUID(),
                    updatedAt: new Date(),
                    kind: "MONTHLY",
                    status: "CONFIRMED",
                    settlementLock: "UNLOCKED",

                    paymentRef: monthlyPaymentRef,
                    paymentIntentId,
                    stripeChargeId: feeInfo.chargeId,

                    placeId: snapshot.placeId,
                    spotId: snapshot.spotId,
                    ownerId: snapshot.ownerId,
                    agentId: snapshot.agentId,

                    placeNameSnapshot: snapshot.placeNameSnapshot,
                    spotCodeSnapshot: snapshot.spotCodeSnapshot,
                    spotLabelSnapshot: snapshot.spotLabelSnapshot,
                    ownerNameSnapshot: snapshot.ownerNameSnapshot,
                    agentNameSnapshot: snapshot.agentNameSnapshot,

                    recognizedDate: monthlyRecognizedDate,
                    recognizedMonth: billingPeriod,

                    customerNameSnapshot: contract.tenant.name,
                    plateSnapshot: contract.plate,

                    currency: "JPY",
                    grossAmount: amountYen,

                    ownerRateBps: snapshot.ownerRateBps,
                    agentRateBps: snapshot.agentRateBps,
                    platformRateBps: snapshot.platformRateBps,

                    ownerAmount,
                    agentAmount,
                    platformAmount,

                    stripeFeeAmount: feeInfo.fee,
                    connectFeeAmount: 0,
                    payoutFeeAmount: 0,

                    memo: [
                      "MONTHLY_SUBSCRIPTION",
                      `contractId=${contract.id}`,
                      `billingPeriod=${billingPeriod}`,
                    ].join("\n"),
                  },
                });
              } catch (e) {
                console.error("[monthly payment create] failed:", e);
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