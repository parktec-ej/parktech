"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ReservationCard, { unexitBadge } from "../_components/ReservationCard";

function ymdTodayJst() {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}

type ReservationItem = {
  id: string;
  date: string;
  slot: string;
  customerName: string;
  plate: string;
  email: string | null;
  phone: string | null;
  price: number;
  pin: string;
  paid: boolean;
  paidAt: string | null;
  checkedIn: boolean;
  checkedInAt: string | null;
  checkedOutAt: string | null;
  unexitNoticeSentAt: string | null;
  unexitAckAt: string | null;
  selfCheckedOut: boolean;
  createdAt: string;
  spotId: string | null;
  qrToken: string;
  status: "UNPAID" | "RESERVED" | "CHECKED_IN" | "CHECKED_OUT" | "CANCELED";
  spot: {
    id: string;
    code: string;
    label: string | null;
  } | null;
  changeLogs?: {
    id: string;
    oldDate: string;
    newDate: string;
    changedAt: string;
    changedBy: string;
    reason: string | null;
  }[];
};

type ApiResponse = {
  ok: boolean;
  place?: {
    id: string;
    slug: string;
    name: string;
    address: string | null;
  };
  date?: string;
  filters?: {
    status: string;
    q: string;
    sort: string;
  };
  summary?: {
    total: number;
    unpaid: number;
    reserved: number;
    checkedIn: number;
    checkedOut: number;
  };
  reservations?: ReservationItem[];
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
  router.replace(qs ? `/admin/reservations?${qs}` : "/admin/reservations", {
    scroll: false,
  });
}

function AdminReservationsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const initialDate = searchParams.get("date") || ymdTodayJst();
  const initialStatus = searchParams.get("status") || "ALL";
  const initialSort = searchParams.get("sort") || "slot_asc";
  const initialQ = searchParams.get("q") || "";
  const initialPlaceId = searchParams.get("placeId") || "";
  const initialUnexit = searchParams.get("unexit") === "1";

  const [placeId, setPlaceId] = useState(initialPlaceId);
  const [date, setDate] = useState(initialDate);
  const [status, setStatus] = useState(initialStatus);
  const [sort, setSort] = useState(initialSort);
  const [qInput, setQInput] = useState(initialQ);
  const [qApplied, setQApplied] = useState(initialQ);
  const [unexitOnly, setUnexitOnly] = useState(initialUnexit);

  const [placesLoading, setPlacesLoading] = useState(true);
  const [placesErr, setPlacesErr] = useState("");
  const [places, setPlaces] = useState<PlaceOption[]>([]);

  const [loading, setLoading] = useState(true);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [data, setData] = useState<ApiResponse | null>(null);

  const [changeDateId, setChangeDateId] = useState<string | null>(null);
  const [changeDateValue, setChangeDateValue] = useState("");
  const [changeDateReason, setChangeDateReason] = useState("");

  const currentSearchParams = useMemo(
    () => new URLSearchParams(searchParams.toString()),
    [searchParams]
  );

  // バス Place（slug が -bus で終わる）は日付選択なし・全日程表示
  const selectedPlace = useMemo(
    () => places.find((p) => p.id === placeId) ?? null,
    [places, placeId]
  );
  const isBusPlace = (selectedPlace?.slug ?? "").endsWith("-bus");

  // 「未出庫のみ」ONのときは、未出庫対応バッジが付く行だけを表示
  const visibleReservations = useMemo(() => {
    const list = data?.reservations ?? [];
    return unexitOnly ? list.filter((r) => unexitBadge(r) !== null) : list;
  }, [data, unexitOnly]);

  async function loadPlaces() {
    setPlacesLoading(true);
    setPlacesErr("");

    try {
      const res = await fetch("/api/admin/places", {
        cache: "no-store",
      });

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
        setPlacesErr(json?.message ?? json?.error ?? "Place一覧の取得に失敗しました");
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
          date,
          status,
          sort,
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

  async function loadReservations(target: {
    placeId: string;
    date: string;
    status: string;
    sort: string;
    q: string;
    unexitOnly?: boolean;
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
      const targetPlace = places.find((p) => p.id === target.placeId);
      const isBus = (targetPlace?.slug ?? "").endsWith("-bus");
      // 未出庫のみ表示は過去日にまたがるため、拠点の全日程を取得する
      const dateParam = isBus || target.unexitOnly ? "ALL" : target.date;

      const params = new URLSearchParams({
        placeId: target.placeId,
        date: dateParam,
        status: target.status,
        sort: target.sort,
      });

      if (target.q) {
        params.set("q", target.q);
      }

      const res = await fetch(`/api/admin/reservations?${params.toString()}`, {
        cache: "no-store",
      });

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
      date,
      status,
      sort,
      q: qApplied,
      unexit: unexitOnly ? "1" : "",
    });

    loadReservations({
      placeId,
      date,
      status,
      sort,
      q: qApplied,
      unexitOnly,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placeId, date, status, sort, qApplied, unexitOnly]);

  async function doCancel(reservationId: string) {
    if (!confirm("この予約をキャンセルしますか？")) return;

    setActionBusyId(reservationId);
    setErr("");
    setMsg("");

    try {
      const res = await fetch("/api/admin/reservations/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reservationId }),
      });

      const text = await res.text();
      let json: any = null;

      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        setErr(`キャンセルAPIがJSONを返していません (${res.status})`);
        return;
      }

      if (!json?.ok) {
        setErr(json?.message ?? json?.error ?? "キャンセルに失敗しました");
        return;
      }

      setMsg("予約をキャンセルしました");
      await loadReservations({ placeId, date, status, sort, q: qApplied });
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setActionBusyId(null);
    }
  }

  async function doAdminDateChange(reservationId: string) {
    if (!changeDateValue) {
      setErr("日付を入力してください");
      return;
    }
    if (!confirm(`日付を ${changeDateValue} に変更しますか？`)) return;

    setActionBusyId(reservationId);
    setErr("");
    setMsg("");

    try {
      const res = await fetch("/api/admin/reservations/change-date", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reservationId,
          newDate: changeDateValue,
          reason: changeDateReason || "管理者による代理変更",
        }),
      });

      const text = await res.text();
      let json: any = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        setErr(`日付変更APIがJSONを返していません (${res.status})`);
        return;
      }

      if (!json?.ok) {
        setErr(json?.message ?? json?.error ?? "日付変更に失敗しました");
        return;
      }

      setMsg(`日付を ${json.newDate} に変更しました（区画: ${json.newSpotLabel ?? "-"}）`);
      setChangeDateId(null);
      setChangeDateValue("");
      setChangeDateReason("");
      await loadReservations({ placeId, date, status, sort, q: qApplied });
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setActionBusyId(null);
    }
  }

  async function doForceCheckout(reservationId: string) {
    if (!confirm("この予約を強制出庫しますか？")) return;

    setActionBusyId(reservationId);
    setErr("");
    setMsg("");

    try {
      const res = await fetch("/api/admin/reservations/force-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reservationId }),
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
      await loadReservations({ placeId, date, status, sort, q: qApplied });
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setActionBusyId(null);
    }
  }

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: 24 }}>
      <h1 style={{ fontSize: 28, fontWeight: 900, marginBottom: 8 }}>
        予約一覧
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
          marginBottom: 20,
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "220px 180px 180px 180px 1fr auto",
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
              style={{
                width: "100%",
                padding: 10,
                borderRadius: 10,
                border: "1px solid #d1d5db",
                background: "#fff",
              }}
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
              日付
            </div>
            {isBusPlace ? (
              <div
                style={{
                  padding: 10,
                  borderRadius: 10,
                  border: "1px solid #d1d5db",
                  background: "#f9fafb",
                  color: "#666",
                }}
              >
                全日程を表示
              </div>
            ) : (
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                style={{
                  width: "100%",
                  padding: 10,
                  borderRadius: 10,
                  border: "1px solid #d1d5db",
                }}
              />
            )}
          </div>

          <div>
            <div style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>
              状態
            </div>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              style={{
                width: "100%",
                padding: 10,
                borderRadius: 10,
                border: "1px solid #d1d5db",
                background: "#fff",
              }}
            >
              <option value="ALL">ALL</option>
              <option value="UNPAID">未決済</option>
              <option value="RESERVED">予約済み</option>
              <option value="CHECKED_IN">入庫中</option>
              <option value="CHECKED_OUT">出庫済み</option>
              <option value="CANCELED">キャンセル済み</option>
            </select>
          </div>

          <div>
            <div style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>
              並び順
            </div>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              style={{
                width: "100%",
                padding: 10,
                borderRadius: 10,
                border: "1px solid #d1d5db",
                background: "#fff",
              }}
            >
              <option value="slot_asc">区画 昇順</option>
              <option value="slot_desc">区画 降順</option>
              <option value="created_desc">作成 新しい順</option>
              <option value="created_asc">作成 古い順</option>
              <option value="price_desc">金額 高い順</option>
              <option value="price_asc">金額 安い順</option>
              <option value="status">状態順</option>
            </select>
          </div>

          <div>
            <div style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>
              検索（区画 / 氏名 / ナンバー / メール）
            </div>
            <input
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") setQApplied(qInput.trim());
              }}
              placeholder="例: A-04 / テスト / 宮城300"
              style={{
                width: "100%",
                padding: 10,
                borderRadius: 10,
                border: "1px solid #d1d5db",
              }}
            />
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => setQApplied(qInput.trim())}
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid #111",
                background: "#111",
                color: "#fff",
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              検索
            </button>

            <button
              onClick={() => {
                setQInput("");
                setQApplied("");
                loadReservations({ placeId, date, status, sort, q: "" });
                updateUrl(router, currentSearchParams, {
                  placeId,
                  date,
                  status,
                  sort,
                  q: "",
                });
              }}
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid #d1d5db",
                background: "#fff",
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              クリア
            </button>
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          <button
            type="button"
            onClick={() => setUnexitOnly((v) => !v)}
            style={{
              padding: "10px 16px",
              borderRadius: 999,
              border: `1px solid ${unexitOnly ? "#9a3412" : "#d1d5db"}`,
              background: unexitOnly ? "#9a3412" : "#fff",
              color: unexitOnly ? "#fff" : "#374151",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            {unexitOnly ? "☑ 未出庫のみ表示中" : "☐ 未出庫のみ"}
          </button>
          {unexitOnly ? (
            <span style={{ marginLeft: 10, fontSize: 12, color: "#666" }}>
              ※ 対応が必要な件（🔵通知済み / 🟠まだ駐車中 / 🟢自己申告）を拠点の全日程から表示。日付・状態の絞り込みは無視されます。
            </span>
          ) : null}
        </div>

        {placesErr ? (
          <div style={{ marginTop: 12, color: "crimson", fontWeight: 700 }}>
            {placesErr}
          </div>
        ) : null}

        {data?.summary ? (
          <div
            style={{
              display: "flex",
              gap: 12,
              flexWrap: "wrap",
              marginTop: 16,
            }}
          >
            {unexitOnly ? (
              <div
                style={{
                  padding: "10px 14px",
                  borderRadius: 999,
                  background: "#ffedd5",
                  color: "#9a3412",
                  fontWeight: 800,
                }}
              >
                未出庫（要対応） {visibleReservations.length}
              </div>
            ) : null}
            <div
              style={{
                padding: "10px 14px",
                borderRadius: 999,
                background: "#f3f4f6",
                fontWeight: 700,
              }}
            >
              合計 {data.summary.total}
            </div>
            <div
              style={{
                padding: "10px 14px",
                borderRadius: 999,
                background: "#fff7ed",
                fontWeight: 700,
              }}
            >
              未決済 {data.summary.unpaid}
            </div>
            <div
              style={{
                padding: "10px 14px",
                borderRadius: 999,
                background: "#eef6ff",
                fontWeight: 700,
              }}
            >
              予約済み {data.summary.reserved}
            </div>
            <div
              style={{
                padding: "10px 14px",
                borderRadius: 999,
                background: "#ecfdf3",
                fontWeight: 700,
              }}
            >
              入庫中 {data.summary.checkedIn}
            </div>
            <div
              style={{
                padding: "10px 14px",
                borderRadius: 999,
                background: "#f9fafb",
                fontWeight: 700,
              }}
            >
              出庫済み {data.summary.checkedOut}
            </div>
          </div>
        ) : null}
      </div>

      {msg ? (
        <div style={{ marginBottom: 14, color: "green", fontWeight: 700 }}>
          {msg}
        </div>
      ) : null}

      {err ? (
        <div style={{ marginBottom: 14, color: "crimson", fontWeight: 700 }}>
          {err}
        </div>
      ) : null}

      {loading ? (
        <div>読み込み中...</div>
      ) : !placeId ? (
        <div
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: 16,
            background: "#fff",
            padding: 20,
          }}
        >
          Place を選択してください。
        </div>
      ) : visibleReservations.length === 0 ? (
        <div
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: 16,
            background: "#fff",
            padding: 20,
          }}
        >
          {unexitOnly
            ? "対応が必要な未出庫はありません。"
            : "条件に一致する予約はありません。"}
        </div>
      ) : (
        <div style={{ display: "grid", gap: 14 }}>
          {visibleReservations.map((r) => (
            <ReservationCard
              key={r.id}
              item={r}
              busy={actionBusyId === r.id}
              onCancel={doCancel}
              onForceCheckout={doForceCheckout}
              dateChange={{
                openId: changeDateId,
                value: changeDateValue,
                reason: changeDateReason,
                onOpen: (id) => {
                  setChangeDateId(id);
                  setChangeDateValue("");
                  setChangeDateReason("");
                },
                onClose: () => {
                  setChangeDateId(null);
                  setChangeDateValue("");
                  setChangeDateReason("");
                },
                onChangeValue: setChangeDateValue,
                onChangeReason: setChangeDateReason,
                onSubmit: doAdminDateChange,
              }}
            />
          ))}
        </div>
      )}
    </main>
  );
}

export default function AdminReservationsPage() {
  return (
    <Suspense
      fallback={
        <main style={{ maxWidth: 1100, margin: "0 auto", padding: 24 }}>
          読み込み中...
        </main>
      }
    >
      <AdminReservationsPageInner />
    </Suspense>
  );
}