import Anthropic from "@anthropic-ai/sdk";

/**
 * 月間予定 PDF からコンサート・音楽イベントだけを抽出するためのプロンプト。
 *
 * 設計書 v3 のフェーズ3 仕様に基づく初版。後でレビュー・微調整しやすいよう
 * 定数化してあります。本番投入前に内容を確認してください。
 */
export const PDF_EXTRACTION_PROMPT = `このPDFは宮城県総合運動公園「グランディ・21」の月間予定表です。
以下の条件でイベントを抽出して JSON のみ返してください。

【抽出対象】
- コンサート・ライブ・音楽イベント
- エンターテインメントショー

【除外】
- 水泳大会・スポーツ大会・試合
- 練習・スクール・教室・レッスン
- 施設貸切（一般来場不可）
- 「貸切」のみの記載

【出力形式（JSONのみ。前後のテキスト・コードブロック記法は不要）】
[
  {
    "title": "アーティスト名またはイベント名",
    "venue": "sekisui_arena | qanda_stadium",
    "date": "YYYY-MM-DD",
    "endDate": "YYYY-MM-DD または null",
    "doorOpen": "HH:MM または null",
    "showStart": "HH:MM または null",
    "category": "concert",
    "notes": "備考（あれば。なければ空文字）"
  }
]

【補足】
- "venue" は「セキスイハイムスーパーアリーナ」なら "sekisui_arena"、
  「キューアンドエースタジアムみやぎ」なら "qanda_stadium" に正規化してください。
- どちらにも該当しない（フィットネスホールなど）場合はその項目を除外してください。
- 該当イベントが1件も無い場合は空配列 [] を返してください。
- JSON 以外の説明文・前置きは絶対に含めないでください。`;

export type ExtractedEvent = {
  title: string;
  venue: "sekisui_arena" | "qanda_stadium";
  date: string; // YYYY-MM-DD
  endDate: string | null;
  doorOpen: string | null;
  showStart: string | null;
  category: string;
  notes: string;
};

function getClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  return new Anthropic({ apiKey });
}

/**
 * 出力テキストから安全に JSON 配列を取り出す。
 * Claude が "前後のテキスト不要" を破った場合の保険。
 */
function safeParseJsonArray(text: string): unknown[] {
  const trimmed = text.trim();
  // 直接 parse できるならそれが一番
  try {
    const direct = JSON.parse(trimmed);
    return Array.isArray(direct) ? direct : [];
  } catch {
    // fall through
  }
  // 配列っぽい部分を抽出
  const m = trimmed.match(/\[[\s\S]*\]/);
  if (!m) return [];
  try {
    const parsed = JSON.parse(m[0]);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function isValidYmd(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isValidVenue(value: unknown): value is ExtractedEvent["venue"] {
  return value === "sekisui_arena" || value === "qanda_stadium";
}

function normalizeExtracted(row: unknown): ExtractedEvent | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  const title = typeof r.title === "string" ? r.title.trim() : "";
  const venue = r.venue;
  const date = r.date;
  if (!title || !isValidVenue(venue) || !isValidYmd(date)) return null;
  const endDate = isValidYmd(r.endDate) ? r.endDate : null;
  const doorOpen =
    typeof r.doorOpen === "string" && /^\d{1,2}:\d{2}$/.test(r.doorOpen)
      ? r.doorOpen
      : null;
  const showStart =
    typeof r.showStart === "string" && /^\d{1,2}:\d{2}$/.test(r.showStart)
      ? r.showStart
      : null;
  const category = typeof r.category === "string" && r.category ? r.category : "concert";
  const notes = typeof r.notes === "string" ? r.notes : "";
  return { title, venue, date, endDate, doorOpen, showStart, category, notes };
}

/**
 * PDF バイト列を Claude に渡してコンサート情報を抽出する。
 *
 * Claude SDK の `document` content type を使い、base64 PDF を直接アップロードする。
 */
export async function extractEventsFromPdf(
  pdfBytes: Buffer,
  options?: { model?: string; maxTokens?: number }
): Promise<ExtractedEvent[]> {
  const client = getClient();
  const model = options?.model ?? "claude-haiku-4-5-20251001";
  const maxTokens = options?.maxTokens ?? 4096;

  const base64 = pdfBytes.toString("base64");

  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: base64,
            },
          },
          {
            type: "text",
            text: PDF_EXTRACTION_PROMPT,
          },
        ],
      },
    ],
  });

  // 1個目の text ブロックを取り出す
  const block = response.content.find((c) => c.type === "text");
  const text = block && block.type === "text" ? block.text : "";
  const raw = safeParseJsonArray(text);
  const normalized: ExtractedEvent[] = [];
  for (const row of raw) {
    const n = normalizeExtracted(row);
    if (n) normalized.push(n);
  }
  return normalized;
}
