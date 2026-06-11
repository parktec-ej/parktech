"use client";

import { useState } from "react";
import type { CSSProperties } from "react";

type Category = "work" | "diary" | "idea";

const CATEGORIES: { key: Category; label: string; emoji: string }[] = [
  { key: "work", label: "業務", emoji: "🛠️" },
  { key: "diary", label: "日記", emoji: "📔" },
  { key: "idea", label: "アイデア", emoji: "💡" },
];

type ResultItem = { notionUrl: string; title?: string };
type SuccessResult = { created: number; items: ResultItem[]; logId: string | null };

export default function MemoPage() {
  const [category, setCategory] = useState<Category>("work");
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SuccessResult | null>(null);

  async function handleSubmit() {
    if (!text.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/memo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.trim(), category }),
      });
      const data = await res.json();
      if (!res.ok) {
        // 部分成功でも items があれば見せる
        setError(data?.error ?? `エラー (HTTP ${res.status})`);
        if (typeof data?.created === "number" && Array.isArray(data?.items)) {
          setResult({ created: data.created, items: data.items, logId: data.logId ?? null });
        }
        return;
      }
      setResult(data as SuccessResult);
      setText(""); // 成功後はクリア
    } catch (e) {
      setError(e instanceof Error ? e.message : "送信に失敗しました");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={wrap}>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 4px" }}>
        業務記録メモ
      </h1>
      <p style={{ color: "#666", fontSize: 13, margin: "0 0 16px" }}>
        マイク音声入力で喋ってから送信すると、Claudeが構造化してNotionに保存します。
      </p>

      {/* カテゴリトグル */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        {CATEGORIES.map((c) => {
          const active = category === c.key;
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => setCategory(c.key)}
              disabled={submitting}
              style={{
                ...toggle,
                background: active ? "#111" : "#fff",
                color: active ? "#fff" : "#111",
                borderColor: active ? "#111" : "#ddd",
              }}
            >
              {c.emoji} {c.label}
            </button>
          );
        })}
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="ここに喋った内容（マイク音声入力）を入れて送信…"
        rows={10}
        disabled={submitting}
        style={textarea}
      />

      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitting || !text.trim()}
        style={{
          ...submitBtn,
          opacity: submitting || !text.trim() ? 0.5 : 1,
          cursor: submitting || !text.trim() ? "not-allowed" : "pointer",
        }}
      >
        {submitting ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <Spinner /> 処理中…
          </span>
        ) : (
          "Notionに保存"
        )}
      </button>

      {error && (
        <div style={errorBox}>
          <b>エラー:</b> {error}
        </div>
      )}

      {result && (
        <div style={successBox}>
          <b>{result.created} 件作成しました。</b>
          <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
            {result.items.map((it, i) => (
              <li key={i} style={{ marginBottom: 4 }}>
                <a href={it.notionUrl} target="_blank" rel="noopener noreferrer">
                  {it.title ? it.title : it.notionUrl}
                </a>
              </li>
            ))}
          </ul>
          {result.logId && (
            <div style={{ color: "#888", fontSize: 12, marginTop: 8 }}>
              logId: {result.logId}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Spinner() {
  return (
    <span
      style={{
        width: 14,
        height: 14,
        border: "2px solid rgba(255,255,255,0.4)",
        borderTopColor: "#fff",
        borderRadius: "50%",
        display: "inline-block",
        animation: "memo-spin 0.7s linear infinite",
      }}
    >
      <style>{`@keyframes memo-spin { to { transform: rotate(360deg); } }`}</style>
    </span>
  );
}

const wrap: CSSProperties = {
  maxWidth: 640,
  margin: "0 auto",
  padding: "24px 16px 64px",
};

const toggle: CSSProperties = {
  flex: 1,
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #ddd",
  fontWeight: 700,
  fontSize: 15,
};

const textarea: CSSProperties = {
  width: "100%",
  padding: 12,
  borderRadius: 10,
  border: "1px solid #ddd",
  fontSize: 16,
  lineHeight: 1.6,
  resize: "vertical",
  boxSizing: "border-box",
};

const submitBtn: CSSProperties = {
  marginTop: 12,
  width: "100%",
  padding: "14px 16px",
  borderRadius: 10,
  border: "none",
  background: "#111",
  color: "#fff",
  fontWeight: 800,
  fontSize: 16,
};

const errorBox: CSSProperties = {
  marginTop: 16,
  padding: 12,
  borderRadius: 10,
  background: "#fee",
  border: "1px solid #f5b5b5",
  color: "#a11",
  fontSize: 14,
  whiteSpace: "pre-wrap",
};

const successBox: CSSProperties = {
  marginTop: 16,
  padding: 12,
  borderRadius: 10,
  background: "#eefbf0",
  border: "1px solid #b5e5c0",
  color: "#137a37",
  fontSize: 14,
};
