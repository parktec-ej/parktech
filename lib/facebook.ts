/**
 * Facebook Graph API ヘルパー。
 * - 即時投稿: postFacebook({ message })
 * - 予約投稿: postFacebookScheduled({ message, scheduledAt })
 *
 * Facebook 側で予約投稿を保持してくれる (`scheduled_publish_time`) ので、
 * アプリ側で cron は不要（Phase 6 の auto-trigger 用途を除く）。
 *
 * 必須 env:
 *   FACEBOOK_PAGE_ID
 *   FACEBOOK_PAGE_ACCESS_TOKEN
 */

const GRAPH_VERSION = "v19.0";

function requireEnv(): { pageId: string; accessToken: string } {
  const pageId = (process.env.FACEBOOK_PAGE_ID ?? "").trim();
  const accessToken = (process.env.FACEBOOK_PAGE_ACCESS_TOKEN ?? "").trim();
  if (!pageId || !accessToken) {
    throw new Error("FACEBOOK_PAGE_ID / FACEBOOK_PAGE_ACCESS_TOKEN が未設定");
  }
  return { pageId, accessToken };
}

export type FacebookPostResult = {
  ok: true;
  fbPostId: string;
  scheduled: boolean;
};

/** 即時投稿 */
export async function postFacebook(params: {
  message: string;
  link?: string;
}): Promise<FacebookPostResult> {
  const { pageId, accessToken } = requireEnv();
  const body: Record<string, unknown> = {
    message: params.message,
    access_token: accessToken,
  };
  if (params.link) body.link = params.link;

  const res = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(pageId)}/feed`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok || !json?.id) {
    const errMsg =
      json?.error?.message ?? `Facebook post failed: ${res.status}`;
    throw new Error(errMsg);
  }
  return { ok: true, fbPostId: String(json.id), scheduled: false };
}

/**
 * 予約投稿（Facebook側でスケジュール保持）。
 * `scheduledAt` は今から 10 分以上先 〜 6 ヶ月以内 でなければ Graph API が弾く。
 */
export async function postFacebookScheduled(params: {
  message: string;
  scheduledAt: Date;
  link?: string;
}): Promise<FacebookPostResult> {
  const { pageId, accessToken } = requireEnv();
  const epoch = Math.floor(params.scheduledAt.getTime() / 1000);

  const body: Record<string, unknown> = {
    message: params.message,
    access_token: accessToken,
    published: false,
    scheduled_publish_time: epoch,
  };
  if (params.link) body.link = params.link;

  const res = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(pageId)}/feed`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok || !json?.id) {
    const errMsg =
      json?.error?.message ?? `Facebook scheduled post failed: ${res.status}`;
    throw new Error(errMsg);
  }
  return { ok: true, fbPostId: String(json.id), scheduled: true };
}
