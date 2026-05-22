import { stripe } from "./stripe";

// Express アカウント作成
export async function createConnectAccount(params: {
  email: string;
  businessType?: "individual" | "company";
  country?: string;
}) {
  return stripe.accounts.create({
    country: params.country || "JP",
    email: params.email,
    business_type: params.businessType || "individual",
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    controller: {
      losses: { payments: "application" },
      fees: { payer: "application" },
      stripe_dashboard: { type: "express" },
    },
  } as any);
}

// Onboarding URL生成
export async function createOnboardingLink(params: {
  accountId: string;
  returnUrl: string;
  refreshUrl: string;
}) {
  return stripe.accountLinks.create({
    account: params.accountId,
    refresh_url: params.refreshUrl,
    return_url: params.returnUrl,
    type: "account_onboarding",
  });
}

// アカウントステータス取得
export async function getAccountStatus(accountId: string) {
  const account = await stripe.accounts.retrieve(accountId);
  return {
    id: account.id,
    chargesEnabled: account.charges_enabled,
    payoutsEnabled: account.payouts_enabled,
    detailsSubmitted: account.details_submitted,
    requirements: account.requirements,
  };
}
