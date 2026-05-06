"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function ymdTodayJst() {
  return new Date().toLocaleDateString("sv-SE", {
    timeZone: "Asia/Tokyo",
  });
}

function ymdMinusDaysJst(days: number) {
  const now = new Date();
  const past = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return past.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}

type StatusFilter = "ALL" | "IN" | "OUT" | "RESERVATION_ONLY";

type SessionRow = {
  id: string;
  sessionType: "RESERVATION" | "HOURLY";
  plate: string | null;
  phone: string | null;
  customerName: string | null;
  paid: boolean;
  paidAt: string | null;
  paymentRef: string | null;
  totalMinutes: number | null;
  totalYen: number | null;
  checkInAt: string | null;
  checkOutAt: string | null;
  status: "IN" | "OUT" | "RESERVATION_ONLY";
  createdAt: string;
  spot: {
    id: string;
    code: string;
    label: string | null;
  } | null;
  reservation: {
    id: string;
    date: string;
    slot: string;
    name: string;
  } | null;
};

type ApiResponse = {
  ok: boolean;
  place?: {
    id: string;
    slug: string;
    name: string;
    address: string | null;
  };
  filters?: {
    startDate: string;
    endDate: string;
    status: string;
    q: string;
  };
  summary?: {
    total: number;
    inCount: number;
    outCount: number;
    reservationOnlyCount: number;
  };
  sessions?: SessionRow[];
  error?: string;
  message?: string;
};

type PlaceOption = {
  id: string;
  slug: string;
  name: string;
  address: string | null;
  isActive: boolean;
};

type PlacesResponse = {
  ok: boolean;
  places?: Array<{
    id: string;
    slug: string;
    name: string;
    address: string | null;
    isActive: boolean;
  }>;
  error?: string;
  message?: string;
};

function fmtDateTime(value: string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
}

function statusLabel(status: SessionRow["status"]) {
  switch (status) {
    case "IN":
      return "入庫中";
    case "OUT":
      return "出庫済み";
    case "RESERVATION_ONLY":
      return "予約のみ";
  }
}

function sessionTypeLabel(type: SessionRow["sessionType"]) {
  return type === "HOURLY" ? "時間貸し" : "予約";
}

function updateUrl(
  router: ReturnType<typeof useRouter>,
  current: URLSearchParams,
  patch: Record<string, string>
) {
  const next = new URLSearchParams(current.toString());

  Object.entries(patch).forEach(([key, value]) => {
    if (value === "") {
      next.delete(key);
    } else {
      next.set(key, value);
    }
  });

  const qs = next.toString();
  router.replace(
    qs ? `/admin/parking-sessions?${qs}` : "/admin/parking-sessions",
    { scroll: false }
  );
}

function AdminParkingSessionsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const initialStartDate =
    searchParams.get("startDate") ?? ymdMinusDaysJst(30);
  const initialEndDate = searchParams.get("endDate") ?? ymdTodayJst();
  const initialStatusRaw = (searchParams.get("status") ?? "ALL").toUpperCase();
  const initialStatus: StatusFilter =
    initialStatusRaw === "IN" ||
    initialStatusRaw === "OUT" ||
    initialStatusRaw === "RESERVATION_ONLY"
      ? initialStatusRaw
      : "ALL";
  const initialQ = searchParams.get("q") ?? "";
  const initialPlaceId = searchParams.get("placeId") ?? "";

  const [placeId, setPlaceId] = useState(initialPlaceId);
  const [startDate, setStartDate] = useState(initialStartDate);
  const [endDate, setEndDate] = useState(initialEndDate);
  const [status, setStatus] = useState<StatusFilter>(initialStatus);
  const [qInput, setQInput] = useState(initialQ);
  const [qApplied, setQApplied] = useState(initialQ);

  const [placesLoading, setPlacesLoading] = useState(true);
  const [placesErr, setPlacesErr] = useState("");
  const [places, setPlaces] = useState<PlaceOption[]>([]);

  const [loading, setLoading] = useState(true);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [data, setData] = useState<ApiResponse | null>(null);

  const currentSearchParams = useMemo(
    () => new URLSearchParams(searchParams.toString()),
    [searchParams]
  );

  async function loadPlaces() {
    setPlacesLoading(true);
    setPlacesErr("");

    try {
      const res = await fetch("/api/admin/places", { cache: "no-store" });
      const text = await res.text();
      let json: PlacesResponse | null = null;

      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        setPlacesErr(`Place APIがJSONを返していません (${res.status})`);
        setPlaces([]);
        return;
      }

      if (!json?.ok || !json.places) {
        setPlacesErr(
          json?.message ?? json?.error ?? "Place一覧の取得に失敗しました"
        );
        setPlaces([]);
        return;
      }

      const activePlaces = json.places.filter((p) => p.isActive !== false);
      setPlaces(activePlaces);

      if (!placeId && activePlaces.length > 0) {
        const nextPlaceId = activePlaces[0].id;
        setPlaceId(nextPlaceId);
        updateUrl(router, currentSearchParams, {
          placeId: nextPlaceId,
          startDate,
          endDate,
          status,
          q: qApplied,
        });
      }
    } catch (e: any) {
      setPlacesErr(String(e?.message ?? e));
      setPlaces([]);
    } finally {
      setPlacesLoading(false);
    }
  }

  async function loadSessions(target: {
    placeId: string;
    startDate: string;
    endDate: string;
    status: StatusFilter;
    q: string;
  }) {
    if (!target.placeId) {
      setLoading(false);
      setData(null);
      setErr("placeId が未選択です");
      return;
    }

    setLoading(true);
    setErr("");

    try {
      const params = new URLSearchParams({
        placeId: target.placeId,
        status: target.status,
      });
      if (target.startDate) params.set("startDate", target.startDate);
      if (target.endDate) params.set("endDate", target.endDate);
      if (target.q) params.set("q", target.q);

      const res = await fetch(
        `/api/admin/parking-sessions?${params.toString()}`,
        { cache: "no-store" }
      );

      const text = await res.text();
      let json: ApiResponse | null = null;

      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        setErr(`APIがJSONを返していません (${res.status})`);
        setData(null);
        return;
      }

      if (!json?.ok) {
        setErr(json?.message ?? json?.error ?? "読み込みに失敗しました");
        setData(null);
        return;
      }

      setData(json);
    } catch (e: any) {
      setErr(String(e?.message ?? e));
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPlaces();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!placeId) return;

    updateUrl(router, currentSearchParams, {
      placeId,
      startDate,
      endDate,
      status,
      q: qApplied,
    });

    loadSessions({ placeId, startDate, endDate, status, q: qApplied });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placeId, startDate, endDate, status, qApplied]);

  async function doForceCheckout(parkingSessionId: string) {
    if (!confirm("このセッションを強制出庫しますか？\n※ 精算完了にはなりません。"))
      return;

    setActionBusyId(parkingSessionId);
    setErr("");
    setMsg("");

    try {
      const res = await fetch("/api/admin/parking-sessions/force-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parkingSessionId }),
      });

      const text = await res.text();
      let json: any = null;

      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        setErr(`強制出庫APIがJSONを返していません (${res.status})`);
        return;
      }

      if (!json?.ok) {
        setErr(json?.message ?? json?.error ?? "強制出庫に失敗しました");
        return;
      }

      setMsg("強制出庫を実行しました");
      await loadSessions({ placeId, startDate, endDate, status, q: qApplied });
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setActionBusyId(null);
    }
  }

  const summary = data?.summary ?? {
    total: 0,
    inCount: 0,
    outCount: 0,
    reservationOnlyCount: 0,
  };

  return (
    <main style={{ maxWidth: 1180, margin: "0 auto", padding: 24 }}>
      <h1 style={{ fontSize: 28, fontWeight: 900, marginBottom: 8 }}>
        ParkingSession 管理
      </h1>

      <div style={{ color: "#666", marginBottom: 16 }}>
        対象 Place: {data?.place?.name ?? (placeId ? placeId : "未選択")}
      </div>

      <div
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 16,
          background: "#fff",
          padding: 16,
          marginBottom: 16,
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "260px 160px 160px 1fr auto auto",
            gap: 12,
            alignItems: "end",
          }}
        >
          <div>
            <div style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>
              Place
            </div>
            <select
              value={placeId}
              onChange={(e) => setPlaceId(e.target.value)}
              disabled={placesLoading || places.length === 0}
              style={inputStyle}
            >
              {!placeId && <option value="">選択してください</option>}
              {places.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.slug})
                </option>
              ))}
            </select>
          </div>

          <div>
            <div style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>
              開始日
            </div>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              style={inputStyle}
            />
          </div>

          <div>
            <div style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>
              終了日
            </div>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              style={inputStyle}
            />
          </div>

          <div>
            <div style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>
              検索（区画 / 車番 / 電話 / 氏名）
            </div>
            <input
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") setQApplied(qInput.trim());
              }}
              placeholder="A-05 / TEST / 090..."
              style={inputStyle}
            />
          </div>

          <button
            type="button"
            onClick={() => setQApplied(qInput.trim())}
            style={buttonStyle}
          >
            検索
          </button>

          <button
            type="button"
            onClick={() => {
              setStartDate("");
              setEndDate("");
              setQInput("");
              setQApplied("");
            }}
            style={secondaryButtonStyle}
            title="日付・キーワードをクリア（全期間検索）"
          >
            クリア
          </button>
        </div>

        {/* Status filter buttons with count badges */}
        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            marginTop: 16,
          }}
        >
          <StatusButton
            label="すべて"
            count={summary.total}
            active={status === "ALL"}
            onClick={() => setStatus("ALL")}
          />
          <StatusButton
            label="入庫中"
            count={summary.inCount}
            active={status === "IN"}
            onClick={() => setStatus("IN")}
          />
          <StatusButton
            label="出庫済み"
            count={summary.outCount}
            active={status === "OUT"}
            onClick={() => setStatus("OUT")}
          />
          <StatusButton
            label="予約のみ"
            count={summary.reservationOnlyCount}
            active={status === "RESERVATION_ONLY"}
            onClick={() => setStatus("RESERVATION_ONLY")}
          />
        </div>

        {placesErr ? (
          <div style={{ marginTop: 12, color: "crimson", fontWeight: 700 }}>
            {placesErr}
          </div>
        ) : null}
      </div>

      {err ? (
        <div
          style={{
            border: "1px solid #fecaca",
            background: "#fef2f2",
            color: "#b91c1c",
            borderRadius: 12,
            padding: 12,
            marginBottom: 16,
          }}
        >
          {err}
        </div>
      ) : null}

      {msg ? (
        <div
          style={{
            border: "1px solid #bbf7d0",
            background: "#f0fdf4",
            color: "#166534",
            borderRadius: 12,
            padding: 12,
            marginBottom: 16,
          }}
        >
          {msg}
        </div>
      ) : null}

      <div
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 16,
          background: "#fff",
          padding: 16,
        }}
      >
        {loading ? (
          <div>読み込み中...</div>
        ) : !placeId ? (
          <div style={{ color: "#666" }}>Place を選択してください。</div>
        ) : !data?.sessions?.length ? (
          <div style={{ color: "#666" }}>該当セッションはありません。</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={thStyle}>区画</th>
                  <th style={thStyle}>種別</th>
                  <th style={thStyle}>状態</th>
                  <th style={thStyle}>車番</th>
                  <th style={thStyle}>電話</th>
                  <th style={thStyle}>氏名</th>
                  <th style={thStyle}>入庫時刻</th>
                  <th style={thStyle}>出庫時刻</th>
                  <th style={thStyle}>料金</th>
                  <th style={thStyle}>精算</th>
                  <th style={thStyle}>操作</th>
                </tr>
              </thead>
              <tbody>
                {data.sessions.map((row) => (
                  <tr key={row.id}>
                    <td style={tdStyle}>
                      {row.spot?.label ?? row.spot?.code ?? "-"}
                    </td>
                    <td style={tdStyle}>{sessionTypeLabel(row.sessionType)}</td>
                    <td style={tdStyle}>{statusLabel(row.status)}</td>
                    <td style={tdStyle}>{row.plate ?? "-"}</td>
                    <td style={tdStyle}>{row.phone ?? "-"}</td>
                    <td style={tdStyle}>{row.customerName ?? "-"}</td>
                    <td style={tdStyle}>{fmtDateTime(row.checkInAt)}</td>
                    <td style={tdStyle}>{fmtDateTime(row.checkOutAt)}</td>
                    <td style={tdStyle}>
                      {row.totalYen != null
                        ? `${row.totalYen.toLocaleString()}円`
                        : "-"}
                    </td>
                    <td style={tdStyle}>{row.paid ? "済" : "未"}</td>
                    <td style={tdStyle}>
                      {row.status === "IN" ? (
                        <button
                          type="button"
                          onClick={() => doForceCheckout(row.id)}
                          disabled={actionBusyId === row.id}
                          style={dangerButtonStyle}
                        >
                          {actionBusyId === row.id ? "処理中..." : "強制出庫"}
                        </button>
                      ) : (
                        <span style={{ color: "#666" }}>-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}

export default function AdminParkingSessionsPage() {
  return (
    <Suspense
      fallback={
        <main style={{ maxWidth: 1180, margin: "0 auto", padding: 24 }}>
          読み込み中...
        </main>
      }
    >
      <AdminParkingSessionsPageInner />
    </Suspense>
  );
}

function StatusButton({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "10px 14px",
        borderRadius: 999,
        border: active ? "1px solid #2563eb" : "1px solid #d1d5db",
        background: active ? "#2563eb" : "#fff",
        color: active ? "#fff" : "#111",
        fontWeight: 700,
        cursor: "pointer",
        fontSize: 14,
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
      }}
    >
      <span>{label}</span>
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          minWidth: 28,
          padding: "2px 8px",
          borderRadius: 999,
          background: active ? "rgba(255,255,255,0.2)" : "#f1f5f9",
          color: active ? "#fff" : "#111",
          fontSize: 12,
          fontWeight: 800,
        }}
      >
        {count}
      </span>
    </button>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #d1d5db",
  fontSize: 14,
  background: "#fff",
};

const buttonStyle: React.CSSProperties = {
  height: 42,
  borderRadius: 10,
  border: "1px solid #111827",
  background: "#111827",
  color: "#fff",
  fontWeight: 700,
  padding: "0 16px",
  cursor: "pointer",
};

const secondaryButtonStyle: React.CSSProperties = {
  height: 42,
  borderRadius: 10,
  border: "1px solid #d1d5db",
  background: "#fff",
  color: "#111",
  fontWeight: 700,
  padding: "0 16px",
  cursor: "pointer",
};

const dangerButtonStyle: React.CSSProperties = {
  height: 36,
  borderRadius: 10,
  border: "1px solid #dc2626",
  background: "#fff",
  color: "#dc2626",
  fontWeight: 700,
  padding: "0 12px",
  cursor: "pointer",
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  fontSize: 13,
  color: "#666",
  borderBottom: "1px solid #e5e7eb",
  padding: "10px 12px",
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  fontSize: 14,
  borderBottom: "1px solid #f1f5f9",
  padding: "12px",
  whiteSpace: "nowrap",
  verticalAlign: "top",
};
