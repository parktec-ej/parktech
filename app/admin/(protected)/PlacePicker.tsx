"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type Place = {
  id: string;
  slug: string;
  name: string;
};

export default function PlacePicker() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);

  const currentPlaceId = String(searchParams.get("placeId") ?? "").trim();

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        const res = await fetch("/api/admin/places", { cache: "no-store" });
        const json = await res.json();

        if (!cancelled && json?.ok && Array.isArray(json.places)) {
          setPlaces(
            json.places.map((p: any) => ({
              id: String(p.id),
              slug: String(p.slug),
              name: String(p.name),
            }))
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, []);

  function onChange(nextPlaceId: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (nextPlaceId) {
      params.set("placeId", nextPlaceId);
    } else {
      params.delete("placeId");
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 260 }}>
      <span style={{ fontSize: 12, color: "#666", fontWeight: 700 }}>対象 Place</span>
      <select
        value={currentPlaceId}
        onChange={(e) => onChange(e.target.value)}
        disabled={loading}
        style={{
          padding: "10px 12px",
          borderRadius: 10,
          border: "1px solid #ddd",
          background: "#fff",
          fontWeight: 600,
        }}
      >
        <option value="">自動選択</option>
        {places.map((place) => (
          <option key={place.id} value={place.id}>
            {place.name} ({place.slug})
          </option>
        ))}
      </select>
    </label>
  );
}