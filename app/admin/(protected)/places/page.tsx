"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type SpotRow = {
  id: string;
  code: string;
  label: string | null;
  isActive: boolean;
  operationModeOverride: string | null;
};

type PlaceRow = {
  id: string;
  slug: string;
  name: string;
  address: string | null;
  googleMapUrl: string | null;
  isActive: boolean;
  operationMode: string | null;
  spots: SpotRow[];
};

type PlacesResponse = {
  ok: boolean;
  places?: PlaceRow[];
  error?: string;
  message?: string;
};

const PLACE_MODE_OPTIONS = [
  "RESERVATION_ONLY",
  "HOURLY_ONLY",
  "RESERVATION_THEN_HOURLY",
  "EVENT_ONLY",
  "CLOSED",
] as const;

const SPOT_MODE_OPTIONS = [
  "HOURLY_ONLY",
  "RESERVATION_ONLY",
  "RESERVATION_THEN_HOURLY",
  "EVENT_ONLY",
  "CLOSED",
] as const;

function ymdTodayJst() {
  return new Date().toLocaleDateString("sv-SE", {
    timeZone: "Asia/Tokyo",
  });
}

export default function AdminPlacesPage() {
  const [places, setPlaces] = useState<PlaceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  const [busyPlaceId, setBusyPlaceId] = useState<string | null>(null);
  const [busySpotId, setBusySpotId] = useState<string | null>(null);
  const [openingPlaceId, setOpeningPlaceId] = useState<string | null>(null);

  const [placeModes, setPlaceModes] = useState<Record<string, string>>({});
  const [spotModes, setSpotModes] = useState<Record<string, string>>({});
  const [calendarDates, setCalendarDates] = useState<Record<string, string>>({});

  const [newSpotCode, setNewSpotCode] = useState<Record<string, string>>({});
  const [newSpotLabel, setNewSpotLabel] = useState<Record<string, string>>({});
  const [newSpotMode, setNewSpotMode] = useState<Record<string, string>>({});

  async function loadPlaces() {
    setLoading(true);
    setErr("");

    try {
      const res = await fetch("/api/admin/places", {
        cache: "no-store",
      });

      const text = await res.text();
      let json: PlacesResponse | null = null;

      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        setErr(`Place APIがJSONを返していません (${res.status})`);
        setPlaces([]);
        return;
      }

      if (!json?.ok || !json.places) {
        setErr(json?.message ?? json?.error ?? "Place一覧の取得に失敗しました");
        setPlaces([]);
        return;
      }

      const nextPlaces = json.places;
      setPlaces(nextPlaces);

      const nextPlaceModes: Record<string, string> = {};
      const nextSpotModes: Record<string, string> = {};
      const nextCalendarDates: Record<string, string> = {};
      const nextNewSpotCode: Record<string, string> = {};
      const nextNewSpotLabel: Record<string, string> = {};
      const nextNewSpotMode: Record<string, string> = {};

      for (const place of nextPlaces) {
        nextPlaceModes[place.id] = place.operationMode || "HOURLY_ONLY";
        nextCalendarDates[place.id] = calendarDates[place.id] || ymdTodayJst();
        nextNewSpotCode[place.id] = newSpotCode[place.id] || "";
        nextNewSpotLabel[place.id] = newSpotLabel[place.id] || "";
        nextNewSpotMode[place.id] = newSpotMode[place.id] || "HOURLY_ONLY";

        for (const spot of place.spots) {
          nextSpotModes[spot.id] = spot.operationModeOverride || "HOURLY_ONLY";
        }
      }

      setPlaceModes(nextPlaceModes);
      setSpotModes(nextSpotModes);
      setCalendarDates(nextCalendarDates);
      setNewSpotCode(nextNewSpotCode);
      setNewSpotLabel(nextNewSpotLabel);
      setNewSpotMode(nextNewSpotMode);
    } catch (e: any) {
      setErr(String(e?.message ?? e));
      setPlaces([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPlaces();
  }, []);

  async function savePlaceMode(placeId: string) {
    setBusyPlaceId(placeId);
    setErr("");
    setMsg("");

    try {
      const res = await fetch("/api/admin/place-mode", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          placeId,
          operationMode: placeModes[placeId],
        }),
      });

      const json = await res.json();

      if (!json?.ok) {
        setErr(json?.message ?? json?.error ?? "Place営業モードの保存に失敗しました");
        return;
      }

      setMsg("Place営業モードを保存しました");
      await loadPlaces();
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setBusyPlaceId(null);
    }
  }

  async function saveSpotMode(spotId: string) {
    setBusySpotId(spotId);
    setErr("");
    setMsg("");

    try {
      const res = await fetch("/api/admin/spot-mode", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          spotId,
          operationModeOverride: spotModes[spotId],
        }),
      });

      const json = await res.json();

      if (!json?.ok) {
        setErr(json?.message ?? json?.error ?? "SLOTモード保存に失敗しました");
        return;
      }

      setMsg("SLOTモードを保存しました");
      await loadPlaces();
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setBusySpotId(null);
    }
  }

  async function createSpot(placeId: string) {
    setOpeningPlaceId(placeId);
    setErr("");
    setMsg("");

    try {
      const code = (newSpotCode[placeId] || "").trim().toUpperCase();
      const label = (newSpotLabel[placeId] || "").trim() || code;
      const operationModeOverride = newSpotMode[placeId] || "HOURLY_ONLY";

      if (!code) {
        setErr("SLOTコードを入力してください");
        return;
      }

      const res = await fetch("/api/admin/spots/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          placeId,
          code,
          label,
          operationModeOverride,
        }),
      });

      const json = await res.json();

      if (!json?.ok) {
        setErr(json?.message ?? json?.error ?? "SLOT追加に失敗しました");
        return;
      }

      setMsg(json?.reactivated ? "停止中SLOTを再開しました" : "SLOTを追加しました");

      setNewSpotCode((prev) => ({ ...prev, [placeId]: "" }));
      setNewSpotLabel((prev) => ({ ...prev, [placeId]: "" }));
      setNewSpotMode((prev) => ({ ...prev, [placeId]: "HOURLY_ONLY" }));

      await loadPlaces();
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setOpeningPlaceId(null);
    }
  }

  async function deactivateSpot(spotId: string, code: string) {
    if (!confirm(`${code} を停止しますか？`)) return;

    setBusySpotId(spotId);
    setErr("");
    setMsg("");

    try {
      const res = await fetch("/api/admin/spots/deactivate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ spotId }),
      });

      const json = await res.json();

      if (!json?.ok) {
        setErr(json?.message ?? json?.error ?? "SLOT停止に失敗しました");
        return;
      }

      setMsg(`${code} を停止しました`);
      await loadPlaces();
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setBusySpotId(null);
    }
  }

  async function reactivateSpot(spotId: string, code: string) {
    if (!confirm(`${code} を再開しますか？`)) return;

    setBusySpotId(spotId);
    setErr("");
    setMsg("");

    try {
      const res = await fetch("/api/admin/spots/reactivate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ spotId }),
      });

      const json = await res.json();

      if (!json?.ok) {
        setErr(json?.message ?? json?.error ?? "SLOT再開に失敗しました");
        return;
      }

      setMsg(`${code} を再開しました`);
      await loadPlaces();
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setBusySpotId(null);
    }
  }

  const visiblePlaces = useMemo(
    () => places.filter((p) => p.isActive !== false),
    [places]
  );

  return (
    <main style={pageStyle}>
      <div style={headerRowStyle}>
        <div>
          <h1 style={titleStyle}>Place 一覧</h1>
          <div style={subStyle}>Place管理 / SLOT管理 / 営業モード設定</div>
        </div>
      </div>

      {msg ? <div style={successStyle}>{msg}</div> : null}
      {err ? <div style={errorStyle}>{err}</div> : null}

      {loading ? (
        <div style={cardStyle}>読み込み中...</div>
      ) : visiblePlaces.length === 0 ? (
        <div style={cardStyle}>Place がありません。</div>
      ) : (
        <div style={listStyle}>
          {visiblePlaces.map((place) => {
            const activeSpots = place.spots.filter((s) => s.isActive);
            const inactiveSpots = place.spots.filter((s) => !s.isActive);

            return (
              <section key={place.id} style={placeCardStyle}>
                <div style={placeHeadStyle}>
                  <div>
                    <div style={placeNameStyle}>{place.name}</div>
                    <div style={metaStyle}>slug: {place.slug}</div>
                    <div style={metaStyle}>address: {place.address || "-"}</div>
                    <div style={metaStyle}>
                      Google Map:{" "}
                      {place.googleMapUrl ? (
                        <a
                          href={place.googleMapUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={linkStyle}
                        >
                          開く
                        </a>
                      ) : (
                        "-"
                      )}
                    </div>
                    <div style={metaStyle}>spot数: {activeSpots.length}</div>
                  </div>

                  <div>
                    <Link href={`/admin/places/${place.id}`} style={editButtonStyle}>
                      編集
                    </Link>
                  </div>
                </div>

                <div style={blockStyle}>
                  <div style={blockTitleStyle}>Place 営業モード</div>

                  <div style={rowStyle}>
                    <select
                      value={placeModes[place.id] ?? "HOURLY_ONLY"}
                      onChange={(e) =>
                        setPlaceModes((prev) => ({
                          ...prev,
                          [place.id]: e.target.value,
                        }))
                      }
                      style={selectStyle}
                    >
                      {PLACE_MODE_OPTIONS.map((mode) => (
                        <option key={mode} value={mode}>
                          {mode}
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      onClick={() => savePlaceMode(place.id)}
                      disabled={busyPlaceId === place.id}
                      style={saveButtonStyle}
                    >
                      {busyPlaceId === place.id ? "保存中..." : "保存"}
                    </button>
                  </div>

                  <div style={hintStyle}>
                    現在の Place モード: {place.operationMode || "-"}
                  </div>
                </div>

                <div style={calendarBlockStyle}>
                  <div style={blockTitleStyle}>日付別SLOT営業モード設定</div>

                  <div style={labelStyle}>対象日</div>
                  <div style={rowStyle}>
                    <input
                      type="date"
                      value={calendarDates[place.id] ?? ymdTodayJst()}
                      onChange={(e) =>
                        setCalendarDates((prev) => ({
                          ...prev,
                          [place.id]: e.target.value,
                        }))
                      }
                      style={dateInputStyle}
                    />

                    <Link
                      href={`/admin/spot-mode-calendar?placeId=${encodeURIComponent(
                        place.id
                      )}&date=${encodeURIComponent(
                        calendarDates[place.id] ?? ymdTodayJst()
                      )}`}
                      style={openButtonStyle}
                    >
                      開く
                    </Link>
                  </div>

                  <div style={hintStyle}>
                    指定日の各SLOT営業モードを設定します
                  </div>
                </div>

                <div style={spotAddBlockStyle}>
                  <div style={blockTitleStyle}>SLOT追加</div>

                  <div style={spotAddGridStyle}>
                    <div>
                      <div style={labelStyle}>コード</div>
                      <input
                        value={newSpotCode[place.id] ?? ""}
                        onChange={(e) =>
                          setNewSpotCode((prev) => ({
                            ...prev,
                            [place.id]: e.target.value.toUpperCase(),
                          }))
                        }
                        placeholder="例: A-06"
                        style={inputStyle}
                      />
                    </div>

                    <div>
                      <div style={labelStyle}>表示名</div>
                      <input
                        value={newSpotLabel[place.id] ?? ""}
                        onChange={(e) =>
                          setNewSpotLabel((prev) => ({
                            ...prev,
                            [place.id]: e.target.value,
                          }))
                        }
                        placeholder="例: A-06"
                        style={inputStyle}
                      />
                    </div>

                    <div>
                      <div style={labelStyle}>初期モード</div>
                      <select
                        value={newSpotMode[place.id] ?? "HOURLY_ONLY"}
                        onChange={(e) =>
                          setNewSpotMode((prev) => ({
                            ...prev,
                            [place.id]: e.target.value,
                          }))
                        }
                        style={selectStyle}
                      >
                        {SPOT_MODE_OPTIONS.map((mode) => (
                          <option key={mode} value={mode}>
                            {mode}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div style={{ display: "flex", alignItems: "end" }}>
                      <button
                        type="button"
                        onClick={() => createSpot(place.id)}
                        disabled={openingPlaceId === place.id}
                        style={saveButtonStyle}
                      >
                        {openingPlaceId === place.id ? "追加中..." : "追加"}
                      </button>
                    </div>
                  </div>

                  <div style={hintStyle}>
                    同じコードが停止中なら、そのSLOTを再利用して再開します。
                  </div>
                </div>

                <div style={{ marginTop: 16 }}>
                  {activeSpots.map((spot) => (
                    <div key={spot.id} style={spotCardStyle}>
                      <div style={spotCodeStyle}>{spot.code}</div>

                      <div style={spotModeAreaStyle}>
                        <select
                          value={spotModes[spot.id] ?? "HOURLY_ONLY"}
                          onChange={(e) =>
                            setSpotModes((prev) => ({
                              ...prev,
                              [spot.id]: e.target.value,
                            }))
                          }
                          style={selectStyle}
                        >
                          {SPOT_MODE_OPTIONS.map((mode) => (
                            <option key={mode} value={mode}>
                              {mode}
                            </option>
                          ))}
                        </select>

                        <div style={hintStyle}>
                          有効モード: {spot.operationModeOverride || "-"}
                        </div>
                      </div>

                      <div style={spotActionsStyle}>
                        <button
                          type="button"
                          onClick={() => saveSpotMode(spot.id)}
                          disabled={busySpotId === spot.id}
                          style={saveButtonStyle}
                        >
                          {busySpotId === spot.id ? "保存中..." : "保存"}
                        </button>

                        <button
                          type="button"
                          onClick={() => deactivateSpot(spot.id, spot.code)}
                          disabled={busySpotId === spot.id}
                          style={dangerButtonStyle}
                        >
                          {busySpotId === spot.id ? "処理中..." : "停止"}
                        </button>

                        <Link
                          href={`/admin/qr?place=${encodeURIComponent(place.slug)}&slot=${encodeURIComponent(spot.code)}`}
                          style={qrButtonStyle}
                        >
                          QR
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>

                {inactiveSpots.length > 0 && (
                  <div style={inactiveWrapStyle}>
                    <div style={inactiveTitleStyle}>停止中SLOT</div>

                    <div style={{ display: "grid", gap: 12 }}>
                      {inactiveSpots.map((spot) => (
                        <div key={spot.id} style={inactiveSpotRowStyle}>
                          <div>
                            <div style={spotCodeStyle}>{spot.code}</div>
                            <div style={metaStyle}>{spot.label || spot.code}</div>
                          </div>

                          <button
                            type="button"
                            onClick={() => reactivateSpot(spot.id, spot.code)}
                            disabled={busySpotId === spot.id}
                            style={secondaryButtonStyle}
                          >
                            {busySpotId === spot.id ? "処理中..." : "再開"}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}

const pageStyle: React.CSSProperties = {
  maxWidth: 1120,
  margin: "0 auto",
  padding: 24,
};

const headerRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 18,
};

const titleStyle: React.CSSProperties = {
  fontSize: 28,
  fontWeight: 900,
  margin: 0,
};

const subStyle: React.CSSProperties = {
  marginTop: 6,
  color: "#666",
  fontSize: 14,
};

const successStyle: React.CSSProperties = {
  marginBottom: 14,
  border: "1px solid #bbf7d0",
  background: "#f0fdf4",
  color: "#166534",
  borderRadius: 12,
  padding: 12,
  fontWeight: 700,
};

const errorStyle: React.CSSProperties = {
  marginBottom: 14,
  border: "1px solid #fecaca",
  background: "#fef2f2",
  color: "#b91c1c",
  borderRadius: 12,
  padding: 12,
  fontWeight: 700,
};

const cardStyle: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 16,
  background: "#fff",
  padding: 16,
};

const listStyle: React.CSSProperties = {
  display: "grid",
  gap: 18,
};

const placeCardStyle: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 18,
  background: "#fff",
  padding: 18,
};

const placeHeadStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 16,
  alignItems: "flex-start",
  marginBottom: 18,
};

const placeNameStyle: React.CSSProperties = {
  fontSize: 26,
  fontWeight: 900,
  marginBottom: 6,
};

const metaStyle: React.CSSProperties = {
  color: "#666",
  marginTop: 4,
};

const linkStyle: React.CSSProperties = {
  color: "#2563eb",
  textDecoration: "none",
  fontWeight: 700,
};

const editButtonStyle: React.CSSProperties = {
  display: "inline-block",
  textDecoration: "none",
  padding: "12px 18px",
  borderRadius: 12,
  background: "#111",
  color: "#fff",
  fontWeight: 800,
};

const blockStyle: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 16,
  padding: 14,
  marginBottom: 14,
};

const calendarBlockStyle: React.CSSProperties = {
  border: "1px solid #bfdbfe",
  background: "#eff6ff",
  borderRadius: 16,
  padding: 14,
  marginBottom: 14,
};

const spotAddBlockStyle: React.CSSProperties = {
  border: "1px solid #dbeafe",
  background: "#f8fbff",
  borderRadius: 16,
  padding: 14,
  marginBottom: 14,
};

const blockTitleStyle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 900,
  marginBottom: 12,
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#666",
  marginBottom: 6,
  fontWeight: 700,
};

const rowStyle: React.CSSProperties = {
  display: "flex",
  gap: 12,
  alignItems: "center",
  flexWrap: "wrap",
};

const hintStyle: React.CSSProperties = {
  marginTop: 8,
  color: "#666",
  fontSize: 12,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #d1d5db",
  background: "#fff",
  fontSize: 14,
};

const selectStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #d1d5db",
  background: "#fff",
  fontSize: 14,
};

const dateInputStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 220,
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #d1d5db",
  background: "#fff",
  fontSize: 14,
};

const saveButtonStyle: React.CSSProperties = {
  padding: "10px 16px",
  borderRadius: 10,
  border: "1px solid #111",
  background: "#111",
  color: "#fff",
  fontWeight: 800,
  cursor: "pointer",
  minWidth: 84,
};

const openButtonStyle: React.CSSProperties = {
  display: "inline-block",
  textDecoration: "none",
  padding: "10px 16px",
  borderRadius: 10,
  border: "1px solid #111",
  background: "#111",
  color: "#fff",
  fontWeight: 800,
  minWidth: 84,
  textAlign: "center",
};

const dangerButtonStyle: React.CSSProperties = {
  padding: "10px 16px",
  borderRadius: 10,
  border: "1px solid #dc2626",
  background: "#fff",
  color: "#dc2626",
  fontWeight: 800,
  cursor: "pointer",
  minWidth: 84,
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: "10px 16px",
  borderRadius: 10,
  border: "1px solid #2563eb",
  background: "#fff",
  color: "#2563eb",
  fontWeight: 800,
  cursor: "pointer",
  minWidth: 84,
};

const spotAddGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "180px 1fr 260px auto",
  gap: 12,
  alignItems: "end",
};

const spotCardStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "120px 1fr auto",
  gap: 14,
  alignItems: "center",
  border: "1px solid #e5e7eb",
  borderRadius: 14,
  padding: 14,
  background: "#fff",
  marginBottom: 12,
};

const spotCodeStyle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 900,
};

const spotModeAreaStyle: React.CSSProperties = {
  minWidth: 0,
};

const spotActionsStyle: React.CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
};

const inactiveWrapStyle: React.CSSProperties = {
  marginTop: 18,
  borderTop: "1px solid #e5e7eb",
  paddingTop: 14,
};

const inactiveTitleStyle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 900,
  marginBottom: 10,
};

const qrButtonStyle: React.CSSProperties = {
  display: "inline-block",
  textDecoration: "none",
  padding: "10px 16px",
  borderRadius: 10,
  border: "1px solid #7c3aed",
  background: "#fff",
  color: "#7c3aed",
  fontWeight: 800,
  minWidth: 84,
  textAlign: "center",
};

const inactiveSpotRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  padding: 12,
  background: "#fafafa",
};