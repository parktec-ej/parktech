"use client";

import { useEffect, useState } from "react";

type SpotItem = {
  id: string;
  code: string;
  label: string | null;
  isActive: boolean;
  operationModeOverride: null | "RESERVATION_ONLY" | "HOURLY_ONLY" | "RESERVATION_THEN_HOURLY";
};

type PlaceItem = {
  id: string;
  slug: string;
  name: string;
  address: string | null;
  operationMode: "RESERVATION_ONLY" | "HOURLY_ONLY" | "RESERVATION_THEN_HOURLY";
  isActive: boolean;
  spotCount: number;
  spots: SpotItem[];
};

export default function AdminPlacesPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingSpotId, setSavingSpotId] = useState<string | null>(null);
  const [savingPlaceId, setSavingPlaceId] = useState<string | null>(null);
  const [places, setPlaces] = useState<PlaceItem[]>([]);
  const [spotModes, setSpotModes] = useState<Record<string, string>>({});
  const [placeModes, setPlaceModes] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [address, setAddress] = useState("");
  const [spotCount, setSpotCount] = useState(10);
  const [operationMode, setOperationMode] = useState<
    "RESERVATION_ONLY" | "HOURLY_ONLY" | "RESERVATION_THEN_HOURLY"
  >("RESERVATION_THEN_HOURLY");

  async function loadPlaces() {
    setLoading(true);
    setErr("");
    try {
      const res = await fetch("/api/admin/places", { cache: "no-store" });
      const json = await res.json();

      if (!json.ok) {
        setErr(json.error ?? "読み込みに失敗しました");
        return;
      }

      const nextPlaces = json.places ?? [];
      setPlaces(nextPlaces);

      const nextSpotModes: Record<string, string> = {};
      const nextPlaceModes: Record<string, string> = {};

      for (const place of nextPlaces) {
        nextPlaceModes[place.id] = place.operationMode;
        for (const spot of place.spots) {
          nextSpotModes[spot.id] = spot.operationModeOverride ?? "";
        }
      }

      setSpotModes(nextSpotModes);
      setPlaceModes(nextPlaceModes);
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPlaces();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg("");
    setErr("");

    try {
      const res = await fetch("/api/admin/places", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          slug,
          address,
          spotCount,
          operationMode,
        }),
      });

      const json = await res.json();

      if (!json.ok) {
        if (json.error === "slug_already_exists") {
          setErr("その slug はすでに使われています");
        } else {
          setErr(json.message ?? json.error ?? "作成に失敗しました");
        }
        return;
      }

      setMsg("Place を作成しました");
      setName("");
      setSlug("");
      setAddress("");
      setSpotCount(10);
      setOperationMode("RESERVATION_THEN_HOURLY");
      await loadPlaces();
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setSaving(false);
    }
  }

  async function savePlaceMode(placeId: string) {
    setSavingPlaceId(placeId);
    setMsg("");
    setErr("");

    try {
      const res = await fetch("/api/admin/place-mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          placeId,
          operationMode: placeModes[placeId],
        }),
      });

      const json = await res.json();

      if (!json.ok) {
        setErr(json.message ?? json.error ?? "Place設定の保存に失敗しました");
        return;
      }

      setMsg("Place の営業モードを保存しました");
      await loadPlaces();
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setSavingPlaceId(null);
    }
  }

  async function saveSpotMode(spotId: string) {
    setSavingSpotId(spotId);
    setMsg("");
    setErr("");

    try {
      const res = await fetch("/api/admin/spot-mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          spotId,
          operationModeOverride: spotModes[spotId] || null,
        }),
      });

      const json = await res.json();

      if (!json.ok) {
        setErr(json.message ?? json.error ?? "Spot設定の保存に失敗しました");
        return;
      }

      setMsg("Spot の営業モードを保存しました");
      await loadPlaces();
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setSavingSpotId(null);
    }
  }

  return (
    <main style={{ maxWidth: 1080, margin: "0 auto", padding: 24 }}>
      <h1 style={{ fontSize: 28, fontWeight: 900, marginBottom: 16 }}>
        Place 管理
      </h1>

      <div
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 16,
          background: "#fff",
          padding: 16,
          marginBottom: 24,
        }}
      >
        <h2 style={{ fontSize: 20, fontWeight: 800, marginTop: 0, marginBottom: 16 }}>
          新規 Place 追加
        </h2>

        <form onSubmit={submit}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <div style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>名称</div>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例: ParkTech 利府第2駐車場"
                style={{
                  width: "100%",
                  padding: 12,
                  borderRadius: 12,
                  border: "1px solid #d1d5db",
                }}
              />
            </div>

            <div>
              <div style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>slug</div>
              <input
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="例: rifu-2"
                style={{
                  width: "100%",
                  padding: 12,
                  borderRadius: 12,
                  border: "1px solid #d1d5db",
                }}
              />
            </div>

            <div style={{ gridColumn: "1 / -1" }}>
              <div style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>住所</div>
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="例: 宮城県宮城郡利府町..."
                style={{
                  width: "100%",
                  padding: 12,
                  borderRadius: 12,
                  border: "1px solid #d1d5db",
                }}
              />
            </div>

            <div>
              <div style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>スロット数</div>
              <input
                type="number"
                min={1}
                max={300}
                value={spotCount}
                onChange={(e) => setSpotCount(Number(e.target.value))}
                style={{
                  width: "100%",
                  padding: 12,
                  borderRadius: 12,
                  border: "1px solid #d1d5db",
                }}
              />
            </div>

            <div>
              <div style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>営業モード</div>
              <select
                value={operationMode}
                onChange={(e) =>
                  setOperationMode(
                    e.target.value as
                      | "RESERVATION_ONLY"
                      | "HOURLY_ONLY"
                      | "RESERVATION_THEN_HOURLY"
                  )
                }
                style={{
                  width: "100%",
                  padding: 12,
                  borderRadius: 12,
                  border: "1px solid #d1d5db",
                  background: "#fff",
                }}
              >
                <option value="RESERVATION_ONLY">RESERVATION_ONLY</option>
                <option value="HOURLY_ONLY">HOURLY_ONLY</option>
                <option value="RESERVATION_THEN_HOURLY">RESERVATION_THEN_HOURLY</option>
              </select>
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            style={{
              marginTop: 16,
              padding: "12px 16px",
              borderRadius: 12,
              border: "1px solid #111",
              background: "#111",
              color: "#fff",
              fontWeight: 800,
              cursor: "pointer",
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? "作成中..." : "Place を作成する"}
          </button>
        </form>

        {msg ? <div style={{ marginTop: 12, color: "green", fontWeight: 700 }}>{msg}</div> : null}
        {err ? <div style={{ marginTop: 12, color: "crimson", fontWeight: 700 }}>{err}</div> : null}
      </div>

      <div
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 16,
          background: "#fff",
          padding: 16,
        }}
      >
        <h2 style={{ fontSize: 20, fontWeight: 800, marginTop: 0, marginBottom: 16 }}>
          Place 一覧
        </h2>

        {loading ? (
          <div>読み込み中...</div>
        ) : places.length === 0 ? (
          <div>まだ Place がありません。</div>
        ) : (
          <div style={{ display: "grid", gap: 16 }}>
            {places.map((place) => (
              <div
                key={place.id}
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: 14,
                  padding: 16,
                  background: "#fafafa",
                }}
              >
                <div style={{ fontSize: 20, fontWeight: 900 }}>{place.name}</div>
                <div style={{ marginTop: 4, fontSize: 13, color: "#666" }}>
                  slug: {place.slug}
                </div>
                <div style={{ marginTop: 4, fontSize: 13, color: "#666" }}>
                  address: {place.address || "未設定"}
                </div>
                <div style={{ marginTop: 4, fontSize: 13, color: "#666" }}>
                  spot数: {place.spotCount}
                </div>

                <div
                  style={{
                    marginTop: 14,
                    padding: 12,
                    borderRadius: 12,
                    background: "#fff",
                    border: "1px solid #e5e7eb",
                  }}
                >
                  <div style={{ fontWeight: 800, marginBottom: 8 }}>Place 営業モード</div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr auto",
                      gap: 10,
                      alignItems: "center",
                    }}
                  >
                    <div>
                      <select
                        value={placeModes[place.id] ?? place.operationMode}
                        onChange={(e) =>
                          setPlaceModes((prev) => ({
                            ...prev,
                            [place.id]: e.target.value,
                          }))
                        }
                        style={{
                          width: "100%",
                          padding: 10,
                          borderRadius: 10,
                          border: "1px solid #d1d5db",
                          background: "#fff",
                        }}
                      >
                        <option value="RESERVATION_ONLY">RESERVATION_ONLY</option>
                        <option value="HOURLY_ONLY">HOURLY_ONLY</option>
                        <option value="RESERVATION_THEN_HOURLY">
                          RESERVATION_THEN_HOURLY
                        </option>
                      </select>
                      <div style={{ marginTop: 6, fontSize: 12, color: "#666" }}>
                        現在の Place モード: {place.operationMode}
                      </div>
                    </div>

                    <button
                      onClick={() => savePlaceMode(place.id)}
                      disabled={savingPlaceId === place.id}
                      style={{
                        padding: "10px 14px",
                        borderRadius: 10,
                        border: "1px solid #111",
                        background: "#111",
                        color: "#fff",
                        fontWeight: 800,
                        cursor: "pointer",
                        opacity: savingPlaceId === place.id ? 0.7 : 1,
                      }}
                    >
                      {savingPlaceId === place.id ? "保存中..." : "保存"}
                    </button>
                  </div>
                </div>

                <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
                  {place.spots.map((spot) => {
                    const currentValue = spotModes[spot.id] ?? "";
                    const effectiveMode = currentValue || (placeModes[place.id] ?? place.operationMode);

                    return (
                      <div
                        key={spot.id}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "120px 1fr auto",
                          gap: 10,
                          alignItems: "center",
                          padding: 10,
                          borderRadius: 12,
                          background: "#fff",
                          border: "1px solid #e5e7eb",
                        }}
                      >
                        <div style={{ fontWeight: 800 }}>{spot.label || spot.code}</div>

                        <div>
                          <select
                            value={currentValue}
                            onChange={(e) =>
                              setSpotModes((prev) => ({
                                ...prev,
                                [spot.id]: e.target.value,
                              }))
                            }
                            style={{
                              width: "100%",
                              padding: 10,
                              borderRadius: 10,
                              border: "1px solid #d1d5db",
                              background: "#fff",
                            }}
                          >
                            <option value="">継承（Place設定を使う）</option>
                            <option value="RESERVATION_ONLY">RESERVATION_ONLY</option>
                            <option value="HOURLY_ONLY">HOURLY_ONLY</option>
                            <option value="RESERVATION_THEN_HOURLY">
                              RESERVATION_THEN_HOURLY
                            </option>
                          </select>
                          <div style={{ marginTop: 6, fontSize: 12, color: "#666" }}>
                            有効モード: {effectiveMode}
                          </div>
                        </div>

                        <button
                          onClick={() => saveSpotMode(spot.id)}
                          disabled={savingSpotId === spot.id}
                          style={{
                            padding: "10px 14px",
                            borderRadius: 10,
                            border: "1px solid #111",
                            background: "#111",
                            color: "#fff",
                            fontWeight: 800,
                            cursor: "pointer",
                            opacity: savingSpotId === spot.id ? 0.7 : 1,
                          }}
                        >
                          {savingSpotId === spot.id ? "保存中..." : "保存"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}