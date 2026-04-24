"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type CheckinResponse = {
  ok?: boolean;
  error?: string;
  message?: string;
  placeId?: string;
  placeName?: string;
  spotId?: string;
  spotLabel?: string;
  slot?: string;
  date?: string;
  checkedInAt?: string | null;
  checkedInAtJst?: string | null;
};

function ymdTodayJst() {
  return new Date().toLocaleDateString("sv-SE", {
    timeZone: "Asia/Tokyo",
  });
}

function CheckinInner() {
  const router = useRouter();
  const search = useSearchParams();

  const placeId = useMemo(
    () => String(search.get("placeId") ?? "").trim(),
    [search]
  );

  const slot = useMemo(
    () => String(search.get("slot") ?? "").trim(),
    [search]
  );

  const date = useMemo(
    () => String(search.get("date") ?? ymdTodayJst()).trim(),
    [search]
  );

  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<CheckinResponse | null>(null);

  const missingParams = !placeId || !slot || !date;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (missingParams) {
      setError("QRコードが正しくありません。placeId / slot / date を確認してください。");
      return;
    }

    if (!pin.trim()) {
      setError("PINコードを入力してください。");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/checkin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          placeId,
          slot,
          date,
          pin: pin.trim(),
        }),
      });

      const json = await res.json().catch(() => null);

      if (!json) {
        setError("チェックイン処理に失敗しました。");
        return;
      }

      if (!res.ok || json.ok === false) {
        setError(String(json.message ?? json.error ?? "チェックイン処理に失敗しました。"));
        setResult(json);
        return;
      }

      setResult(json);
      setCompleted(true);
      setPin("");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "通信エラーが発生しました。");
    } finally {
      setLoading(false);
    }
  }

  const placeName = result?.placeName ?? placeId;
  const spotLabel = result?.spotLabel ?? slot;
  const checkedInAt = result?.checkedInAtJst ?? result?.checkedInAt ?? "-";

  return (
    <main style={pageStyle}>
      <h1 style={titleStyle}>ParkTech チェックイン</h1>

      <div style={heroCardStyle}>
        <div style={heroPlaceStyle}>{placeName || "-"}</div>
        <div style={heroSlotStyle}>{spotLabel || "-"}</div>
        <div style={heroDateStyle}>利用日: {date || "-"}</div>
      </div>

      {completed ? (
        <>
          <div style={cardStyle}>
            <div style={successTitleStyle}>チェックイン完了</div>

            <div style={successMessageStyle}>チェックイン完了しました。</div>

            <div style={normalTextStyle}>
              駐車してコーンを戻してください。
            </div>

            <div style={normalTextStyle}>
              このまま画面を閉じてください。
            </div>

            <div style={{ ...normalTextStyle, marginBottom: 0 }}>
              出庫する際は再度QRコードを読み込んでください。
            </div>
          </div>

          <div style={cardStyle}>
            <div style={infoRowStyle}>
              <strong>駐車場:</strong> {placeName || "-"}
            </div>
            <div style={infoRowStyle}>
              <strong>区画:</strong> {spotLabel || "-"}
            </div>
            <div style={infoRowStyle}>
              <strong>利用日:</strong> {date || "-"}
            </div>
            <div style={infoRowStyle}>
              <strong>チェックイン時刻:</strong> {checkedInAt}
            </div>
          </div>

          <div
            style={{
              fontSize: 14,
              color: "#6b7280",
              textAlign: "center",
              marginBottom: 10,
            }}
          >
            出庫時は再度QRコードを読み込んでください
          </div>

          <button
            type="button"
            style={secondaryButtonStyle}
            onClick={() => router.push("/")}
          >
            完了（画面を閉じる）
          </button>
        </>
      ) : (
        <>
          <div style={cardStyle}>
            <div style={descriptionStyle}>
              予約者の方は、予約完了メールに記載されたPINコードを入力してください。
            </div>

            <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12 }}>
              <label style={labelStyle}>
                PINコード
                <input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="4桁のPINコード"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  style={inputStyle}
                  maxLength={8}
                  disabled={loading}
                />
              </label>

              {error ? <div style={errorStyle}>{error}</div> : null}

              <button
                type="submit"
                style={primaryButtonStyle}
                disabled={loading || missingParams}
              >
                {loading ? "チェックイン中..." : "チェックインする"}
              </button>
            </form>
          </div>

          <div style={subInfoStyle}>
            <div>
              <strong>駐車場:</strong> {placeId || "-"}
            </div>
            <div>
              <strong>区画:</strong> {slot || "-"}
            </div>
            <div>
              <strong>利用日:</strong> {date || "-"}
            </div>
          </div>
        </>
      )}
    </main>
  );
}

export default function CheckinPage() {
  return (
    <Suspense fallback={<main style={pageStyle}>読み込み中...</main>}>
      <CheckinInner />
    </Suspense>
  );
}

const pageStyle: React.CSSProperties = {
  maxWidth: 620,
  margin: "0 auto",
  padding: "24px 16px 56px",
  fontFamily:
    'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
};

const titleStyle: React.CSSProperties = {
  fontSize: 30,
  fontWeight: 900,
  marginBottom: 16,
};

const heroCardStyle: React.CSSProperties = {
  background: "#0f172a",
  color: "#fff",
  borderRadius: 18,
  padding: 20,
  marginBottom: 16,
};

const heroPlaceStyle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 700,
  marginBottom: 8,
};

const heroSlotStyle: React.CSSProperties = {
  fontSize: 42,
  fontWeight: 900,
  lineHeight: 1.1,
  marginBottom: 8,
};

const heroDateStyle: React.CSSProperties = {
  fontSize: 14,
  opacity: 0.9,
};

const cardStyle: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e5e5e5",
  borderRadius: 16,
  padding: 16,
  marginBottom: 16,
};

const descriptionStyle: React.CSSProperties = {
  lineHeight: 1.8,
  color: "#333",
  marginBottom: 12,
};

const labelStyle: React.CSSProperties = {
  display: "grid",
  gap: 8,
  fontWeight: 700,
  color: "#222",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "14px 16px",
  borderRadius: 14,
  border: "1px solid #d1d5db",
  fontSize: 20,
  letterSpacing: "0.2em",
};

const primaryButtonStyle: React.CSSProperties = {
  width: "100%",
  padding: "14px 18px",
  borderRadius: 14,
  border: "none",
  background: "#111827",
  color: "#fff",
  fontWeight: 800,
  fontSize: 16,
  cursor: "pointer",
};

const secondaryButtonStyle: React.CSSProperties = {
  width: "100%",
  padding: "14px 18px",
  borderRadius: 14,
  border: "1px solid #111827",
  background: "#fff",
  color: "#111",
  fontWeight: 800,
  fontSize: 16,
  cursor: "pointer",
};

const errorStyle: React.CSSProperties = {
  padding: 12,
  borderRadius: 12,
  background: "#fef2f2",
  color: "#b91c1c",
  fontSize: 14,
};

const subInfoStyle: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e5e5e5",
  borderRadius: 16,
  padding: 16,
  lineHeight: 1.9,
  fontSize: 14,
  color: "#555",
};

const successTitleStyle: React.CSSProperties = {
  fontSize: 28,
  fontWeight: 900,
  marginBottom: 12,
};

const successMessageStyle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 700,
  marginBottom: 12,
  color: "#166534",
};

const normalTextStyle: React.CSSProperties = {
  fontSize: 16,
  color: "#333",
  marginBottom: 8,
  lineHeight: 1.8,
};

const infoRowStyle: React.CSSProperties = {
  lineHeight: 1.9,
  fontSize: 15,
  color: "#333",
};