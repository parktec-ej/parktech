import Anthropic from "@anthropic-ai/sdk";

// lib/claude-sns-text.ts と同じ Anthropic クライアント/モデルを使用する。
function getClient() {
  const raw = process.env.ANTHROPIC_API_KEY ?? "";
  let apiKey = raw.trim();
  if (
    (apiKey.startsWith('"') && apiKey.endsWith('"')) ||
    (apiKey.startsWith("'") && apiKey.endsWith("'"))
  ) {
    apiKey = apiKey.slice(1, -1);
  }
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  return new Anthropic({ apiKey });
}

export type BroadcastTone = "polite" | "casual";
export type BroadcastLength = "short" | "long";

export type GenerateBroadcastOptions = {
  tone?: BroadcastTone;
  length?: BroadcastLength;
  model?: string;
  maxTokens?: number;
};

function toneLabel(tone: BroadcastTone): string {
  return tone === "casual"
    ? "親しみやすくカジュアルな口調"
    : "丁寧で落ち着いた敬体";
}

function lengthLabel(length: BroadcastLength): string {
  return length === "long"
    ? "やや長め（3〜5文程度）でしっかり情報を伝える"
    : "短め（1〜2文程度）で簡潔に";
}

export function buildBroadcastPrompt(
  brief: string,
  options?: GenerateBroadcastOptions
): string {
  const tone = options?.tone ?? "polite";
  const length = options?.length ?? "short";

  return `あなたは「ParkTec East Japan（パークテック イーストジャパン／宮城県利府町の予約制駐車場サービス）」の公式SNS担当です。
以下のブリーフをもとに、InstagramとFacebookの両方でそのまま使える日本語の投稿文を1つ作成してください。

【ブリーフ】
${brief}

【作成ルール】
- ${toneLabel(tone)}
- 長さ: ${lengthLabel(length)}
- 絵文字を適度に（多すぎず）使う
- 文末に関連するハッシュタグを数個つける（例: #利府 #駐車場 #ParkTec など内容に合うもの）
- Instagram/Facebook どちらでも自然に読める文面にする
- 投稿文の本文のみを出力し、前置きや説明・引用符は付けない`;
}

export async function generateBroadcastCaption(
  brief: string,
  options?: GenerateBroadcastOptions
): Promise<string> {
  const client = getClient();
  const model = options?.model ?? "claude-haiku-4-5-20251001";
  const maxTokens = options?.maxTokens ?? 1024;

  const prompt = buildBroadcastPrompt(brief, options);
  const res = await client.messages.create({
    model,
    max_tokens: maxTokens,
    messages: [{ role: "user", content: prompt }],
  });
  const block = res.content.find((c) => c.type === "text");
  const text = block && block.type === "text" ? block.text : "";
  return text.trim();
}
