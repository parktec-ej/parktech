/**
 * Stripe Connect 専用 Webhook エンドポイント
 *
 * 既存の /api/stripe/webhook は checkout.session.completed 専用なので、
 * Connect 関連イベントはこちらで処理する。
 *
 * 必要な環境変数: STRIPE_CONNECT_WEBHOOK_SECRET
 *   Stripe Dashboard → 開発者 → Webhook で新しいエンドポイントを作成
 *   URL: https://reserve.parktec-ej.com/api/stripe/connect-webhook
 *   イベント: account.updated, transfer.created, transfer.failed, payout.failed
 */

import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import { stripe } from "@/lib/stripe";
import Stripe from "stripe";

const CONNECT_WEBHOOK_SECRET = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const preferredRegion = "hnd1";

export async function POST(req: Request) {
  const body = await req.text();
  const headersList = await headers();
  const sig = headersList.get("stripe-signature");

  if (!sig || !CONNECT_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "missing_config" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, CONNECT_WEBHOOK_SECRET);
  } catch (e: any) {
    console.error("Connect webhook signature error:", e.message);
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  try {
    // 注: Stripe SDK の Event.type 型に "transfer.failed" は含まれないが、
    // Connect 関連で Stripe側 から到達する可能性のあるイベントを広く受ける
    // ためキャストして switch する。
    switch (event.type as string) {
      case "account.updated":
        await handleAccountUpdated(event.data.object as Stripe.Account);
        break;
      case "transfer.created":
        await handleTransferCreated(event.data.object as Stripe.Transfer);
        break;
      case "transfer.failed":
      case "transfer.reversed":
        await handleTransferFailed(event.data.object as Stripe.Transfer);
        break;
      case "payout.failed":
        await handlePayoutFailed(event.data.object as any);
        break;
    }
  } catch (e: any) {
    console.error(`Connect webhook handler error [${event.type}]:`, e);
  }

  return NextResponse.json({ received: true });
}

// account.updated: Connect アカウントの状態変更を監視
async function handleAccountUpdated(account: Stripe.Account) {
  const accountId = account.id;
  const chargesEnabled = account.charges_enabled ?? false;
  const payoutsEnabled = account.payouts_enabled ?? false;
  const detailsSubmitted = account.details_submitted ?? false;
  const isComplete = chargesEnabled && payoutsEnabled && detailsSubmitted;

  // Owner を検索
  const owner = await prisma.owner.findFirst({
    where: { stripeAccountId: accountId },
  });
  if (owner) {
    await prisma.owner.update({
      where: { id: owner.id },
      data: { stripeOnboardingComplete: isComplete },
    });
    console.log(`Owner ${owner.id} stripeOnboardingComplete → ${isComplete}`);

    if (isComplete && !owner.stripeOnboardingComplete) {
      await sendSlackNotification(
        `✅ オーナー「${owner.name}」のStripe Connect連携が完了しました`
      );
    }
    return;
  }

  // Agent を検索
  const agent = await prisma.agent.findFirst({
    where: { stripeAccountId: accountId },
  });
  if (agent) {
    await prisma.agent.update({
      where: { id: agent.id },
      data: { stripeOnboardingComplete: isComplete },
    });
    console.log(`Agent ${agent.id} stripeOnboardingComplete → ${isComplete}`);

    if (isComplete && !agent.stripeOnboardingComplete) {
      await sendSlackNotification(
        `✅ 代理店「${agent.name}」のStripe Connect連携が完了しました`
      );
    }
    return;
  }

  console.warn(`Connect account ${accountId} not found in Owner/Agent`);
}

// transfer.created: Transfer 成功を確認
async function handleTransferCreated(transfer: Stripe.Transfer) {
  const transferId = transfer.id;
  const payout = await prisma.payout.findFirst({
    where: { stripeTransferId: transferId },
  });
  if (payout && payout.status !== "PAID") {
    await prisma.payout.update({
      where: { id: payout.id },
      data: { status: "PAID", executedAt: new Date() },
    });
    console.log(`Payout ${payout.id} confirmed via transfer.created`);
  }
}

// transfer.failed: Transfer 失敗
async function handleTransferFailed(transfer: Stripe.Transfer) {
  const transferId = transfer.id;
  const payout = await prisma.payout.findFirst({
    where: { stripeTransferId: transferId },
  });
  if (payout) {
    await prisma.payout.update({
      where: { id: payout.id },
      data: {
        status: "FAILED",
        failedReason:
          (transfer as any).failure_message || "Transfer failed",
      },
    });

    await sendSlackNotification(
      `🔴 送金失敗: Payout ${payout.id}\nTransfer: ${transferId}\n理由: ${(transfer as any).failure_message || "不明"}`
    );
  }
}

// payout.failed: Stripe→銀行口座への払い出し失敗
async function handlePayoutFailed(payout: any) {
  const accountId = payout.destination || payout.account;
  await sendSlackNotification(
    `🔴 Stripe Payout失敗\nAccount: ${accountId}\n金額: ¥${payout.amount}\n理由: ${payout.failure_message || "不明"}`
  );
}

// Slack通知ヘルパー（既存のSLACK_WEBHOOK_URLを使用）
async function sendSlackNotification(text: string) {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
  } catch (e) {
    console.error("Slack notification failed:", e);
  }
}
