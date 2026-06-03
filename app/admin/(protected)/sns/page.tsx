"use client";

import { useEffect, useState } from "react";

const DEFAULT_IMAGE_URL = "https://reserve.parktec-ej.com/sns/opening.jpg";

type Broadcast = {
  id: string;
  caption: string;
  imageUrl: string | null;
  toIg: boolean;
  toFb: boolean;
  fbPostId: string | null;
  igPostId: string | null;
  status: string;
  error: string | null;
  postedAt: string | null;
  createdAt: string;
};

function statusBadge(status: string): { label: string; bg: string; color: string } {
  switch (status) {
    case "posted":
      return { label: "投稿済み", bg: "#dcfce7", color: "#166534" };
    case "partial":
      return { label: "部分成功", bg: "#fef9c3", color: "#854d0e" };
    case "failed":
      return { label: "失敗", bg: "#fee2e2", color: "#991b1b" };
    default:
      return { label: "下書き", bg: "#f3f4f6", color: "#374151" };
  }
}

function formatJst(iso: string | null) {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
}

export default function AdminSnsBroadcastPage() {
  // AI生成
  const [brief, setBrief] = useState("");
  const [tone, setTone] = useState<"polite" | "casual">("polite");
  const [length, setLength] = useState<"short" | "long">("short");
  const [generating, setGenerating] = useState(false);

  // 投稿フォーム
  const [caption, setCaption] = useState("");
  const [imageUrl, setImageUrl] = useState(DEFAULT_IMAGE_URL);
  const [toIg, setToIg] = useState(true);
  const [toFb, setToFb] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [msg, setMsg] = useState("");

  // 履歴
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  async function loadHistory() {
    setLoadingHistory(true);
    try {
      const res = await fetch("/api/admin/sns/broadcasts", { cache: "no-store" });
      if (res.status === 401) {
        window.location.href = "/admin/login";
        return;
      }
      const json = await res.json().catch(() => null);
      setBroadcasts(json?.ok ? json.broadcasts ?? [] : []);
    } catch {
      setBroadcasts([]);
    } finally {
      setLoadingHistory(false);
    }
  }

  useEffect(() => {
    void loadHistory();
  }, []);

  async function handleGenerate() {
    if (!brief.trim()) {
      setMsg("ブリーフ（投稿の要点）を入力してください");
      return;
    }
    setGenerating(true);
    setMsg("");
    try {
      const res = await fetch("/api/admin/sns/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brief, tone, length }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setMsg(json?.message || json?.error || "生成に失敗しました");
        return;
      }
      setCaption(json.caption);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
    }
  }

  async function handleUpload(file: File) {
    setUploading(true);
    setMsg("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/admin/sns/upload", { method: "POST", body: fd });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setMsg(json?.message || json?.error || "アップロードに失敗しました");
        return;
      }
      setImageUrl(json.url);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  }

  async function handlePost() {
    if (!caption.trim()) {
      setMsg("キャプションを入力してください");
      return;
    }
    if (!toIg && !toFb) {
      setMsg("投稿先を1つ以上選択してください");
      return;
    }

    const targets = [toFb ? "Facebook" : null, toIg ? "Instagram" : null]
      .filter(Boolean)
      .join(" と ");
    const igNote =
      toIg && !imageUrl.trim()
        ? "\n※ Instagram は画像URLが無いためスキップされます。"
        : "";
    const ok = window.confirm(
      `${targets} に今すぐ投稿します。よろしいですか？${igNote}`
    );
    if (!ok) return;

    setPosting(true);
    setMsg("");
    try {
      const res = await fetch("/api/admin/sns/post-now", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caption, imageUrl, toIg, toFb }),
      });
      const json = await res.json().catch(() => null);

      if (!json) {
        setMsg("投稿結果の取得に失敗しました");
        return;
      }

      const parts: string[] = [];
      parts.push(`状態: ${json.status ?? "-"}`);
      if (json.fbPostId) parts.push(`FB: ${json.fbPostId}`);
      if (json.igPostId) parts.push(`IG: ${json.igPostId}`);
      if (json.igSkipped) parts.push("IGスキップ（画像URLなし）");
      if (json.error) parts.push(`エラー: ${json.error}`);
      window.alert(parts.join("\n"));

      await loadHistory();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e));
    } finally {
      setPosting(false);
    }
  }

  return (
    <main style={pageStyle}>
      <h1 style={titleStyle}>汎用SNS投稿</h1>
      <p style={descStyle}>
        イベントに紐づかない単発の投稿（Instagram / Facebook）を作成・投稿します。
      </p>

      {msg ? <div style={errorBoxStyle}>{msg}</div> : null}

      {/* AIキャプション生成 */}
      <section style={cardStyle}>
        <div style={sectionTitleStyle}>✨ AIキャプション生成</div>
        <div style={fieldStyle}>
          <label style={labelStyle}>ブリーフ（投稿の要点）</label>
          <textarea
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            style={textareaStyle}
            placeholder="例: 利府の駐車場、グランドオープンのお知らせ。予約制で安心、QRで入出庫。"
          />
        </div>
        <div style={rowStyle}>
          <div style={fieldStyle}>
            <label style={labelStyle}>トーン</label>
            <select value={tone} onChange={(e) => setTone(e.target.value as "polite" | "casual")} style={inputStyle}>
              <option value="polite">丁寧</option>
              <option value="casual">カジュアル</option>
            </select>
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>長さ</label>
            <select value={length} onChange={(e) => setLength(e.target.value as "short" | "long")} style={inputStyle}>
              <option value="short">短め</option>
              <option value="long">長め</option>
            </select>
          </div>
          <button type="button" onClick={handleGenerate} disabled={generating} style={secondaryButtonStyle}>
            {generating ? "生成中..." : "✨ 生成"}
          </button>
        </div>
      </section>

      {/* 投稿内容 */}
      <section style={cardStyle}>
        <div style={sectionTitleStyle}>投稿内容</div>

        <div style={fieldStyle}>
          <label style={labelStyle}>キャプション</label>
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            style={{ ...textareaStyle, minHeight: 160 }}
            placeholder="投稿本文（生成後も自由に編集できます）"
          />
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>画像</label>
          <div style={rowStyle}>
            <input
              type="file"
              accept="image/jpeg,image/png"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleUpload(f);
              }}
              style={{ flex: 1 }}
            />
            {uploading ? <span style={helpTextStyle}>アップロード中...</span> : null}
          </div>
          <input
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            style={{ ...inputStyle, marginTop: 8 }}
            placeholder="画像URL（ファイル選択でも自動入力されます）"
          />
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt="preview" style={previewStyle} />
          ) : null}
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>投稿先</label>
          <div style={rowStyle}>
            <label style={checkboxLabelStyle}>
              <input type="checkbox" checked={toIg} onChange={(e) => setToIg(e.target.checked)} /> Instagram
            </label>
            <label style={checkboxLabelStyle}>
              <input type="checkbox" checked={toFb} onChange={(e) => setToFb(e.target.checked)} /> Facebook
            </label>
          </div>
          <div style={helpTextStyle}>
            ※ Instagram は画像URLが必須です（無い場合は自動でスキップ）。
          </div>
        </div>

        <button
          type="button"
          onClick={handlePost}
          disabled={posting}
          style={{ ...primaryButtonStyle, opacity: posting ? 0.6 : 1 }}
        >
          {posting ? "投稿中..." : "📣 今すぐ投稿"}
        </button>
      </section>

      {/* 履歴 */}
      <section style={cardStyle}>
        <div style={sectionTitleStyle}>投稿履歴</div>
        {loadingHistory ? (
          <div style={helpTextStyle}>読み込み中...</div>
        ) : broadcasts.length === 0 ? (
          <div style={helpTextStyle}>まだ投稿はありません。</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>画像</th>
                  <th style={thStyle}>本文</th>
                  <th style={thStyle}>FB / IG ID</th>
                  <th style={thStyle}>状態</th>
                  <th style={thStyle}>日時</th>
                </tr>
              </thead>
              <tbody>
                {broadcasts.map((b) => {
                  const badge = statusBadge(b.status);
                  return (
                    <tr key={b.id}>
                      <td style={tdStyle}>
                        {b.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={b.imageUrl} alt="" style={thumbStyle} />
                        ) : (
                          <span style={helpTextStyle}>-</span>
                        )}
                      </td>
                      <td style={{ ...tdStyle, maxWidth: 360, whiteSpace: "normal" }}>
                        {b.caption.slice(0, 80)}
                        {b.caption.length > 80 ? "…" : ""}
                      </td>
                      <td style={tdStyle}>
                        <div style={idTextStyle}>FB: {b.fbPostId ?? "-"}</div>
                        <div style={idTextStyle}>IG: {b.igPostId ?? "-"}</div>
                        {b.error ? <div style={{ ...idTextStyle, color: "#991b1b" }}>err: {b.error}</div> : null}
                      </td>
                      <td style={tdStyle}>
                        <span style={{ ...badgeStyle, background: badge.bg, color: badge.color }}>
                          {badge.label}
                        </span>
                      </td>
                      <td style={tdStyle}>{formatJst(b.postedAt ?? b.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

const pageStyle: React.CSSProperties = { maxWidth: 920, margin: "0 auto", padding: 24 };
const titleStyle: React.CSSProperties = { fontSize: 26, fontWeight: 900, margin: 0, color: "#111827" };
const descStyle: React.CSSProperties = { color: "#6b7280", marginTop: 6, marginBottom: 16, lineHeight: 1.7 };
const cardStyle: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 16,
  background: "#fff",
  padding: 18,
  marginBottom: 18,
};
const sectionTitleStyle: React.CSSProperties = { fontSize: 16, fontWeight: 800, marginBottom: 12, color: "#111827" };
const fieldStyle: React.CSSProperties = { display: "grid", gap: 6, marginBottom: 12 };
const rowStyle: React.CSSProperties = { display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" };
const labelStyle: React.CSSProperties = { fontSize: 13, fontWeight: 700, color: "#374151" };
const inputStyle: React.CSSProperties = {
  width: "100%",
  border: "1px solid #d1d5db",
  borderRadius: 10,
  padding: "10px 12px",
  fontSize: 15,
  background: "#fff",
};
const textareaStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 90,
  border: "1px solid #d1d5db",
  borderRadius: 10,
  padding: "10px 12px",
  fontSize: 15,
  resize: "vertical",
  background: "#fff",
};
const checkboxLabelStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  fontSize: 14,
  fontWeight: 700,
  color: "#374151",
};
const primaryButtonStyle: React.CSSProperties = {
  border: "1px solid #111827",
  borderRadius: 12,
  background: "#111827",
  color: "#fff",
  padding: "12px 18px",
  fontSize: 15,
  fontWeight: 800,
  cursor: "pointer",
};
const secondaryButtonStyle: React.CSSProperties = {
  border: "1px solid #111827",
  borderRadius: 10,
  background: "#fff",
  color: "#111827",
  padding: "10px 16px",
  fontSize: 14,
  fontWeight: 800,
  cursor: "pointer",
  height: 40,
};
const helpTextStyle: React.CSSProperties = { color: "#6b7280", fontSize: 12, lineHeight: 1.6 };
const previewStyle: React.CSSProperties = {
  marginTop: 8,
  maxWidth: 220,
  borderRadius: 10,
  border: "1px solid #e5e7eb",
};
const errorBoxStyle: React.CSSProperties = {
  border: "1px solid #fecaca",
  background: "#fef2f2",
  color: "#991b1b",
  borderRadius: 12,
  padding: "10px 14px",
  marginBottom: 16,
  fontWeight: 700,
};
const tableStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: 13 };
const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 12px",
  color: "#6b7280",
  fontWeight: 700,
  borderBottom: "1px solid #e5e7eb",
  whiteSpace: "nowrap",
};
const tdStyle: React.CSSProperties = {
  padding: "10px 12px",
  color: "#111827",
  borderBottom: "1px solid #f3f4f6",
  verticalAlign: "top",
  whiteSpace: "nowrap",
};
const thumbStyle: React.CSSProperties = {
  width: 56,
  height: 56,
  objectFit: "cover",
  borderRadius: 8,
  border: "1px solid #e5e7eb",
};
const idTextStyle: React.CSSProperties = { fontSize: 11, color: "#6b7280", fontFamily: "monospace" };
const badgeStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "3px 10px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 800,
};
