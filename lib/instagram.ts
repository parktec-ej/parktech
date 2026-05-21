import { sendSlackAlert } from "./slack";

const IG_API_BASE = "https://graph.facebook.com/v19.0";

function getCredentials() {
  const token = process.env.FACEBOOK_PAGE_ACCESS_TOKEN ?? "";
  const pageId = process.env.FACEBOOK_PAGE_ID ?? "";
  if (!token || !pageId) throw new Error("FACEBOOK_PAGE_ACCESS_TOKEN or FACEBOOK_PAGE_ID is not set");
  return { token, pageId };
}

async function getIgUserId(token: string, pageId: string): Promise<string> {
  const res = await fetch(
    `${IG_API_BASE}/${pageId}?fields=instagram_business_account&access_token=${token}`
  );
  const data = await res.json() as { instagram_business_account?: { id: string }; error?: { message: string } };
  if (data.error) throw new Error(`FB API error: ${data.error.message}`);
  if (!data.instagram_business_account?.id) throw new Error("Instagram Business Account not linked to this Facebook Page");
  return data.instagram_business_account.id;
}

/**
 * Instagram に画像付き投稿する（2段階フロー）
 * @param caption 投稿テキスト
 * @param imageUrl 公開アクセス可能な画像URL（必須）
 */
export async function postInstagram(caption: string, imageUrl: string): Promise<string> {
  const { token, pageId } = getCredentials();
  const igUserId = await getIgUserId(token, pageId);

  // Step1: メディアコンテナ作成
  const containerRes = await fetch(
    `${IG_API_BASE}/${igUserId}/media`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image_url: imageUrl,
        caption,
        access_token: token,
      }),
    }
  );
  const container = await containerRes.json() as { id?: string; error?: { message: string } };
  if (container.error) throw new Error(`IG container error: ${container.error.message}`);
  if (!container.id) throw new Error("IG container ID not returned");

  // Step2: 公開
  const publishRes = await fetch(
    `${IG_API_BASE}/${igUserId}/media_publish`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        creation_id: container.id,
        access_token: token,
      }),
    }
  );
  const published = await publishRes.json() as { id?: string; error?: { message: string } };
  if (published.error) throw new Error(`IG publish error: ${published.error.message}`);
  if (!published.id) throw new Error("IG post ID not returned");

  await sendSlackAlert(`📸 [Instagram] 投稿完了 igPostId: ${published.id}`);
  return published.id;
}
