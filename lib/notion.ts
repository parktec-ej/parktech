import { Client } from "@notionhq/client";

/**
 * Notion API版 2025-09-03（@notionhq/client v5）対応。
 * プロパティは DB 直下ではなく data source 配下にあり、書き込み（pages.create）の
 * parent には database_id ではなく data_source_id を指定する必要がある。
 *   databases.retrieve → data_sources[0].id を取得 → pages.create の parent に渡す
 */

function readEnv(name: string): string {
  let v = (process.env[name] ?? "").trim();
  // .env でクォート付きになっている場合に備えて剥がす
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1);
  }
  return v;
}

// URL からコピペした DB ID（"<id>?v=...&source=..."）に備えて先頭のID部分だけ取り出す
function cleanId(v: string): string {
  return v.split(/[?#]/)[0].trim();
}

const notion = new Client({ auth: readEnv("NOTION_API_KEY") });

// DB ID → data_source_id のキャッシュ（毎回 retrieve しない）
const dataSourceCache = new Map<string, string>();

export async function getDataSourceId(dbId: string): Promise<string> {
  const id = cleanId(dbId);
  const cached = dataSourceCache.get(id);
  if (cached) return cached;

  const res = await notion.databases.retrieve({ database_id: id });
  const sources =
    (res as unknown as { data_sources?: Array<{ id: string }> }).data_sources ??
    [];
  if (!sources.length) {
    throw new Error(`database ${id} に data source が見つかりません`);
  }
  const dsId = sources[0].id;
  dataSourceCache.set(id, dsId);
  return dsId;
}

// ---- プロパティ整形ヘルパー ----------------------------------------------

function todayJst(): string {
  // YYYY-MM-DD（Asia/Tokyo）
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}

const pTitle = (s: string) => ({
  title: [{ text: { content: s ?? "" } }],
});

const pRichText = (s?: string | null) => ({
  rich_text: s ? [{ text: { content: s } }] : [],
});

const pNumber = (n?: number | null) => ({
  number: typeof n === "number" && !Number.isNaN(n) ? n : null,
});

const pDate = (d?: string | null) => ({
  date: { start: d && d.trim() ? d.trim() : todayJst() },
});

// 存在しない選択肢でも Notion 側で自動作成される前提でそのまま渡す
const pMultiSelect = (arr?: string[] | null) => ({
  multi_select: (arr ?? [])
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .map((name) => ({ name })),
});

type CreatedPage = { id: string; url: string };

async function createInDataSource(
  dbEnvName: string,
  properties: Record<string, unknown>
): Promise<CreatedPage> {
  const dbId = readEnv(dbEnvName);
  if (!dbId) throw new Error(`${dbEnvName} is not set`);
  const dataSourceId = await getDataSourceId(dbId);

  const res = await notion.pages.create({
    parent: { type: "data_source_id", data_source_id: dataSourceId },
    // SDK の型は database/page parent も含む union のためここだけ緩める
    properties: properties as never,
  } as Parameters<typeof notion.pages.create>[0]);

  return { id: res.id, url: (res as unknown as { url: string }).url };
}

// ---- 各DBのレコード型と作成関数 ------------------------------------------

export type WorkRecord = {
  title: string;
  date?: string | null; // YYYY-MM-DD
  project?: string[];
  place?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  workHours?: number | null;
  distanceKm?: number | null;
  expense?: number | null;
  memo?: string | null;
};

export function createWorkRecord(rec: WorkRecord): Promise<CreatedPage> {
  return createInDataSource("NOTION_DB_WORK", {
    名前: pTitle(rec.title),
    日付: pDate(rec.date),
    プロジェクト: pMultiSelect(rec.project),
    場所: pRichText(rec.place),
    開始時刻: pRichText(rec.startTime),
    終了時刻: pRichText(rec.endTime),
    作業時間: pNumber(rec.workHours),
    移動距離: pNumber(rec.distanceKm),
    経費: pNumber(rec.expense),
    メモ: pRichText(rec.memo),
  });
}

export type DiaryRecord = {
  title: string;
  date?: string | null;
  body?: string | null;
  mood?: string[];
};

export function createDiaryRecord(rec: DiaryRecord): Promise<CreatedPage> {
  return createInDataSource("NOTION_DB_DIARY", {
    名前: pTitle(rec.title),
    日付: pDate(rec.date),
    気分: pMultiSelect(rec.mood),
    本文: pRichText(rec.body),
  });
}

export type IdeaRecord = {
  title: string;
  date?: string | null;
  priority?: string[]; // 高/中/低
  feasibility?: string[]; // 高/中/低
  relatedProjects?: string[];
};

export function createIdeaRecord(rec: IdeaRecord): Promise<CreatedPage> {
  return createInDataSource("NOTION_DB_IDEA", {
    名前: pTitle(rec.title),
    日付: pDate(rec.date),
    優先度: pMultiSelect(rec.priority),
    実現可能性: pMultiSelect(rec.feasibility),
    関連プロジェクト: pMultiSelect(rec.relatedProjects),
  });
}
