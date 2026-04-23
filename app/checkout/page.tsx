"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type CheckoutResponse = {
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
  checkedOutAt?: string | null;
  checkedInAtJst?: string | null;
  checkedOutAtJst?: string | null;
  minutes?: number | null;
  totalYen?: number | null;
  paid?: boolean;
};

function ymdTodayJst() {
  return new Date().toLocaleDateString("sv-SE", {
    timeZone: "Asia/Tokyo",
  });
}

function fmtYen(value?: number | null) {
  return `${Number(value ?? 0).toLocaleString("ja-JP")} 円`;
}

export default function CheckoutPage() {
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
  const [result, setResult] = useState<CheckoutResponse | null>(null);

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
      const res = await fetch("/api/checkout", {
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
        setError("出庫処理に失敗しました。");
        return;
      }

      if (!res.ok || json.ok === false) {
        setError(String(json.message ?? json.error ?? "出庫処理に失敗しました。"));
        setResult(json);
        return;
      }

      setResult(json);
      setCompleted(true);
      setPin("");
    } catch (e: any) {
      setError(String(e?.message ?? "通信エラーが発生しました。"));
    } finally {
      setLoading(false);
    }
  }

  const placeName = result?.placeName ?? placeId;
  const spotLabel = result?.spotLabel ?? slot;
  const checkedInAt = result?.checkedInAtJst ?? result?.checkedInAt ?? "-";
  const checkedOutAt = result?.checkedOutAtJst ?? result?.checkedOutAt ?? "-";
  const minutes = result?.minutes ?? 0;
  const totalYen = result?.totalYen ?? 0;
  const paid = result?.paid ?? false;

  return (
    <main style={pageStyle}>
      <h1 style={titleStyle}>出庫</h1>

      <div style={heroCardStyle}>
        <div style={heroPlaceStyle}>駐車場ID: {placeId || "-"}</div>
        <div style={heroInfoStyle}>車室: {slot || "-"}</div>
        <div style={heroInfoStyle}>日付: {date || "-"}</div>
      </div>

      {completed ? (
        <>
          <div style={cardStyle}>
            <div style={successMessageStyle}>
              出庫が完了しました。ありがとうございました。
            </div>

            <div style={normalTextStyle}>
              コーンを元の位置に戻してお帰りください。
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
              <strong>入庫時間:</strong> {checkedInAt}
            </div>
            <div style={infoRowStyle}>
              <strong>出庫時間:</strong> {checkedOutAt}
            </div>
            <div style={infoRowStyle}>
              <strong>利用時間:</strong> {minutes} 分
            </div>
            <div style={infoRowStyle}>
              <strong>お支払い金額:</strong> {fmtYen(totalYen)}
            </div>
            <div
              style={{
                ...infoRowStyle,
                color: paid ? "#16a34a" : "#b45309",
                fontWeight: 800,
              }}
            >
              {paid ? "決済済みです" : "未決済です"}
            </div>
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
            <form onSubmit={handleSubmit} style={{ display: "grid", gap: 16 }}>
              <label style={labelStyle}>
                PINコード
                <input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="4桁のPIN"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  style={inputStyle}
                  maxLength={8}
                  disabled={loading}
                />
              </label>

              {error ? <div style={errorStyle}>{error}</div> : null}

              <div style={descriptionStyle}>
                出庫する場合は PIN を入力して、下のボタンを押してください。
              </div>

              <button
                type="submit"
                style={primaryButtonStyle}
                disabled={loading || missingParams}
              >
                {loading ? "出庫処理中..." : "出庫する"}
              </button>
            </form>
          </div>
        </>
      )}
    </main>
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
  background: "#f7f7f7",
  border: "1px solid #ececec",
  borderRadius: 18,
  padding: 20,
  marginBottom: 16,
};

const heroPlaceStyle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 700,
  marginBottom: 8,
  color: "#222",
};

const heroInfoStyle: React.CSSProperties = {
  fontSize: 16,
  color: "#222",
  marginBottom: 6,
};

const cardStyle: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e5e5e5",
  borderRadius: 16,
  padding: 16,
  marginBottom: 16,
};

const labelStyle: React.CSSProperties = {
  display: "grid",
  gap: 8,
  fontWeight: 700,
  color: "#666",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "14px 16px",
  borderRadius: 14,
  border: "1px solid #d1d5db",
  fontSize: 20,
};

const descriptionStyle: React.CSSProperties = {
  lineHeight: 1.8,
  color: "#333",
  fontSize: 16,
};

const primaryButtonStyle: React.CSSProperties = {
  width: "100%",
  padding: "14px 18px",
  borderRadius: 14,
  border: "none",
  background: "#111",
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

const successMessageStyle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 700,
  marginBottom: 8,
  color: "#333",
};

const normalTextStyle: React.CSSProperties = {
  fontSize: 16,
  color: "#333",
  lineHeight: 1.8,
};

const infoRowStyle: React.CSSProperties = {
  lineHeight: 1.9,
  fontSize: 15,
  color: "#333",
};