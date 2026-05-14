import Anthropic from "@anthropic-ai/sdk";

/**
 * 7段階の各フェーズに合わせた投稿文を生成するためのプロンプト材料。
 * 後でレビュー・調整しやすいよう、ガイドラインを定数化してあります。
 */
export const PHASE_GUIDE: Record<number, string> = {
  1: "イベント決定を知らせる。予約開始日は未定として『近日公開予定』と書く。",
  2: "予約開始日が決まったことを知らせる。日付を明記し、期待感を演出する。",
  3: "予約開始まで1週間。カウントダウン感で告知する。",
  4: "予約開始まで3日。先着順を強調し、緊張感を出す。",
  5: "予約受付スタート。QRコードで入出庫できることをアピール。",
  6: "残りわずか・満車。緊急性を演出。",
  7: "キャンセル空き枠あり。チャンス感を演出。",
};

export const VENUE_LABEL: Record<string, string> = {
  sekisui_arena: "セキスイハイムスーパーアリーナ",
  qanda_stadium: "キューアンドエースタジアムみやぎ",
};

const RESERVE_URL = "https://reserve.parktec-ej.com/places/rifu-main";

export type SnsTextInput = {
  phase: number;
  title: string;
  startAt: Date | string;
  venue: string;
  bookingStartAt?: Date | string | null;
};

function formatJstDate(d: Date | string): string {
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleDateString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  });
}

export function buildSnsTextPrompt(input: SnsTextInput): string {
  const guide = PHASE_GUIDE[input.phase] ?? PHASE_GUIDE[1];
  const venue = VENUE_LABEL[input.venue] ?? input.venue;
  const startStr = formatJstDate(input.startAt);
  const bookingStr = input.bookingStartAt
    ? formatJstDate(input.bookingStartAt)
    : "未定";

  return `以下のイベント情報から、Facebook投稿文を生成してください。

【イベント】
タイトル: ${input.title}
日程: ${startStr}
会場: ${venue}（宮城県利府町）
予約開始日: ${bookingStr}
予約URL: ${RESERVE_URL}
フェーズ: ${guide}

【要件】
- 300文字以内（厳守）
- 消費者目線（業者向け情報・手数料には触れない）
- 必要に応じて「QRコードで入出庫できる」点をアピール
- ハッシュタグを5〜8個含める
- 絵文字は控えめ（1〜2個まで）
- 自然で親しみやすいトーン
- JSON ではなく投稿テキストのみを返す（前置きや説明は不要）`;
}

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

export async function generateSnsText(
  input: SnsTextInput,
  options?: { model?: string; maxTokens?: number }
): Promise<string> {
  const client = getClient();
  const model = options?.model ?? "claude-haiku-4-5-20251001";
  const maxTokens = options?.maxTokens ?? 1024;

  const prompt = buildSnsTextPrompt(input);
  const res = await client.messages.create({
    model,
    max_tokens: maxTokens,
    messages: [{ role: "user", content: prompt }],
  });
  const block = res.content.find((c) => c.type === "text");
  const text = block && block.type === "text" ? block.text : "";
  return text.trim();
}
