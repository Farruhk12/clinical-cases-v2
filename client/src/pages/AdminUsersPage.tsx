import { Navigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "@/auth-context";
import { apiFetch } from "@/lib/api-fetch";

type UserRow = {
  id: string;
  login: string;
  name: string | null;
  role: string;
  departmentId: string | null;
  departmentName: string | null;
};

type Dept = { id: string; name: string };

const roleBadge: Record<string, string> = {
  ADMIN: "bg-violet-100 text-violet-700",
  TEACHER: "bg-sky-100 text-sky-700",
};
const roleLabel: Record<string, string> = {
  ADMIN: "Админ",
  TEACHER: "Преподаватель",
};

function staffRole(u: UserRow): "ADMIN" | "TEACHER" {
  return u.role === "ADMIN" || u.role === "TEACHER" ? u.role : "TEACHER";
}

const emptyForm = {
  login: "",
  password: "",
  name: "",
  role: "TEACHER" as "ADMIN" | "TEACHER",
  departmentId: "",
};

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-brand-300 focus:ring-2 focus:ring-brand-200/50";

export function AdminUsersPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [departments, setDepartments] = useState<Dept[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [uRes, rRes] = await Promise.all([
        apiFetch("/api/admin/users"),
        apiFetch("/api/reference"),
      ]);
      if (!uRes.ok || !rRes.ok) {
        setError("Не удалось загрузить данные");
        return;
      }
      const uJson = await uRes.json();
      const rJson = await rRes.json();
      setUsers(uJson.users);
      setDepartments(rJson.departments);
      setError(null);
    } catch {
      setError("Ошибка сети");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user || user.role !== "ADMIN") return;
    let cancelled = false;
    load().then(() => {
      if (cancelled) return;
    });
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (!user) return null;
  if (user.role !== "ADMIN") return <Navigate to="/dashboard" replace />;
  if (loading) return <p className="text-slate-500">Загрузка...</p>;
  if (error)
    return (
      <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        {error}
      </p>
    );

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setFormError(null);
    setShowForm(true);
  };

  const openEdit = (u: UserRow) => {
    setEditingId(u.id);
    setForm({
      login: u.login,
      password: "",
      name: u.name ?? "",
      role: staffRole(u),
      departmentId: u.departmentId ?? "",
    });
    setFormError(null);
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormError(null);

    const payload: Record<string, unknown> = {
      login: form.login.trim(),
      name: form.name || null,
      role: form.role,
      departmentId: form.departmentId || null,
    };
    if (editingId) {
      if (form.password) payload.password = form.password;
    } else {
      payload.password = form.password;
    }

    try {
      const url = editingId
        ? `/api/admin/users/${editingId}`
        : "/api/admin/users";
      const method = editingId ? "PATCH" : "POST";
      const res = await apiFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) {
        setFormError(json.error || "Ошибка сохранения");
        return;
      }
      setShowForm(false);
      await load();
    } catch {
      setFormError("Ошибка сети");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (u: UserRow) => {
    if (!window.confirm(`Удалить пользователя ${u.login}?`)) return;
    try {
      const res = await apiFetch(`/api/admin/users/${u.id}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok) {
        alert(json.error || "Не удалось удалить");
        return;
      }
      await load();
    } catch {
      alert("Ошибка сети");
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl font-bold tracking-tight text-slate-900">
          Пользователи
        </h1>
        <button
          type="button"
          onClick={openCreate}
          className="rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700"
        >
          Создать пользователя
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-white/80 bg-white/90 p-6 shadow-card backdrop-blur-sm space-y-5"
        >
          <h2 className="font-display text-lg font-semibold text-slate-900">
            {editingId ? "Редактирование" : "Новый пользователь"}
          </h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-600">Логин</span>
              <input
                type="text"
                required
                minLength={1}
                maxLength={128}
                value={form.login}
                onChange={(e) => setForm({ ...form, login: e.target.value })}
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-600">
                Пароль{editingId ? " (пусто = не менять)" : ""}
              </span>
              <input
                type="password"
                required={!editingId}
                minLength={6}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-600">Имя</span>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-600">Роль</span>
              <select
                value={form.role}
                onChange={(e) =>
                  setForm({
                    ...form,
                    role: e.target.value as "ADMIN" | "TEACHER",
                  })
                }
                className={inputClass}
              >
                <option value="TEACHER">Преподаватель</option>
                <option value="ADMIN">Админ</option>
              </select>
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1.5 block text-sm font-medium text-slate-600">Кафедра</span>
              <select
                value={form.departmentId}
                onChange={(e) =>
                  setForm({ ...form, departmentId: e.target.value })
                }
                className={inputClass}
              >
                <option value="">— Без кафедры —</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {formError && (
            <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
              {formError}
            </p>
          )}

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700 disabled:opacity-60"
            >
              {saving ? "Сохранение..." : editingId ? "Сохранить" : "Создать"}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm text-slate-600 transition hover:bg-slate-50"
            >
              Отмена
            </button>
          </div>
        </form>
      )}

      {users.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 py-16 text-center">
          <p className="text-slate-400">Нет пользователей</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {users.map((u) => (
            <li
              key={u.id}
              className="flex items-center justify-between rounded-2xl border border-white/80 bg-white/90 px-5 py-4 shadow-card backdrop-blur-sm transition hover:border-brand-200/60"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-slate-900 truncate">
                    {u.name || "Без имени"}
                  </span>
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${roleBadge[u.role] ?? "bg-slate-100 text-slate-700"}`}
                  >
                    {roleLabel[u.role] ?? u.role}
                  </span>
                </div>
                <p className="mt-0.5 text-sm text-slate-500 truncate">
                  {u.login}
                  {u.departmentName ? ` · ${u.departmentName}` : ""}
                </p>
              </div>
              <div className="flex gap-2 ml-4 shrink-0">
                <button
                  type="button"
                  onClick={() => openEdit(u)}
                  className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-50"
                >
                  Изменить
                </button>
                {u.id !== user.id && (
                  <button
                    type="button"
                    onClick={() => handleDelete(u)}
                    className="rounded-xl border border-red-200 px-3 py-1.5 text-sm text-red-600 transition hover:bg-red-50"
                  >
                    Удалить
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
