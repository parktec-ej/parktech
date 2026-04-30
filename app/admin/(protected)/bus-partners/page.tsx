"use client";

import { useEffect, useState, type CSSProperties } from "react";

type BusPartner = {
  id: string;
  name: string;
  contact: string;
  phone: string;
  email: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

type ListResponse = {
  ok: boolean;
  partners?: BusPartner[];
  error?: string;
  message?: string;
};

type SinglePartnerResponse = {
  ok: boolean;
  partner?: BusPartner;
  error?: string;
  message?: string;
};

const emptyForm = { name: "", contact: "", phone: "", email: "" };

export default function BusPartnersPage() {
  const [partners, setPartners] = useState<BusPartner[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [notice, setNotice] = useState("");

  const [createForm, setCreateForm] = useState(emptyForm);
  const [creating, setCreating] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState(emptyForm);
  const [savingId, setSavingId] = useState<string | null>(null);

  async function loadPartners() {
    setLoading(true);
    setErr("");
    try {
      const res = await fetch("/api/admin/bus-partners", { cache: "no-store" });
      const json: ListResponse = await res.json();
      if (!res.ok || !json.ok) {
        setErr(json.message || json.error || "取得に失敗しました");
        return;
      }
      setPartners(json.partners ?? []);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPartners();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setNotice("");
    setCreating(true);

    try {
      const res = await fetch("/api/admin/bus-partners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createForm),
      });
      const json: SinglePartnerResponse = await res.json();
      if (!res.ok || !json.ok) {
        setErr(json.message || json.error || "登録に失敗しました");
        return;
      }
      setCreateForm(emptyForm);
      setNotice("業者を登録しました");
      loadPartners();
    } finally {
      setCreating(false);
    }
  }

  function startEdit(p: BusPartner) {
    setEditingId(p.id);
    setEditForm({
      name: p.name,
      contact: p.contact,
      phone: p.phone,
      email: p.email,
    });
    setErr("");
    setNotice("");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm(emptyForm);
  }

  async function saveEdit(id: string) {
    setErr("");
    setNotice("");
    setSavingId(id);
    try {
      const res = await fetch(`/api/admin/bus-partners/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      const json: SinglePartnerResponse = await res.json();
      if (!res.ok || !json.ok) {
        setErr(json.message || json.error || "更新に失敗しました");
        return;
      }
      setEditingId(null);
      setEditForm(emptyForm);
      setNotice("業者情報を更新しました");
      loadPartners();
    } finally {
      setSavingId(null);
    }
  }

  async function toggleActive(p: BusPartner) {
    setErr("");
    setNotice("");
    setSavingId(p.id);
    try {
      const res = await fetch(`/api/admin/bus-partners/${p.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !p.isActive }),
      });
      const json: SinglePartnerResponse = await res.json();
      if (!res.ok || !json.ok) {
        setErr(json.message || json.error || "切替に失敗しました");
        return;
      }
      setNotice(p.isActive ? "無効化しました" : "有効化しました");
      loadPartners();
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div style={pageStyle}>
      <div style={headerRowStyle}>
        <div>
          <h1 style={titleStyle}>バス業者管理</h1>
          <p style={subtitleStyle}>業者の登録・編集・有効/無効切替</p>
        </div>
      </div>

      {err ? <div style={errorStyle}>{err}</div> : null}
      {notice ? <div style={noticeStyle}>{notice}</div> : null}

      <section style={cardStyle}>
        <h2 style={sectionTitleStyle}>新規追加</h2>
        <form onSubmit={handleCreate} style={formGridStyle}>
          <div style={fieldStyle}>
            <label style={labelStyle}>会社名</label>
            <input
              value={createForm.name}
              onChange={(e) =>
                setCreateForm({ ...createForm, name: e.target.value })
              }
              style={inputStyle}
              placeholder="例: ホテル利府"
            />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>担当者名</label>
            <input
              value={createForm.contact}
              onChange={(e) =>
                setCreateForm({ ...createForm, contact: e.target.value })
              }
              style={inputStyle}
              placeholder="例: 田中 太郎"
            />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>電話番号</label>
            <input
              value={createForm.phone}
              onChange={(e) =>
                setCreateForm({ ...createForm, phone: e.target.value })
              }
              style={inputStyle}
              placeholder="例: 022-345-6789"
            />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>メールアドレス</label>
            <input
              type="email"
              value={createForm.email}
              onChange={(e) =>
                setCreateForm({ ...createForm, email: e.target.value })
              }
              style={inputStyle}
              placeholder="例: hotel@example.com"
            />
          </div>
          <div style={submitRowStyle}>
            <button type="submit" style={primaryButtonStyle} disabled={creating}>
              {creating ? "登録中..." : "業者を追加"}
            </button>
          </div>
        </form>
      </section>

      <section style={cardStyle}>
        <h2 style={sectionTitleStyle}>業者一覧</h2>
        <div style={tableWrapStyle}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>会社名</th>
                <th style={thStyle}>担当者</th>
                <th style={thStyle}>電話</th>
                <th style={thStyle}>メール</th>
                <th style={thStyle}>状態</th>
                <th style={thStyle}>操作</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td style={emptyStyle} colSpan={6}>読み込み中...</td>
                </tr>
              ) : partners.length === 0 ? (
                <tr>
                  <td style={emptyStyle} colSpan={6}>業者が登録されていません</td>
                </tr>
              ) : (
                partners.map((p) => {
                  const isEditing = editingId === p.id;
                  const isSaving = savingId === p.id;

                  return (
                    <tr
                      key={p.id}
                      style={{ background: p.isActive ? "#fff" : "#f9fafb" }}
                    >
                      {isEditing ? (
                        <>
                          <td style={tdStyle}>
                            <input
                              value={editForm.name}
                              onChange={(e) =>
                                setEditForm({ ...editForm, name: e.target.value })
                              }
                              style={editInputStyle}
                            />
                          </td>
                          <td style={tdStyle}>
                            <input
                              value={editForm.contact}
                              onChange={(e) =>
                                setEditForm({ ...editForm, contact: e.target.value })
                              }
                              style={editInputStyle}
                            />
                          </td>
                          <td style={tdStyle}>
                            <input
                              value={editForm.phone}
                              onChange={(e) =>
                                setEditForm({ ...editForm, phone: e.target.value })
                              }
                              style={editInputStyle}
                            />
                          </td>
                          <td style={tdStyle}>
                            <input
                              type="email"
                              value={editForm.email}
                              onChange={(e) =>
                                setEditForm({ ...editForm, email: e.target.value })
                              }
                              style={editInputStyle}
                            />
                          </td>
                          <td style={tdStyle}>
                            <span
                              style={{
                                ...badgeStyle,
                                background: p.isActive ? "#dcfce7" : "#fee2e2",
                                color: p.isActive ? "#166534" : "#991b1b",
                              }}
                            >
                              {p.isActive ? "有効" : "無効"}
                            </span>
                          </td>
                          <td style={tdStyle}>
                            <div style={buttonRowStyle}>
                              <button
                                type="button"
                                onClick={() => saveEdit(p.id)}
                                disabled={isSaving}
                                style={smallPrimaryButtonStyle}
                              >
                                {isSaving ? "保存中..." : "保存"}
                              </button>
                              <button
                                type="button"
                                onClick={cancelEdit}
                                style={smallSecondaryButtonStyle}
                              >
                                取消
                              </button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td style={tdStyle}>{p.name}</td>
                          <td style={tdStyle}>{p.contact}</td>
                          <td style={tdStyle}>{p.phone}</td>
                          <td style={tdStyle}>{p.email}</td>
                          <td style={tdStyle}>
                            <span
                              style={{
                                ...badgeStyle,
                                background: p.isActive ? "#dcfce7" : "#fee2e2",
                                color: p.isActive ? "#166534" : "#991b1b",
                              }}
                            >
                              {p.isActive ? "有効" : "無効"}
                            </span>
                          </td>
                          <td style={tdStyle}>
                            <div style={buttonRowStyle}>
                              <button
                                type="button"
                                onClick={() => startEdit(p)}
                                style={smallSecondaryButtonStyle}
                              >
                                編集
                              </button>
                              <button
                                type="button"
                                onClick={() => toggleActive(p)}
                                disabled={isSaving}
                                style={
                                  p.isActive
                                    ? smallDangerButtonStyle
                                    : smallPrimaryButtonStyle
                                }
                              >
                                {isSaving ? "..." : p.isActive ? "無効化" : "有効化"}
                              </button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

const pageStyle: CSSProperties = { padding: 24 };
const headerRowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 16,
  marginBottom: 20,
  flexWrap: "wrap",
};
const titleStyle: CSSProperties = { fontSize: 28, fontWeight: 800, margin: 0 };
const subtitleStyle: CSSProperties = {
  marginTop: 8,
  color: "#6b7280",
  fontSize: 14,
};
const cardStyle: CSSProperties = {
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 16,
  padding: 16,
  marginBottom: 16,
};
const sectionTitleStyle: CSSProperties = {
  fontSize: 18,
  fontWeight: 800,
  margin: 0,
  marginBottom: 12,
};
const noticeStyle: CSSProperties = {
  background: "#f0fdf4",
  border: "1px solid #bbf7d0",
  color: "#166534",
  borderRadius: 12,
  padding: "12px 14px",
  marginBottom: 16,
  fontWeight: 700,
};
const errorStyle: CSSProperties = {
  background: "#fef2f2",
  border: "1px solid #fecaca",
  color: "#991b1b",
  borderRadius: 12,
  padding: "12px 14px",
  marginBottom: 16,
  fontWeight: 700,
};
const formGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};
const fieldStyle: CSSProperties = { display: "grid", gap: 6 };
const labelStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: "#374151",
};
const inputStyle: CSSProperties = {
  width: "100%",
  border: "1px solid #d1d5db",
  borderRadius: 10,
  padding: "10px 12px",
  fontSize: 14,
  background: "#fff",
};
const editInputStyle: CSSProperties = {
  width: "100%",
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  padding: "6px 8px",
  fontSize: 13,
  background: "#fff",
};
const submitRowStyle: CSSProperties = {
  gridColumn: "1 / -1",
  display: "flex",
  justifyContent: "flex-end",
};
const primaryButtonStyle: CSSProperties = {
  borderRadius: 12,
  padding: "10px 18px",
  background: "#0f172a",
  color: "#fff",
  border: "none",
  fontWeight: 800,
  cursor: "pointer",
};
const tableWrapStyle: CSSProperties = { overflowX: "auto" };
const tableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  minWidth: 840,
};
const thStyle: CSSProperties = {
  textAlign: "left",
  padding: "12px 10px",
  borderBottom: "1px solid #e5e7eb",
  fontSize: 13,
  color: "#6b7280",
  fontWeight: 700,
  whiteSpace: "nowrap",
};
const tdStyle: CSSProperties = {
  padding: "12px 10px",
  borderBottom: "1px solid #f1f5f9",
  verticalAlign: "middle",
  fontSize: 14,
};
const emptyStyle: CSSProperties = {
  padding: 24,
  textAlign: "center",
  color: "#6b7280",
};
const badgeStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  borderRadius: 999,
  padding: "3px 10px",
  fontSize: 12,
  fontWeight: 800,
};
const buttonRowStyle: CSSProperties = { display: "flex", gap: 8 };
const smallPrimaryButtonStyle: CSSProperties = {
  borderRadius: 8,
  padding: "6px 12px",
  background: "#111827",
  color: "#fff",
  border: "none",
  fontWeight: 700,
  fontSize: 13,
  cursor: "pointer",
};
const smallSecondaryButtonStyle: CSSProperties = {
  borderRadius: 8,
  padding: "6px 12px",
  background: "#fff",
  color: "#111827",
  border: "1px solid #d1d5db",
  fontWeight: 700,
  fontSize: 13,
  cursor: "pointer",
};
const smallDangerButtonStyle: CSSProperties = {
  borderRadius: 8,
  padding: "6px 12px",
  background: "#fff",
  color: "#b91c1c",
  border: "1px solid #fecaca",
  fontWeight: 700,
  fontSize: 13,
  cursor: "pointer",
};
