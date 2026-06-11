import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getAdminSession } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";
import {
  createWorkRecord,
  createDiaryRecord,
  createIdeaRecord,
  type WorkRecord,
  type DiaryRecord,
  type IdeaRecord,
} from "@/lib/notion";

export const runtime = "nodejs";

type Category = "work" | "diary" | "idea";

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 2000;

function todayJst(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}

function getAnthropic(): Anthropic {
  let apiKey = (process.env.ANTHROPIC_API_KEY ?? "").trim();
  if (
    (apiKey.startsWith('"') && apiKey.endsWith('"')) ||
    (apiKey.startsWith("'") && apiKey.endsWith("'"))
  ) {
    apiKey = apiKey.slice(1, -1);
  }
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  return new Anthropic({ apiKey });
}

// ---- category 別プロンプト ------------------------------------------------

function buildPrompt(category: Category, text: string, today: string): string {
  const common = `あなたは音声入力された日本語のメモを構造化するアシスタントです。
今日の日付は ${today}（Asia/Tokyo）です。日付が明示されていなければ今日を使ってください。
出力は JSON のみ。前置き・説明・コードフェンス（\`\`\`）は一切付けないこと。`;

  if (category === "work") {
    return `${common}

入力は1回の発話に複数の業務が含まれることがあります。業務ごとに1レコードへ分解してください。
次の形式の JSON を返してください:
{
  "records": [
    {
      "title": "短い業務見出し（必須）",
      "date": "YYYY-MM-DD（未指定なら今日）",
      "startTime": "開始時刻 例 09:00（無ければ空文字）",
      "endTime": "終了時刻 例 11:30（無ければ空文字）",
      "workHours": 作業時間の数値（時間単位。明示が無ければ開始/終了から計算、不明なら null）,
      "memo": "作業内容の説明（→メモ欄）",
      "place": "場所（無ければ空文字）",
      "project": ["プロジェクト名の配列。無ければ空配列"],
      "expense": 経費の数値（円。無ければ null）,
      "distanceKm": 移動距離の数値（km。無ければ null）
    }
  ]
}

業務メモ:
${text}`;
  }

  if (category === "diary") {
    return `${common}

次の形式の JSON を返してください（1レコードのみ）:
{
  "records": [
    {
      "title": "短い見出し（必須）",
      "date": "YYYY-MM-DD（未指定なら今日）",
      "body": "日記の本文",
      "mood": ["気分を表す語の配列。例 嬉しい/疲れた など。無ければ空配列"]
    }
  ]
}

日記メモ:
${text}`;
  }

  // idea
  return `${common}

次の形式の JSON を返してください（1レコードのみ）:
{
  "records": [
    {
      "title": "アイデアの見出し（必須。補足や本文相当があれば見出しに集約してよい）",
      "date": "YYYY-MM-DD（未指定なら今日）",
      "priority": ["優先度。高/中/低 のいずれか。判断できなければ空配列"],
      "feasibility": ["実現可能性。高/中/低 のいずれか。判断できなければ空配列"],
      "relatedProjects": ["関連プロジェクト名の配列。無ければ空配列"]
    }
  ]
}

アイデアメモ:
${text}`;
}

// ```json フェンスが付いた場合は除去してから JSON.parse
function parseJson(raw: string): unknown {
  let s = raw.trim();
  if (s.startsWith("```")) {
    s = s
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();
  }
  return JSON.parse(s);
}

async function structure(
  category: Category,
  text: string
): Promise<{ records: Record<string, unknown>[]; raw: string }> {
  const anthropic = getAnthropic();
  const prompt = buildPrompt(category, text, todayJst());
  const res = await anthropic.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    messages: [{ role: "user", content: prompt }],
  });
  const block = res.content.find((c) => c.type === "text");
  const raw = block && block.type === "text" ? block.text : "";
  let parsed: unknown;
  try {
    parsed = parseJson(raw);
  } catch {
    throw new Error(`Claudeの応答をJSONとして解析できませんでした: ${raw.slice(0, 200)}`);
  }
  const records = (parsed as { records?: unknown }).records;
  if (!Array.isArray(records)) {
    throw new Error("Claudeの応答に records 配列がありません");
  }
  return { records: records as Record<string, unknown>[], raw };
}

// ---- 型変換ヘルパー（Claude応答→各Record） --------------------------------

const str = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.trim() : null;

const num = (v: unknown): number | null => {
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  if (typeof v === "string" && v.trim() && !Number.isNaN(Number(v))) {
    return Number(v);
  }
  return null;
};

const arr = (v: unknown): string[] =>
  Array.isArray(v)
    ? v.map((x) => String(x ?? "").trim()).filter(Boolean)
    : [];

function toWork(r: Record<string, unknown>): WorkRecord {
  return {
    title: str(r.title) ?? "（無題）",
    date: str(r.date),
    startTime: str(r.startTime),
    endTime: str(r.endTime),
    workHours: num(r.workHours),
    memo: str(r.memo),
    place: str(r.place),
    project: arr(r.project),
    expense: num(r.expense),
    distanceKm: num(r.distanceKm),
  };
}

function toDiary(r: Record<string, unknown>): DiaryRecord {
  return {
    title: str(r.title) ?? "（無題）",
    date: str(r.date),
    body: str(r.body),
    mood: arr(r.mood),
  };
}

function toIdea(r: Record<string, unknown>): IdeaRecord {
  return {
    title: str(r.title) ?? "（無題）",
    date: str(r.date),
    priority: arr(r.priority),
    feasibility: arr(r.feasibility),
    relatedProjects: arr(r.relatedProjects),
  };
}

// ---- ハンドラ -------------------------------------------------------------

export async function POST(req: Request) {
  // 認証（middleware は /api を守らないのでここで明示ガード）
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  let body: { text?: unknown; category?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "リクエストボディが不正です" }, { status: 400 });
  }

  const text = typeof body.text === "string" ? body.text.trim() : "";
  const category = body.category as Category;

  if (!text) {
    return NextResponse.json({ error: "text が空です" }, { status: 400 });
  }
  if (category !== "work" && category !== "diary" && category !== "idea") {
    return NextResponse.json(
      { error: "category は work / diary / idea のいずれかにしてください" },
      { status: 400 }
    );
  }

  // 1) Claude で構造化
  let structured: { records: Record<string, unknown>[]; raw: string };
  try {
    structured = await structure(category, text);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `構造化に失敗しました: ${msg}` }, { status: 502 });
  }

  // 2) 各レコードを Notion に作成（どのレコードで失敗したか分かるように）
  const created: { notionUrl: string; notionId: string; title: string }[] = [];
  for (let i = 0; i < structured.records.length; i++) {
    const r = structured.records[i];
    try {
      let page: { id: string; url: string };
      if (category === "work") {
        const rec = toWork(r);
        page = await createWorkRecord(rec);
        created.push({ notionUrl: page.url, notionId: page.id, title: rec.title });
      } else if (category === "diary") {
        const rec = toDiary(r);
        page = await createDiaryRecord(rec);
        created.push({ notionUrl: page.url, notionId: page.id, title: rec.title });
      } else {
        const rec = toIdea(r);
        page = await createIdeaRecord(rec);
        created.push({ notionUrl: page.url, notionId: page.id, title: rec.title });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const title = str(r.title) ?? `レコード${i + 1}`;
      // 途中まで作成済みのものは生ログに残しつつ、失敗を明示して返す
      let logId: string | null = null;
      try {
        const log = await prisma.memoLog.create({
          data: {
            category,
            rawText: text,
            parsed: structured.records as never,
            notionIds: created.map((c) => c.notionId),
          },
        });
        logId = log.id;
      } catch {
        /* ログ保存失敗は握りつぶさず本文のエラーを優先 */
      }
      return NextResponse.json(
        {
          error: `レコード「${title}」(${i + 1}/${structured.records.length}) のNotion作成に失敗しました: ${msg}`,
          created: created.length,
          items: created.map((c) => ({ notionUrl: c.notionUrl })),
          logId,
        },
        { status: 502 }
      );
    }
  }

  // 3) Supabase（Prisma経由）に生ログを保存
  let logId: string | null = null;
  try {
    const log = await prisma.memoLog.create({
      data: {
        category,
        rawText: text,
        parsed: structured.records as never,
        notionIds: created.map((c) => c.notionId),
      },
    });
    logId = log.id;
  } catch (err) {
    // Notion作成は成功しているのでエラーにはせず、logId=null で返す
    console.error("MemoLog save failed:", err);
  }

  return NextResponse.json({
    created: created.length,
    items: created.map((c) => ({ notionUrl: c.notionUrl, title: c.title })),
    logId,
  });
}
